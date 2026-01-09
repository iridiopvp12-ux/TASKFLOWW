import sqlite3
import json
import os
import re
from typing import List, Dict, Any, Optional

# Constants
DB_NAME = "taskflow.db"

class SQLiteProxyCursor:
    def __init__(self, cursor):
        self.cursor = cursor
        self.description = None

    def execute(self, sql, params=None):
        # 1. Replace Placeholders (%s -> ?)
        sql = sql.replace('%s', '?')

        # 2. Clean Casts
        sql = re.sub(r'::jsonb', '', sql)
        sql = re.sub(r'::json', '', sql)

        # 3. Handle ILIKE -> LIKE
        sql = re.sub(r'\bILIKE\b', 'LIKE', sql, flags=re.IGNORECASE)

        # 4. Handle json_agg -> json_group_array
        sql = sql.replace('json_agg', 'json_group_array')

        # 5. Handle COALESCE(..., '[]') for JSON
        # Postgres: COALESCE(..., '[]'::json) -> SQLite: COALESCE(..., '[]')

        try:
            if params:
                # Handle Dict/List -> JSON string for TEXT columns
                new_params = []
                for p in params:
                    if isinstance(p, (dict, list)):
                        new_params.append(json.dumps(p))
                    else:
                        new_params.append(p)
                self.cursor.execute(sql, tuple(new_params))
            else:
                self.cursor.execute(sql)

            self.description = self.cursor.description
            return self
        except Exception as e:
            print(f"SQL ERROR: {e}\nQuery: {sql}\nParams: {params}")
            raise e

    def fetchone(self):
        return self.cursor.fetchone()

    def fetchall(self):
        return self.cursor.fetchall()

    def close(self):
        self.cursor.close()

class SQLiteProxyConnection:
    def __init__(self, db_path):
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")

    def cursor(self):
        return SQLiteProxyCursor(self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

def get_db():
    return SQLiteProxyConnection(DB_NAME)

# --- MOCK BCRYPT ---
import bcrypt

def hash_pass(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_pass(plain: str, hashed: str) -> bool:
    if not hashed: return False
    try: return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except: return False

def init_db():
    print(">>> INICIANDO VERIFICAÇÃO DO BANCO (SQLITE MODE)...")
    try:
        conn = get_db()
        cur = conn.cursor()

        # Users
        cur.execute("""CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            role TEXT,
            "role_desc" TEXT,
            initials TEXT,
            color TEXT,
            password_hash TEXT,
            sector_id INTEGER
        )""")

        # Companies
        cur.execute("""CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            default_assignee INTEGER,
            templates TEXT DEFAULT '[]'
        )""")

        # Tasks
        cur.execute("""CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT,
            due_date TEXT,
            assigned_to INTEGER,
            priority TEXT,
            company_id INTEGER,
            status TEXT,
            completed_at TEXT,
            recurrence TEXT,
            recurrence_day INTEGER,
            subtasks TEXT DEFAULT '[]',
            comments TEXT DEFAULT '[]',
            sector_id INTEGER,
            recurrence_active INTEGER DEFAULT 1,
            due_offset INTEGER DEFAULT 0
        )""")

        # Task Subtasks
        cur.execute("""CREATE TABLE IF NOT EXISTS task_subtasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
            text TEXT,
            done INTEGER DEFAULT 0,
            done_by INTEGER,
            done_at TEXT
        )""")

        # Task Comments
        cur.execute("""CREATE TABLE IF NOT EXISTS task_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
            text TEXT,
            author_id INTEGER,
            created_at TEXT
        )""")

        # Standard Tasks
        cur.execute("""CREATE TABLE IF NOT EXISTS standard_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            recurrence TEXT,
            subtasks TEXT DEFAULT '[]',
            due_offset INTEGER DEFAULT 0
        )""")

        # Notifications
        cur.execute("""CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            text TEXT,
            is_read INTEGER DEFAULT 0,
            created_at TEXT,
            task_id INTEGER
        )""")

        # Messages (Chat)
        cur.execute("""CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER,
            target_id INTEGER,
            type TEXT,
            content TEXT,
            attachment TEXT,
            created_at TEXT,
            files TEXT DEFAULT '[]',
            reactions TEXT DEFAULT '{}',
            reply_to_id INTEGER,
            seen INTEGER DEFAULT 0,
            deleted INTEGER DEFAULT 0,
            edited INTEGER DEFAULT 0,
            distributed INTEGER DEFAULT 1,
            saved INTEGER DEFAULT 1,
            failure INTEGER DEFAULT 0,
            room_id TEXT
        )""")

        # Chat Rooms
        cur.execute("""CREATE TABLE IF NOT EXISTS chat_rooms (
            id TEXT PRIMARY KEY,
            name TEXT,
            avatar TEXT,
            created_by INTEGER,
            created_at TEXT
        )""")

        # Chat Room Members
        cur.execute("""CREATE TABLE IF NOT EXISTS chat_room_members (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT,
            user_id INTEGER,
            joined_at TEXT,
            UNIQUE(room_id, user_id)
        )""")

        # Sectors
        cur.execute("""CREATE TABLE IF NOT EXISTS sectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )""")

        # Task Assignees
        cur.execute("""CREATE TABLE IF NOT EXISTS task_assignees (
            task_id INTEGER,
            user_id INTEGER,
            PRIMARY KEY (task_id, user_id)
        )""")

        conn.commit()

        # Create Admin
        cur.execute("SELECT * FROM users WHERE role='admin'")
        if not cur.fetchone():
            h = hash_pass("123")
            cur.execute("INSERT INTO users (name, role, \"role_desc\", initials, color, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
                        ("Administrador", "admin", "Diretoria", "AD", "#ef4444", h))
            conn.commit()
            print(">>> ✅ ADMIN RECRIADO: Senha '123'")

        cur.close()
        conn.close()
        print(">>> SISTEMA ONLINE (SQLITE) E LIMPO! 🚀")

    except Exception as e:
        print(f"❌ ERRO GRAVE NO BANCO (SQLITE): {e}")
