from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Body, Query
from fastapi.responses import FileResponse
from typing import Optional, List
import shutil
import os
import uuid
import json
from datetime import datetime
from ..database import get_db, row_to_dict
from ..realtime import manager
import mimetypes
import urllib.parse

# Explicitly register common Office MIME types to avoid "Zip" interpretation
mimetypes.add_type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.xlsx')
mimetypes.add_type('application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.docx')
mimetypes.add_type('application/vnd.openxmlformats-officedocument.presentationml.presentation', '.pptx')
mimetypes.add_type('application/vnd.ms-excel', '.xls')

router = APIRouter()

# ==========================================
# 🆕 CHAT V2 ROUTERS
# ==========================================

@router.get("/chat/rooms")
def get_rooms(current_user_id: int):
    """
    Retorna lista de usuários (DMs) e Grupos.
    """
    conn = get_db()
    try:
        cur = conn.cursor()
        rooms = []

        # 1. USERS (DMs)
        cur.execute("""
            SELECT id, name, initials, color, role
            FROM users u
            WHERE id != %s
            ORDER BY name ASC
        """, (current_user_id,))
        users = row_to_dict(cur)

        for u in users:
            # Busca última mensagem DM (target_id=id OR sender_id=id AND type='dm')
            # Precisamos filtrar pelo current_user também

            # Correção lógica: DM é sempre par (eu, ele)
            # sender=eu, target=ele OU sender=ele, target=eu

            target_id = u['id']

            cur.execute("""
                SELECT content, created_at, sender_id, seen, files
                FROM messages
                WHERE (sender_id=%s AND target_id=%s AND type='dm')
                   OR (sender_id=%s AND target_id=%s AND type='dm')
                ORDER BY id DESC LIMIT 1
            """, (current_user_id, target_id, target_id, current_user_id))
            last_msg = cur.fetchone()

            last_message_obj = None
            if last_msg:
                is_me = (last_msg[2] == current_user_id)
                files_data = last_msg[4] if last_msg[4] else []
                if isinstance(files_data, str):
                    try: files_data = json.loads(files_data)
                    except: files_data = []

                content_preview = last_msg[0]
                if not content_preview and files_data:
                    content_preview = "📎 Anexo"

                last_message_obj = {
                    "content": content_preview or "",
                    "senderId": str(last_msg[2]),
                    "username": "Você" if is_me else u['name'],
                    "timestamp": last_msg[1][11:16] if last_msg[1] else "",
                    "seen": last_msg[3],
                    "new": not last_msg[3] and not is_me
                }

            cur.execute("""
                SELECT COUNT(*) FROM messages
                WHERE target_id=%s AND sender_id=%s AND seen=FALSE AND type='dm'
            """, (current_user_id, u['id']))
            unread_count = cur.fetchone()[0]

            # Avatar
            avatar_url = u.get('avatar')
            if not avatar_url:
                color_clean = u['color'].replace('#', '') if u['color'] else '3b82f6'
                avatar_url = f"https://ui-avatars.com/api/?name={u['name']}&background={color_clean}&color=fff"

            rooms.append({
                "roomId": str(u['id']),
                "roomName": u['name'],
                "avatar": avatar_url,
                "users": [{"_id": str(u['id']), "username": u['name'], "avatar": avatar_url, "status": {"state": "offline"}}],
                "unreadCount": unread_count,
                "lastMessage": last_message_obj
            })

        # 2. GROUPS
        cur.execute("""
            SELECT r.id, r.name, r.avatar, r.owner_id
            FROM chat_rooms r
            JOIN chat_room_members m ON r.id = m.room_id
            WHERE m.user_id = %s
        """, (current_user_id,))
        groups = row_to_dict(cur)

        for g in groups:
            # Last msg for group (target_id=NULL, room_id=g['id'])
            # No nosso schema novo, msg de grupo tem room_id preenchido.

            cur.execute("""
                SELECT m.content, m.created_at, m.sender_id, m.seen, m.files, u.name
                FROM messages m
                LEFT JOIN users u ON m.sender_id = u.id
                WHERE m.room_id = %s
                ORDER BY m.id DESC LIMIT 1
            """, (g['id'],))
            last_msg = cur.fetchone()

            last_message_obj = None
            if last_msg:
                is_me = (last_msg[2] == current_user_id)
                files_data = last_msg[4] if last_msg[4] else []
                if isinstance(files_data, str):
                    try: files_data = json.loads(files_data)
                    except: files_data = []

                content_preview = last_msg[0]
                if not content_preview and files_data: content_preview = "📎 Anexo"

                last_message_obj = {
                    "content": content_preview or "",
                    "senderId": str(last_msg[2]),
                    "username": "Você" if is_me else (last_msg[5] or "User"),
                    "timestamp": last_msg[1][11:16] if last_msg[1] else "",
                    "seen": True, # Em grupo, lógica de seen é complexa, simplificamos
                    "new": False
                }

            # Buscar membros
            cur.execute("""
                SELECT u.id, u.name, u.initials, u.color
                FROM users u
                JOIN chat_room_members m ON u.id = m.user_id
                WHERE m.room_id = %s
            """, (g['id'],))
            members_rows = row_to_dict(cur)
            members_objs = []
            for m in members_rows:
                avatar_url = f"https://ui-avatars.com/api/?name={m['name']}&background={m['color'].replace('#','')}&color=fff"
                members_objs.append({
                    "_id": str(m['id']),
                    "username": m['name'],
                    "avatar": avatar_url,
                    "status": {"state": "offline"}
                })

            rooms.append({
                "roomId": g['id'], # ID textual (uuid ou prefixo)
                "roomName": g['name'],
                "avatar": g['avatar'] or "https://ui-avatars.com/api/?name=G&background=random",
                "users": members_objs,
                "unreadCount": 0, # TODO: Implementar unread pra grupo
                "lastMessage": last_message_obj,
                "ownerId": g['owner_id']
            })

        return rooms
    finally:
        conn.close()

@router.post("/chat/room")
def create_room(current_user_id: int = Query(...), payload: dict = Body(...)):
    # payload: { roomName: str, users: [id, id...] }
    conn = get_db()
    try:
        cur = conn.cursor()
        room_id = f"group_{uuid.uuid4().hex[:8]}"
        name = payload.get('roomName', 'Novo Grupo')
        users = payload.get('users', [])

        # Ensure creator is in users list
        if current_user_id not in users:
            users.append(current_user_id)

        cur.execute("INSERT INTO chat_rooms (id, name, created_at, owner_id) VALUES (%s, %s, %s, %s)",
                    (room_id, name, datetime.now().isoformat(), current_user_id))

        for uid in users:
            try:
                uid_int = int(uid)
                cur.execute("INSERT INTO chat_room_members (room_id, user_id, joined_at) VALUES (%s, %s, %s)",
                            (room_id, uid_int, datetime.now().isoformat()))
            except: pass

        conn.commit()

        return {"roomId": room_id, "roomName": name, "users": users, "ownerId": current_user_id}
    finally:
        conn.close()

@router.put("/chat/room/{roomId}")
def update_room(roomId: str, payload: dict = Body(...)):
    """
    Action: 'rename' (requires owner), 'add_member', 'remove_member' (requires owner)
    """
    conn = get_db()
    try:
        cur = conn.cursor()
        action = payload.get('action')
        current_user_id = payload.get('currentUserId') # Passed from front for basic check

        # Verify Owner
        cur.execute("SELECT owner_id, name FROM chat_rooms WHERE id=%s", (roomId,))
        row = cur.fetchone()
        if not row: return {"error": "Room not found"}
        owner_id, current_name = row[0], row[1]

        if action == 'rename':
            if str(owner_id) != str(current_user_id):
                return {"error": "Apenas o dono do grupo pode renomear."}
            new_name = payload.get('roomName')
            cur.execute("UPDATE chat_rooms SET name=%s WHERE id=%s", (new_name, roomId))

        elif action == 'add_member':
            new_user_id = payload.get('userId')
            try:
                cur.execute("INSERT INTO chat_room_members (room_id, user_id, joined_at) VALUES (%s, %s, %s)",
                            (roomId, int(new_user_id), datetime.now().isoformat()))
            except: pass # Already member

        elif action == 'remove_member':
            # Remove member (Kick)
            if str(owner_id) != str(current_user_id):
                 return {"error": "Apenas o dono pode remover membros."}
            target_id = payload.get('userId')
            if str(target_id) == str(owner_id):
                return {"error": "O dono não pode ser removido (saia do grupo)."}
            cur.execute("DELETE FROM chat_room_members WHERE room_id=%s AND user_id=%s", (roomId, target_id))

        elif action == 'leave':
            # Leave group (Self remove)
            if str(owner_id) == str(current_user_id):
                # If owner leaves, maybe assign new owner? Or just leave.
                # Simplification: Owner cannot leave without deleting or passing ownership?
                # User asked: "Excluir Conversa: Sair do grupo". If owner does it, maybe delete group?
                # For now, allow owner to leave (orphaned group) or block.
                # Let's allow, but maybe warn.
                pass
            cur.execute("DELETE FROM chat_room_members WHERE room_id=%s AND user_id=%s", (roomId, current_user_id))

        conn.commit()
        return {"success": True}
    finally:
        conn.close()

@router.get("/chat/messages")
def get_messages(roomId: str, currentUserId: int):
    conn = get_db()
    try:
        cur = conn.cursor()

        # Check if DM or Group
        is_group = roomId.startswith('group_')

        if is_group:
            query = """
                SELECT m.id, m.content, m.sender_id, m.created_at, m.seen, m.files, m.reactions, m.reply_to_id, m.edited, m.deleted, u.name as sender_name
                FROM messages m
                LEFT JOIN users u ON m.sender_id = u.id
                WHERE m.room_id = %s
                ORDER BY m.created_at ASC
            """
            params = (roomId,)
        else:
            # DM Logic
            target_id = int(roomId)
            query = """
                SELECT m.id, m.content, m.sender_id, m.created_at, m.seen, m.files, m.reactions, m.reply_to_id, m.edited, m.deleted, 'User' as sender_name
                FROM messages m
                WHERE (m.sender_id = %s AND m.target_id = %s AND m.type = 'dm')
                   OR (m.sender_id = %s AND m.target_id = %s AND m.type = 'dm')
                ORDER BY m.created_at ASC
            """
            params = (currentUserId, target_id, target_id, currentUserId)

        cur.execute(query, params)
        rows = row_to_dict(cur)
        formatted = []

        msg_map = {row['id']: row for row in rows}

        for r in rows:
            files = r['files']
            if files is None: files = []
            elif isinstance(files, str):
                try: files = json.loads(files)
                except: files = []
            if files is None:
                files = []

            reactions = r['reactions']
            if isinstance(reactions, str):
                try: reactions = json.loads(reactions)
                except: reactions = {}

            reply_obj = None
            if r['reply_to_id'] and r['reply_to_id'] in msg_map:
                orig = msg_map[r['reply_to_id']]
                reply_obj = {
                    "_id": str(orig['id']),
                    "content": orig['content'],
                    "senderId": str(orig['sender_id'])
                }

            date_str = r['created_at'].split('T')[0] if r['created_at'] else ""
            time_str = r['created_at'].split('T')[1][:5] if r['created_at'] and 'T' in r['created_at'] else ""

            formatted.append({
                "_id": str(r['id']),
                "content": (r['content'] or "") if not r['deleted'] else "🚫 Mensagem apagada",
                "senderId": str(r['sender_id']),
                "username": r.get('sender_name', ''), # Importante pra grupo
                "date": date_str,
                "timestamp": time_str,
                "seen": r['seen'],
                "deleted": r['deleted'],
                "edited": r['edited'],
                "files": files,
                "reactions": reactions,
                "replyMessage": reply_obj,
                "disableActions": r['deleted'],
                "disableReactions": r['deleted']
            })

            # Se for DM e eu sou o alvo, marcar visto
            if not is_group and r['sender_id'] == int(roomId) and not r['seen']:
                cur.execute("UPDATE messages SET seen=TRUE WHERE id=%s", (r['id'],))

        conn.commit()
        return formatted
    finally:
        conn.close()

@router.post("/chat/message")
def send_message_v2(background_tasks: BackgroundTasks, payload: dict = Body(...)):
    conn = get_db()
    try:
        cur = conn.cursor()
        now = datetime.now().isoformat()

        sender_id = int(payload['senderId'])
        raw_room_id = payload['roomId']
        content = payload.get('content') or ""

        files_data = payload.get('files')
        if files_data is None:
            files_data = []
        files_json = json.dumps(files_data)

        reply_id = None
        if payload.get('replyMessage'):
            reply_id = int(payload['replyMessage']['_id'])

        is_group = str(raw_room_id).startswith('group_')

        new_id = None

        if is_group:
            cur.execute("""
                INSERT INTO messages
                (sender_id, room_id, type, content, files, created_at, reply_to_id, seen)
                VALUES (%s, %s, 'group', %s, %s::jsonb, %s, %s, FALSE)
                RETURNING id
            """, (sender_id, raw_room_id, content, files_json, now, reply_id))
            new_id = cur.fetchone()[0]

            # Broadcast para membros do grupo
            cur.execute("SELECT user_id FROM chat_room_members WHERE room_id=%s", (raw_room_id,))
            members = cur.fetchall()

            # Fetch sender name for notification
            cur.execute("SELECT name FROM users WHERE id=%s", (sender_id,))
            sname = cur.fetchone()[0]

            msg_obj = {
                "_id": str(new_id),
                "content": content,
                "senderId": str(sender_id),
                "username": sname,
                "date": now.split('T')[0],
                "timestamp": now.split('T')[1][:5],
                "seen": False,
                "deleted": False,
                "edited": False,
                "files": payload.get('files', []),
                "reactions": {},
                "replyMessage": payload.get('replyMessage')
            }

            for m in members:
                uid = m[0]
                # Send to everyone (client filters if it's their own msg usually, but we can optimistically send)
                event_target = {
                    "action": "message",
                    "data": msg_obj,
                    "roomId": raw_room_id # Para o target, o roomId é o group_id
                }
                background_tasks.add_task(manager.send_personal_message, f"chat:{json.dumps(event_target)}", uid)

        else:
            # DM
            target_id = int(raw_room_id)
            cur.execute("""
                INSERT INTO messages
                (sender_id, target_id, type, content, files, created_at, reply_to_id, seen)
                VALUES (%s, %s, 'dm', %s, %s::jsonb, %s, %s, FALSE)
                RETURNING id
            """, (sender_id, target_id, content, files_json, now, reply_id))
            new_id = cur.fetchone()[0]

            msg_obj = {
                "_id": str(new_id),
                "content": content,
                "senderId": str(sender_id),
                "date": now.split('T')[0],
                "timestamp": now.split('T')[1][:5],
                "seen": False,
                "files": payload.get('files', []),
                "reactions": {},
                "replyMessage": payload.get('replyMessage')
            }

            # Evento para o DESTINATÁRIO
            # Para o destinatário de DM, a "sala" é o remetente
            event_target = {
                "action": "message",
                "data": msg_obj,
                "roomId": str(sender_id)
            }
            background_tasks.add_task(manager.send_personal_message, f"chat:{json.dumps(event_target)}", target_id)

        conn.commit()
        return msg_obj
    finally:
        conn.close()

@router.post("/chat/upload")
def upload_files(files: List[UploadFile] = File(...)):
    uploaded = []

    # Block potentially dangerous executables, allow everything else
    BLOCKED_EXTS = {'exe', 'bat', 'sh', 'cmd', 'com', 'ps1', 'vbs', 'scr', 'js'}

    os.makedirs("frontend/uploads", exist_ok=True)

    for file in files:
        try:
            # Handle files with no extension or multiple dots
            parts = file.filename.split('.')
            if len(parts) > 1:
                ext = parts[-1].lower()
            else:
                ext = ""

            if ext in BLOCKED_EXTS:
                print(f"Blocked upload for file: {file.filename} (Extension: {ext})")
                continue

            # If no extension, use 'file' or just keep it
            suffix = f".{ext}" if ext else ""
            filename = f"{uuid.uuid4()}{suffix}"
            path = f"frontend/uploads/{filename}"

            with open(path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            is_image = ext in ['png', 'jpg', 'jpeg', 'gif']
            is_video = ext in ['mp4', 'webm']
            is_audio = ext in ['mp3', 'wav', 'ogg']

            file_type = 'file'
            if is_image: file_type = 'image'
            if is_video: file_type = 'video'
            if is_audio: file_type = 'audio'

            # Get size if possible, else 0
            size = os.path.getsize(path)

            uploaded.append({
                "name": file.filename,
                "size": size,
                "type": file_type,
                "audio": is_audio,
                "duration": 0, # Duration extraction would require another lib
                "extension": ext,
                "url": f"/uploads/{filename}",
                "preview": f"/uploads/{filename}" if is_image else None
            })
        except Exception as e:
            print(f"Error uploading {file.filename}: {e}")

    return uploaded

@router.get("/chat/download/{filename}")
def download_file(filename: str, name: str = Query(None)):
    # Security: Prevent Path Traversal by forcing basename
    safe_filename = os.path.basename(filename)
    path = f"frontend/uploads/{safe_filename}"

    if not os.path.exists(path):
        return {"error": "File not found"}

    # Determine MIME type
    mime_type, _ = mimetypes.guess_type(path)
    if not mime_type:
        mime_type = "application/octet-stream"

    # Force original filename if provided
    headers = {}
    if name:
        headers["Content-Disposition"] = f'attachment; filename="{name}"'

    return FileResponse(path, media_type=mime_type, headers=headers)

@router.put("/chat/message/{id}")
def edit_message(id: int, background_tasks: BackgroundTasks, payload: dict = Body(...)):
    conn = get_db()
    try:
        cur = conn.cursor()
        action = payload.get('action')

        cur.execute("SELECT sender_id, target_id, reactions, room_id, type FROM messages WHERE id=%s", (id,))
        row = cur.fetchone()
        if not row: return {"error": "Not found"}

        sender_id, target_id, current_reactions, room_id, msg_type = row
        if isinstance(current_reactions, str): current_reactions = json.loads(current_reactions)
        if current_reactions is None: current_reactions = {}

        if action == 'edit':
            new_content = payload.get('content')
            cur.execute("UPDATE messages SET content=%s, edited=TRUE WHERE id=%s", (new_content, id))
        elif action == 'delete':
            cur.execute("UPDATE messages SET deleted=TRUE WHERE id=%s", (id,))
        elif action == 'react':
            emoji = payload.get('reaction')
            remove = payload.get('remove')
            user_id = str(payload.get('userId'))

            users_reacted = current_reactions.get(emoji, [])
            if remove:
                if user_id in users_reacted: users_reacted.remove(user_id)
                if not users_reacted: del current_reactions[emoji]
                else: current_reactions[emoji] = users_reacted
            else:
                if user_id not in users_reacted: users_reacted.append(user_id)
                current_reactions[emoji] = users_reacted
            cur.execute("UPDATE messages SET reactions=%s::jsonb WHERE id=%s", (json.dumps(current_reactions), id))

        conn.commit()

        # Broadcast
        update_event = {
            "action": action,
            "messageId": str(id),
            "content": payload.get('content'),
            "reactions": current_reactions
        }

        if msg_type == 'group':
            update_event["roomId"] = room_id
            cur.execute("SELECT user_id FROM chat_room_members WHERE room_id=%s", (room_id,))
            for m in cur.fetchall():
                background_tasks.add_task(manager.send_personal_message, f"chat:{json.dumps(update_event)}", m[0])
        else:
            # DM logic
            # roomId context for receiver is sender_id. For sender is target_id.
            # This is tricky for updates. The frontend just needs to find the message ID.
            # We send roomId = sender_id so the receiver knows which "room" to update.

            # Notify Target
            update_event["roomId"] = str(sender_id)
            background_tasks.add_task(manager.send_personal_message, f"chat:{json.dumps(update_event)}", target_id)

            # Notify Sender (roomId = target_id)
            update_event["roomId"] = str(target_id)
            background_tasks.add_task(manager.send_personal_message, f"chat:{json.dumps(update_event)}", sender_id)

        return {"success": True}
    finally:
        conn.close()
