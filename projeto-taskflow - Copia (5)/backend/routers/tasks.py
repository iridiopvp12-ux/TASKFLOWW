from fastapi import APIRouter, Body, BackgroundTasks
from typing import Optional
import json
from ..database import get_db, row_to_dict
from ..schemas import TaskCreate, StandardTaskCreate
from ..realtime import manager
from datetime import datetime

router = APIRouter()

@router.get("/tasks")
def get_tasks():
    conn = get_db(); cur = conn.cursor()
    cur.execute('SELECT t.id, t.description as "desc", t.status, t.assigned_to as "assignedTo", t.priority as prio, t.due_date as "dueDate", t.completed_at as "completedAt", t.company_id as "companyId", t.subtasks, t.comments, t.recurrence, t.recurrence_day as "recurrenceDay", c.name as "companyName", u.name as "userName" FROM tasks t LEFT JOIN companies c ON t.company_id = c.id LEFT JOIN users u ON t.assigned_to = u.id ORDER BY t.id DESC')
    res = row_to_dict(cur)
    for t in res:
         if isinstance(t['subtasks'], str): t['subtasks'] = json.loads(t['subtasks'])
         if t['comments'] is None: t['comments'] = []
         elif isinstance(t['comments'], str): t['comments'] = json.loads(t['comments'])
    conn.close()
    return res

# 🛡️ ROTA DE AUDITORIA
@router.get("/audit-tasks")
def get_audit_tasks(
    user_id: Optional[int] = None,
    company_id: Optional[int] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    conn = get_db(); cur = conn.cursor()

    query_parts = []
    params = []

    query_parts.append("t.status IN (%s, %s)")
    params.extend(['done', 'archived'])

    if user_id is not None:
        query_parts.append("t.assigned_to = %s")
        params.append(user_id)

    if company_id is not None:
        query_parts.append("t.company_id = %s")
        params.append(company_id)

    if date_start:
        query_parts.append("t.completed_at >= %s")
        params.append(date_start)

    if date_end:
        query_parts.append("t.completed_at <= %s")
        params.append(date_end)

    if search:
        query_parts.append("t.description ILIKE %s")
        params.append(f"%{search}%")

    where_clause = " WHERE " + " AND ".join(query_parts) if query_parts else ""

    main_query = f"""
        SELECT
            t.id, t.description AS "desc", t.status, t.assigned_to AS "assignedTo", t.priority AS prio,
            t.due_date AS "dueDate", t.completed_at AS "completedAt", t.subtasks,
            u.name AS "userName", c.name AS "companyName"
        FROM tasks t
        LEFT JOIN users u ON t.assigned_to = u.id
        LEFT JOIN companies c ON t.company_id = c.id
        {where_clause}
        ORDER BY t.completed_at DESC
        LIMIT %s OFFSET %s
    """

    count_params = list(params)
    params.extend([limit, skip])

    count_query = f"SELECT COUNT(t.id) FROM tasks t {where_clause}"
    cur.execute(count_query, count_params)
    total_count = cur.fetchone()[0]

    cur.execute(main_query, params)
    res = row_to_dict(cur)

    for t in res:
         if isinstance(t['subtasks'], str): t['subtasks'] = json.loads(t['subtasks'])
         if t['completedAt']:
            try:
                t['completedAt'] = t['completedAt'].isoformat()
            except AttributeError:
                t['completedAt'] = str(t['completedAt'])

    conn.close()
    return {"data": res, "total": total_count, "limit": limit, "skip": skip}

@router.post("/tasks")
def create_task(t: TaskCreate, background_tasks: BackgroundTasks):
    conn = get_db(); cur = conn.cursor()
    sub_json = json.dumps([s.model_dump() for s in t.subtasks])
    comp = int(t.companyId) if t.companyId else None
    assign = int(t.assignedTo) if t.assignedTo else None

    cur.execute("INSERT INTO tasks (description, status, assigned_to, priority, due_date, completed_at, company_id, subtasks, recurrence, recurrence_day) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                (t.desc, t.status, assign, t.prio, t.dueDate, t.completedAt, comp, sub_json, t.recurrence, t.recurrenceDay))

    tid = cur.fetchone()[0]

    # Notificação se atribuído
    if assign:
        msg = f"Nova tarefa: {t.desc}"
        now = datetime.now().isoformat()
        cur.execute("INSERT INTO notifications (user_id, text, created_at, task_id) VALUES (%s, %s, %s, %s)", (assign, msg, now, tid))

    conn.commit(); conn.close()

    # Notifica clientes via BackgroundTasks
    background_tasks.add_task(manager.broadcast, "update")
    if assign: background_tasks.add_task(manager.broadcast, f"notification:{assign}")

    return {"id": tid}

@router.put("/tasks/{id}")
def update_task(id: int, background_tasks: BackgroundTasks, t: dict = Body(...)):
    conn = get_db(); cur = conn.cursor()
    updates = []
    params = []

    # Check old assignment for notification logic
    cur.execute("SELECT assigned_to, description FROM tasks WHERE id=%s", (id,))
    row = cur.fetchone()
    old_assign = row[0] if row else None
    desc = row[1] if row else "Tarefa"

    if 'status' in t:
        updates.append("status=%s"); params.append(t['status'])
    if 'completedAt' in t:
        updates.append("completed_at=%s"); params.append(t['completedAt'])
    if 'subtasks' in t:
        updates.append("subtasks=%s"); params.append(json.dumps(t['subtasks']))
    if 'assignedTo' in t:
        updates.append("assigned_to=%s"); val = t['assignedTo']; params.append(int(val) if val else None)
    if 'dueDate' in t:
        updates.append("due_date=%s"); params.append(t['dueDate'])
    if 'prio' in t:
        updates.append("priority=%s"); params.append(t['prio'])

    if updates:
        sql = f"UPDATE tasks SET {', '.join(updates)} WHERE id=%s"
        params.append(id)
        cur.execute(sql, params)

        # Notificação de mudança de dono
        if 'assignedTo' in t:
            new_assign = int(t['assignedTo']) if t['assignedTo'] else None
            if new_assign and new_assign != old_assign:
                msg = f"Atribuída a você: {desc}"
                now = datetime.now().isoformat()
                cur.execute("INSERT INTO notifications (user_id, text, created_at, task_id) VALUES (%s, %s, %s, %s)", (new_assign, msg, now, id))
                background_tasks.add_task(manager.broadcast, f"notification:{new_assign}")

        conn.commit()

    conn.close()
    background_tasks.add_task(manager.broadcast, "update")
    return {"success": True}

@router.post("/tasks/{id}/comments")
def add_comment(id: int, background_tasks: BackgroundTasks, payload: dict = Body(...)):
    # payload: { text: "...", authorId: 123 }
    conn = get_db(); cur = conn.cursor()

    # Get current comments and assignee
    cur.execute("SELECT comments, assigned_to, description FROM tasks WHERE id=%s", (id,))
    row = cur.fetchone()
    if not row: return {"error": "Not found"}

    current_comments = row[0]
    assignee = row[1]
    desc = row[2]

    if current_comments is None: current_comments = []
    elif isinstance(current_comments, str): current_comments = json.loads(current_comments)

    new_comment = {
        "text": payload['text'],
        "author_id": payload['authorId'],
        "created_at": datetime.now().isoformat()
    }
    current_comments.append(new_comment)

    cur.execute("UPDATE tasks SET comments=%s WHERE id=%s", (json.dumps(current_comments), id))

    # Notify assignee if author is different
    if assignee and assignee != payload['authorId']:
        msg = f"Novo comentário em: {desc}"
        now = datetime.now().isoformat()
        cur.execute("INSERT INTO notifications (user_id, text, created_at, task_id) VALUES (%s, %s, %s, %s)", (assignee, msg, now, id))
        background_tasks.add_task(manager.broadcast, f"notification:{assignee}")

    conn.commit(); conn.close()

    background_tasks.add_task(manager.broadcast, "update") # To refresh chat UI for others
    return {"success": True}

@router.delete("/tasks/{id}")
def del_task(id: int, background_tasks: BackgroundTasks):
    conn = get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM tasks WHERE id=%s", (id,))
    conn.commit(); conn.close()
    # Notifica clientes
    background_tasks.add_task(manager.broadcast, "update")
    return {"success": True}

# --- ROTAS DE PADRÕES (STANDARDS) ---
@router.get("/standards")
def get_standards():
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, title, recurrence, subtasks FROM standard_tasks ORDER BY id ASC")
    res = row_to_dict(cur)
    for r in res:
        if isinstance(r['subtasks'], str): r['subtasks'] = json.loads(r['subtasks'])
    conn.close()
    return res

@router.post("/standards")
def create_standard(item: StandardTaskCreate):
    conn = get_db(); cur = conn.cursor()
    subs = json.dumps(item.subtasks)
    cur.execute("INSERT INTO standard_tasks (title, recurrence, subtasks) VALUES (%s, %s, %s) RETURNING id",
                (item.title, item.recurrence, subs))
    new_id = cur.fetchone()[0]
    conn.commit(); conn.close()
    return {"id": new_id}

@router.delete("/standards/{id}")
def delete_standard(id: int):
    conn = get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM standard_tasks WHERE id=%s", (id,))
    conn.commit(); conn.close()
    return {"success": True}