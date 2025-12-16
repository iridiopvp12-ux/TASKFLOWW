from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Body
from typing import Optional
import shutil
import os
import uuid
import json
from datetime import datetime
from ..database import get_db, row_to_dict
from ..realtime import manager

router = APIRouter()

@router.get("/chat/messages")
def get_messages(target_id: Optional[int] = None, type: str = "global"):
    conn = get_db(); cur = conn.cursor()

    if type == "global":
        cur.execute("""
            SELECT m.id, m.sender_id, m.content, m.attachment, m.created_at, u.name as sender_name, u.initials as sender_initials, u.color as sender_color
            FROM messages m
            LEFT JOIN users u ON m.sender_id = u.id
            WHERE m.type = 'global'
            ORDER BY m.created_at ASC LIMIT 100
        """)
    elif type == "dm" and target_id:
        pass

    res = row_to_dict(cur)
    conn.close()
    return res

@router.get("/chat/dm")
def get_dm(user1: int, user2: int):
    conn = get_db(); cur = conn.cursor()
    cur.execute("""
        SELECT m.id, m.sender_id, m.content, m.attachment, m.created_at, u.name as sender_name, u.initials as sender_initials, u.color as sender_color
        FROM messages m
        LEFT JOIN users u ON m.sender_id = u.id
        WHERE m.type = 'dm' AND (
            (m.sender_id = %s AND m.target_id = %s) OR
            (m.sender_id = %s AND m.target_id = %s)
        )
        ORDER BY m.created_at ASC LIMIT 100
    """, (user1, user2, user2, user1))
    res = row_to_dict(cur)
    conn.close()
    return res

@router.post("/chat/message")
def send_message(background_tasks: BackgroundTasks, payload: dict = Body(...)):
    # payload: { senderId, targetId, type, content, attachment }
    conn = get_db(); cur = conn.cursor()

    now = datetime.now().isoformat()
    cur.execute("INSERT INTO messages (sender_id, target_id, type, content, attachment, created_at) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id",
                (payload['senderId'], payload.get('targetId'), payload['type'], payload.get('content'), payload.get('attachment'), now))
    mid = cur.fetchone()[0]
    conn.commit()

    # Fetch details for broadcast
    cur.execute("SELECT name, initials, color FROM users WHERE id=%s", (payload['senderId'],))
    u = cur.fetchone()

    msg_data = {
        "id": mid,
        "sender_id": payload['senderId'],
        "target_id": payload.get('targetId'),
        "type": payload['type'],
        "content": payload.get('content'),
        "attachment": payload.get('attachment'),
        "created_at": now,
        "sender_name": u[0] if u else "Unknown",
        "sender_initials": u[1] if u else "?",
        "sender_color": u[2] if u else "#ccc"
    }

    # Broadcast event
    background_tasks.add_task(manager.broadcast, f"chat:{json.dumps(msg_data)}")

    conn.close()
    return {"success": True}

@router.post("/chat/upload")
def upload_file(file: UploadFile = File(...)):
    try:
        # Create safe filename
        ext = file.filename.split('.')[-1]
        filename = f"{uuid.uuid4()}.{ext}"
        path = f"frontend/uploads/{filename}"

        # Ensure dir exists (redundant if main.py does it, but safe)
        os.makedirs("frontend/uploads", exist_ok=True)

        with open(path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        return {"url": f"/uploads/{filename}", "filename": file.filename}
    except Exception as e:
        return {"error": str(e)}
