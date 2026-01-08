from fastapi import APIRouter
from ..database import get_db, row_to_dict, hash_pass
from ..schemas import UserCreate

router = APIRouter()

@router.get("/users")
def get_users():
    conn = get_db()
    try:
        cur = conn.cursor()
        # Join with sectors to get sector name
        cur.execute("""
            SELECT u.id, u.name, u.role, u."role_desc" as "roleDesc", u.initials, u.color, u.sector_id, s.name as "sectorName"
            FROM users u
            LEFT JOIN sectors s ON u.sector_id = s.id
            ORDER BY u.id ASC
        """)
        res = row_to_dict(cur)
        return res
    finally:
        conn.close()

@router.post("/users")
def create_user(u: UserCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        h = hash_pass(u.password)
        cur.execute("INSERT INTO users (name, role, \"role_desc\", initials, color, password_hash, sector_id) VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id",
                    (u.name, u.role, u.roleDesc, u.initials, u.color, h, u.sectorId))
        uid = cur.fetchone()[0]
        conn.commit()
        return {"id": uid}
    finally:
        conn.close()

@router.delete("/users/{id}")
def del_user(id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM users WHERE id=%s", (id,))
        conn.commit()
        return {"success": True}
    finally:
        conn.close()
