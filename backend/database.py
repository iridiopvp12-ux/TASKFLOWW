import pg8000.dbapi
import bcrypt
import json
from typing import List, Dict, Any, Optional

# ==========================================
# 🚨 CONFIGURAÇÃO DO BANCO DE DADOS
# ==========================================
DB_CONFIG = {
    "user": "postgres",
    "password": "admin",
    "host": "localhost",
    "port": 5432,
    "database": "taskflow"
}

RESET_DB_ON_START = False # Mantenha como False após o primeiro reset bem-sucedido

def get_db():
    return pg8000.dbapi.connect(**DB_CONFIG)

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

        cur.execute("""CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY, description TEXT, due_date TEXT,
            assigned_to INTEGER, priority TEXT, company_id INTEGER,
            status TEXT, completed_at TEXT, recurrence TEXT,
            recurrence_day INTEGER, subtasks JSONB DEFAULT '[]'::jsonb
        )""")

        # Add comments column if not exists
        try:
            cur.execute("ALTER TABLE tasks ADD COLUMN comments JSONB DEFAULT '[]'::jsonb")
            conn.commit()
            print(">>> Coluna 'comments' adicionada.")
        except Exception:
            conn.rollback() # Ignora erro se já existe

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

        # Cria admin se não existir
        cur.execute("SELECT * FROM users WHERE role='admin'")
        if not cur.fetchone():
            h = hash_pass("123")
            # Inserção também usa aspas duplas no nome da coluna
            cur.execute("INSERT INTO users (name, role, \"role_desc\", initials, color, password_hash) VALUES (%s, %s, %s, %s, %s, %s)",
                        ("Administrador", "admin", "Diretoria", "AD", "#ef4444", h))
            conn.commit()
            print(">>> ✅ ADMIN RECRIADO: Senha '123'")

        cur.close()
        conn.close()
        print(">>> SISTEMA ONLINE E LIMPO! 🚀")

    except Exception as e:
        print(f"❌ ERRO GRAVE NO BANCO: {e}")