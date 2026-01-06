from fastapi import APIRouter
from ..database import get_db, row_to_dict
from typing import List

router = APIRouter()

@router.get("/notifications")
def get_notifications(user_id: int):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, text, is_read as isRead, created_at as createdAt, task_id as taskId FROM notifications WHERE user_id = %s ORDER BY id DESC LIMIT 20", (user_id,))
    res = row_to_dict(cur)
    conn.close()
    return res

@router.put("/notifications/{id}/read")
def mark_read(id: int):
    conn = get_db(); cur = conn.cursor()
    cur.execute("UPDATE notifications SET is_read = TRUE WHERE id = %s", (id,))
    conn.commit(); conn.close()
    return {"success": True}
