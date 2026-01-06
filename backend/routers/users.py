from fastapi import APIRouter
from ..database import get_db, row_to_dict, hash_pass
from ..schemas import UserCreate

router = APIRouter()

@router.get("/users")
def get_users():
    conn = get_db(); cur = conn.cursor()
    # ✅ Consulta com aspas duplas para o nome exato da coluna
    cur.execute('SELECT id, name, role, "role_desc" as "roleDesc", initials, color FROM users ORDER BY id ASC')

    res = row_to_dict(cur)
    conn.close()
    return res

@router.post("/users")
def create_user(u: UserCreate):
    conn = get_db(); cur = conn.cursor()
    h = hash_pass(u.password)
    cur.execute("INSERT INTO users (name, role, \"role_desc\", initials, color, password_hash) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
                (u.name, u.role, u.roleDesc, u.initials, u.color, h))
    uid = cur.fetchone()[0]
    conn.commit(); conn.close()
    return {"id": uid}

@router.delete("/users/{id}")
def del_user(id: int):
    conn = get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE id=%s", (id,))
    conn.commit(); conn.close()
    return {"success": True}
