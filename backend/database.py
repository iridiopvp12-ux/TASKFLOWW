import pg8000.dbapi
import bcrypt
import json
import os
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
from sqlalchemy import create_engine, pool

# Load environment variables
load_dotenv()

# ==========================================
# 🚨 CONFIGURAÇÃO DO BANCO DE DADOS
# ==========================================
# Reads from env or defaults to localhost dev
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASS = os.getenv("DB_PASS", "admin")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "taskflow")

RESET_DB_ON_START = False

# --- CONNECTION POOLING WITH SQLALCHEMY ---
# Construct connection string
DATABASE_URL = f"postgresql+pg8000://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# Create Engine with Pooling
# pool_size=10: Maintain 10 open connections
# max_overflow=20: Allow 20 more during spikes
engine = create_engine(
    DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_timeout=30,
    pool_recycle=1800 # Recycle connections every 30 mins
)

def get_db():
    """
    Returns a raw DBAPI connection from the SQLAlchemy pool.
    Usage in routers:
        conn = get_db()
        try: ... finally: conn.close()
    """
    # engine.raw_connection() returns the underlying pg8000 connection
    return engine.raw_connection()

def row_to_dict(cursor) -> List[Dict[str, Any]]:
    if not cursor.description: return []
    columns = [d[0] for d in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]

def row_to_one(cursor) -> Optional[Dict[str, Any]]:
    rows = cursor.fetchall()
    if not rows: return None
    columns = [d[0] for d in cursor.description]
    return dict(zip(columns, rows[0]))

def hash_pass(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_pass(plain: str, hashed: str) -> bool:
    if not hashed: return False
    try: return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except: return False

def init_db():
    print(">>> INICIANDO VERIFICAÇÃO DO BANCO...")
    try:
        # Use raw connection for DDL
        conn = get_db()
        cur = conn.cursor()

        if RESET_DB_ON_START:
            print(">>> ☢️ MODO RESET ATIVADO: Apagando tabelas antigas...")
            cur.execute("DROP TABLE IF EXISTS users CASCADE")
            cur.execute("DROP TABLE IF EXISTS companies CASCADE")
            cur.execute("DROP TABLE IF EXISTS tasks CASCADE")
            cur.execute("DROP TABLE IF EXISTS standard_tasks CASCADE")
            cur.execute("DROP TABLE IF EXISTS notifications CASCADE")
            cur.execute("DROP TABLE IF EXISTS messages CASCADE")
            cur.execute("DROP TABLE IF EXISTS task_subtasks CASCADE")
            cur.execute("DROP TABLE IF EXISTS task_comments CASCADE")
            conn.commit()
            print(">>> Tabelas antigas removidas com sucesso.")

        print(">>> Criando novas tabelas...")
        cur.execute("""CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            name TEXT,
            role TEXT,
            "role_desc" TEXT,
            initials TEXT,
            color TEXT,
            password_hash TEXT
        )""")

        cur.execute("""CREATE TABLE IF NOT EXISTS companies (
            id SERIAL PRIMARY KEY, name TEXT, default_assignee INTEGER,
            templates JSONB DEFAULT '[]'::jsonb
        )""")

        # Main Tasks Table
        cur.execute("""CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY, description TEXT, due_date TEXT,
            assigned_to INTEGER, priority TEXT, company_id INTEGER,
            status TEXT, completed_at TEXT, recurrence TEXT,
            recurrence_day INTEGER, subtasks JSONB DEFAULT '[]'::jsonb
        )""")
        conn.commit()

        # Add comments column if not exists (Legacy support)
        try:
            cur.execute("ALTER TABLE tasks ADD COLUMN comments JSONB DEFAULT '[]'::jsonb")
            conn.commit()
        except Exception:
            conn.rollback()

        # --- NORMALIZED SUBTASKS ---
        cur.execute("""CREATE TABLE IF NOT EXISTS task_subtasks (
            id SERIAL PRIMARY KEY,
            task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
            text TEXT,
            done BOOLEAN DEFAULT FALSE,
            done_by INTEGER,
            done_at TEXT
        )""")

        # --- NORMALIZED COMMENTS ---
        cur.execute("""CREATE TABLE IF NOT EXISTS task_comments (
            id SERIAL PRIMARY KEY,
            task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
            text TEXT,
            author_id INTEGER,
            created_at TEXT
        )""")

        # --- NOVA TABELA PARA OS PADRÕES ---
        cur.execute("""CREATE TABLE IF NOT EXISTS standard_tasks (
            id SERIAL PRIMARY KEY,
            title TEXT NOT NULL,
            recurrence TEXT,
            subtasks JSONB DEFAULT '[]'::jsonb
        )""")

        # --- NOVA TABELA PARA NOTIFICAÇÕES ---
        cur.execute("""CREATE TABLE IF NOT EXISTS notifications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER,
            text TEXT,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TEXT,
            task_id INTEGER
        )""")

        # --- NOVA TABELA PARA CHAT (MESSAGES) ---
        cur.execute("""CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            sender_id INTEGER,
            target_id INTEGER,
            type TEXT,
            content TEXT,
            attachment TEXT,
            created_at TEXT
        )""")
        conn.commit()

        # 🛡️ MIGRAÇÃO CHAT v2: Adicionar colunas novas se não existirem
        chat_cols = [
            ("files", "JSONB DEFAULT '[]'::jsonb"),
            ("reactions", "JSONB DEFAULT '{}'::jsonb"),
            ("reply_to_id", "INTEGER"),
            ("seen", "BOOLEAN DEFAULT FALSE"),
            ("deleted", "BOOLEAN DEFAULT FALSE"),
            ("edited", "BOOLEAN DEFAULT FALSE"),
            ("distributed", "BOOLEAN DEFAULT TRUE"),
            ("saved", "BOOLEAN DEFAULT TRUE"),
            ("failure", "BOOLEAN DEFAULT FALSE"),
            ("room_id", "TEXT")
        ]

        for col_name, col_def in chat_cols:
            try:
                cur.execute(f"ALTER TABLE messages ADD COLUMN {col_name} {col_def}")
                conn.commit()
            except Exception:
                conn.rollback()

        # --- NOVAS TABELAS PARA GRUPOS ---
        try:
            cur.execute("""CREATE TABLE IF NOT EXISTS chat_rooms (
                id TEXT PRIMARY KEY,
                name TEXT,
                avatar TEXT,
                created_by INTEGER,
                created_at TEXT
            )""")
            cur.execute("""CREATE TABLE IF NOT EXISTS chat_room_members (
                id SERIAL PRIMARY KEY,
                room_id TEXT,
                user_id INTEGER,
                joined_at TEXT,
                UNIQUE(room_id, user_id)
            )""")
            conn.commit()
        except Exception as e:
            print(f"⚠️ Erro ao criar tabelas de chat: {e}")
            conn.rollback()

        # --- NOVAS TABELAS PARA SETORES (MIGRAÇÃO) ---
        try:
            cur.execute("""CREATE TABLE IF NOT EXISTS sectors (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL
            )""")
            cur.execute("""CREATE TABLE IF NOT EXISTS task_assignees (
                task_id INTEGER,
                user_id INTEGER,
                PRIMARY KEY (task_id, user_id)
            )""")
            conn.commit()
        except Exception as e:
            print(f"⚠️ Erro ao criar tabelas de setores: {e}")
            conn.rollback()

        # Adiciona coluna sector_id em users
        try:
            cur.execute("ALTER TABLE users ADD COLUMN sector_id INTEGER")
            conn.commit()
        except Exception: conn.rollback()

        # Adiciona coluna sector_id em tasks
        try:
            cur.execute("ALTER TABLE tasks ADD COLUMN sector_id INTEGER")
            conn.commit()
        except Exception: conn.rollback()

        # Adiciona coluna recurrence_active em tasks (Padrão TRUE)
        try:
            cur.execute("ALTER TABLE tasks ADD COLUMN recurrence_active BOOLEAN DEFAULT TRUE")
            conn.commit()
        except Exception: conn.rollback()

        # Adiciona coluna due_offset em tasks (Padrão 0)
        try:
            cur.execute("ALTER TABLE tasks ADD COLUMN due_offset INTEGER DEFAULT 0")
            conn.commit()
        except Exception: conn.rollback()

        # Cria admin se não existir
        cur.execute("SELECT * FROM users WHERE role='admin'")
        if not cur.fetchone():
            h = hash_pass("123")
            cur.execute("INSERT INTO users (name, role, \"role_desc\", initials, color, password_hash) VALUES (%s, %s, %s, %s, %s, %s)",
                        ("Administrador", "admin", "Diretoria", "AD", "#ef4444", h))
            conn.commit()
            print(">>> ✅ ADMIN RECRIADO: Senha '123'")

        cur.close()
        conn.close()
        print(">>> SISTEMA ONLINE E LIMPO! 🚀")

    except Exception as e:
        print(f"❌ ERRO GRAVE NO BANCO: {e}")
