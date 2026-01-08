from fastapi import APIRouter, Body
from ..database import get_db, row_to_dict

router = APIRouter()

@router.get("/sectors")
def get_sectors():
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, name FROM sectors ORDER BY name ASC")
        return row_to_dict(cur)
    finally:
        conn.close()

@router.post("/sectors")
def create_sector(payload: dict = Body(...)):
    conn = get_db()
    try:
        cur = conn.cursor()
        name = payload.get('name')
        if not name: return {"error": "Name required"}

        cur.execute("INSERT INTO sectors (name) VALUES (%s) RETURNING id", (name,))
        new_id = cur.fetchone()[0]
        conn.commit()
        return {"id": new_id, "name": name}
    finally:
        conn.close()

@router.delete("/sectors/{id}")
def delete_sector(id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        # Clean up references (Optional: Set users/tasks sector_id to NULL)
        cur.execute("UPDATE users SET sector_id = NULL WHERE sector_id = %s", (id,))
        cur.execute("UPDATE tasks SET sector_id = NULL WHERE sector_id = %s", (id,))

        cur.execute("DELETE FROM sectors WHERE id = %s", (id,))
        conn.commit()
        return {"success": True}
    finally:
        conn.close()
