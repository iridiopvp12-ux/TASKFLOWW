from fastapi import APIRouter, UploadFile, File, BackgroundTasks, Body, Query
from typing import Optional, List
import shutil
import os
import uuid
import json
from datetime import datetime
from ..database import get_db, row_to_dict
from ..realtime import manager

router = APIRouter()

# ==========================================
# 🆕 CHAT V2 ROUTERS
# ==========================================

@router.get("/chat/rooms")
def get_rooms(current_user_id: int):
    """
    Retorna a lista de usuários como 'salas'.
    """
    conn = get_db()
    try:
        cur = conn.cursor()
        # Buscar todos os usuários exceto o atual
        cur.execute("""
            SELECT id, name, initials, color, role
            FROM users u
            WHERE id != %s
            ORDER BY name ASC
        """, (current_user_id,))

        users = row_to_dict(cur)
        rooms = []

        for u in users:
            # Construir roomId baseado no par de IDs (min_max)
            # Para DMs no vue-advanced-chat, cada usuário é uma sala.
            # No entanto, para persistência de mensagens, usamos o par.
            # Aqui, retornamos o usuário como uma 'room' para a UI listar.

            # Precisamos buscar a última mensagem entre current e u['id']
            min_id = min(current_user_id, u['id'])
            max_id = max(current_user_id, u['id'])

            # Query otimizada para last message (pode ser pesada se muitos msgs, ideal index)
            cur.execute("""
                SELECT content, created_at, sender_id, seen, files
                FROM messages
                WHERE (sender_id=%s AND target_id=%s) OR (sender_id=%s AND target_id=%s)
                ORDER BY id DESC LIMIT 1
            """, (min_id, max_id, max_id, min_id))
            last_msg = cur.fetchone() # Retorna tupla

            last_message_obj = None
            if last_msg:
                # last_msg: (content, created_at, sender_id, seen, files)
                is_me = (last_msg[2] == current_user_id)
                files_data = last_msg[4] if last_msg[4] else []
                # Se for string JSON (no sqlite/postgres drivers antigos pode vir como str)
                if isinstance(files_data, str):
                    try: files_data = json.loads(files_data)
                    except: files_data = []

                content_preview = last_msg[0]
                if not content_preview and files_data:
                    content_preview = "📎 Anexo"

                last_message_obj = {
                    "content": content_preview,
                    "senderId": str(last_msg[2]),
                    "username": "Você" if is_me else u['name'],
                    "timestamp": last_msg[1][11:16] if last_msg[1] else "", # HH:MM ISO format
                    "seen": last_msg[3],
                    "new": not last_msg[3] and not is_me
                }

            # Contar não lidas
            cur.execute("""
                SELECT COUNT(*) FROM messages
                WHERE target_id=%s AND sender_id=%s AND seen=FALSE
            """, (current_user_id, u['id']))
            unread_count = cur.fetchone()[0]

            # Gerar avatar se não existir (usando ui-avatars.com)
            avatar_url = u.get('avatar')
            if not avatar_url:
                color_clean = u['color'].replace('#', '') if u['color'] else '3b82f6'
                avatar_url = f"https://ui-avatars.com/api/?name={u['name']}&background={color_clean}&color=fff"

            rooms.append({
                "roomId": str(u['id']), # Na UI, o ID da sala é o ID do outro usuário para DMs
                "roomName": u['name'],
                "avatar": avatar_url,
                "users": [
                    {"_id": str(u['id']), "username": u['name'], "avatar": avatar_url, "status": {"state": "offline"}} # Status real viria do realtime
                ],
                "unreadCount": unread_count,
                "lastMessage": last_message_obj
            })

        return rooms
    finally:
        conn.close()

@router.get("/chat/messages")
def get_messages(roomId: str, currentUserId: int):
    """
    Busca mensagens entre currentUserId e roomId (que é o targetUserId).
    """
    conn = get_db()
    try:
        target_id = int(roomId)
        cur = conn.cursor()

        # Garante ordem correta para query
        # min_id = min(currentUserId, target_id)
        # max_id = max(currentUserId, target_id)

        # Buscar mensagens
        cur.execute("""
            SELECT m.id, m.content, m.sender_id, m.created_at, m.seen, m.files, m.reactions, m.reply_to_id, m.edited, m.deleted
            FROM messages m
            WHERE (m.sender_id = %s AND m.target_id = %s)
               OR (m.sender_id = %s AND m.target_id = %s)
            ORDER BY m.created_at ASC
        """, (currentUserId, target_id, target_id, currentUserId))

        rows = row_to_dict(cur)
        formatted = []

        # Para replies, precisamos montar um mapa rápido ou fazer query (mapa é melhor se paginado)
        # Como estamos pegando tudo (sem paginação pesada ainda), ok.
        msg_map = {row['id']: row for row in rows}

        for r in rows:
            # Parse JSON fields
            files = r['files']
            if isinstance(files, str):
                try: files = json.loads(files)
                except: files = []

            reactions = r['reactions']
            if isinstance(reactions, str):
                try: reactions = json.loads(reactions)
                except: reactions = {}

            # Reply object
            reply_obj = None
            if r['reply_to_id'] and r['reply_to_id'] in msg_map:
                orig = msg_map[r['reply_to_id']]
                reply_obj = {
                    "_id": str(orig['id']),
                    "content": orig['content'],
                    "senderId": str(orig['sender_id'])
                    # "files": ... se quiser preview
                }

            # Date formatting
            # ISO: 2023-10-25T14:30:00
            date_str = r['created_at'].split('T')[0] if r['created_at'] else ""
            time_str = r['created_at'].split('T')[1][:5] if r['created_at'] and 'T' in r['created_at'] else ""

            formatted.append({
                "_id": str(r['id']),
                "content": r['content'] if not r['deleted'] else "🚫 Mensagem apagada",
                "senderId": str(r['sender_id']),
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

            # Marcar como vistas se eu sou o destinatário
            if r['sender_id'] == target_id and not r['seen']:
                cur.execute("UPDATE messages SET seen=TRUE WHERE id=%s", (r['id'],))

        conn.commit()
        return formatted
    finally:
        conn.close()

@router.post("/chat/message")
def send_message_v2(background_tasks: BackgroundTasks, payload: dict = Body(...)):
    # payload: { senderId, roomId, content, files, replyMessage, usersTag }
    conn = get_db()
    try:
        cur = conn.cursor()
        now = datetime.now().isoformat()

        target_id = int(payload['roomId']) # RoomId é o ID do usuário destino
        sender_id = int(payload['senderId'])

        files_json = json.dumps(payload.get('files', []))

        reply_id = None
        if payload.get('replyMessage'):
            reply_id = int(payload['replyMessage']['_id'])

        cur.execute("""
            INSERT INTO messages
            (sender_id, target_id, type, content, files, created_at, reply_to_id, seen)
            VALUES (%s, %s, 'dm', %s, %s, %s, %s, FALSE)
            RETURNING id
        """, (sender_id, target_id, payload.get('content'), files_json, now, reply_id))

        new_id = cur.fetchone()[0]
        conn.commit()

        # Construir objeto para realtime (igual ao formato de leitura)
        msg_obj = {
            "_id": str(new_id),
            "content": payload.get('content'),
            "senderId": str(sender_id),
            "date": now.split('T')[0],
            "timestamp": now.split('T')[1][:5],
            "seen": False,
            "deleted": False,
            "edited": False,
            "files": payload.get('files', []),
            "reactions": {},
            "replyMessage": payload.get('replyMessage')
        }

        # Broadcast para SENDER (confirmar envio na UI dele se necessário, mas a lib já trata)
        # Broadcast para TARGET
        # Formato: chat:{ action: 'message', data: msg_obj, roomId: ... }
        # OBS: O roomId para o target é o sender_id!

        # Evento para o DESTINATÁRIO
        event_target = {
            "action": "message",
            "data": msg_obj,
            "roomId": str(sender_id) # Para o target, a sala é o sender
        }
        background_tasks.add_task(manager.send_personal_message, f"chat:{json.dumps(event_target)}", target_id)

        # O sender já tem a msg otimista, mas podemos confirmar ID se precisar.
        # Por enquanto o vue-advanced-chat lida bem com isso.

        return msg_obj
    finally:
        conn.close()

@router.post("/chat/upload")
def upload_files(files: List[UploadFile] = File(...)):
    uploaded = []
    ALLOWED_EXTS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'txt', 'docx', 'zip', 'mp3', 'wav', 'ogg', 'webm', 'mp4'}

    os.makedirs("frontend/uploads", exist_ok=True)

    for file in files:
        try:
            ext = file.filename.split('.')[-1].lower()
            if ext not in ALLOWED_EXTS:
                continue # Skip invalid

            filename = f"{uuid.uuid4()}.{ext}"
            path = f"frontend/uploads/{filename}"

            with open(path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)

            # Formato esperado pelo vue-advanced-chat
            # { name, size, type, audio, duration, url, preview }

            is_image = ext in ['png', 'jpg', 'jpeg', 'gif']
            is_audio = ext in ['mp3', 'wav', 'ogg']
            is_video = ext in ['mp4', 'webm']

            file_type = ext
            if is_image: file_type = 'image'
            if is_video: file_type = 'video'
            if is_audio: file_type = 'audio'

            uploaded.append({
                "name": file.filename,
                "size": 0, # Poderia pegar os.path.getsize(path)
                "type": file_type,
                "extension": ext,
                "url": f"/uploads/{filename}",
                "preview": f"/uploads/{filename}" if is_image else None
            })
        except Exception as e:
            print(f"Error uploading {file.filename}: {e}")

    return uploaded

@router.put("/chat/message/{id}")
def edit_message(id: int, background_tasks: BackgroundTasks, payload: dict = Body(...)):
    # payload: { action: 'edit'|'react'|'delete', content?, reaction? }
    conn = get_db()
    try:
        cur = conn.cursor()
        action = payload.get('action')

        # Pega info da msg para saber quem notificar
        cur.execute("SELECT sender_id, target_id, reactions FROM messages WHERE id=%s", (id,))
        row = cur.fetchone()
        if not row: return {"error": "Not found"}

        sender_id, target_id, current_reactions = row[0], row[1], row[2]
        if isinstance(current_reactions, str): current_reactions = json.loads(current_reactions)
        if current_reactions is None: current_reactions = {}

        if action == 'edit':
            new_content = payload.get('content')
            cur.execute("UPDATE messages SET content=%s, edited=TRUE WHERE id=%s", (new_content, id))

        elif action == 'delete':
            cur.execute("UPDATE messages SET deleted=TRUE WHERE id=%s", (id,))

        elif action == 'react':
            # payload: { reaction: 'emoji', remove: bool, userId: ... }
            emoji = payload.get('reaction')
            remove = payload.get('remove')
            user_id = str(payload.get('userId')) # ID de quem reagiu

            users_reacted = current_reactions.get(emoji, [])

            if remove:
                if user_id in users_reacted: users_reacted.remove(user_id)
                if not users_reacted: del current_reactions[emoji]
                else: current_reactions[emoji] = users_reacted
            else:
                if user_id not in users_reacted: users_reacted.append(user_id)
                current_reactions[emoji] = users_reacted

            cur.execute("UPDATE messages SET reactions=%s WHERE id=%s", (json.dumps(current_reactions), id))

        conn.commit()

        # Broadcast update
        update_event = {
            "action": action,
            "roomId": str(sender_id), # Contexto depende de quem recebe, o front trata
            "messageId": str(id),
            "content": payload.get('content'),
            "reactions": current_reactions
        }

        # Avisar ambos (sender e target) que a msg mudou
        background_tasks.add_task(manager.send_personal_message, f"chat:{json.dumps(update_event)}", sender_id)
        background_tasks.add_task(manager.send_personal_message, f"chat:{json.dumps(update_event)}", target_id)

        return {"success": True}
    finally:
        conn.close()
