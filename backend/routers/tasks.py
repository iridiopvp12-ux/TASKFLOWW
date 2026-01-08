from fastapi import APIRouter, Body, BackgroundTasks
from typing import Optional
import json
from ..database import get_db, row_to_dict
from ..schemas import TaskCreate, StandardTaskCreate
from ..realtime import manager
from datetime import datetime

print(">>> LOADING TASKS ROUTER v2.1 (FIXED) <<<")

router = APIRouter()

@router.get("/tasks")
def get_tasks():
    conn = get_db()
    try:
        cur = conn.cursor()
        # Updated query to include sector info and fetch assignees
        # Since we can't easily join list in standard SQL (pg8000 might struggle with arrays),
        # we'll fetch tasks first, then fetch assignee map in memory or subquery if feasible.
        # Let's try JSON aggregation for assignees.

        query = """
            SELECT
                t.id, t.description as "desc", t.status, t.assigned_to as "assignedTo",
                t.priority as prio, t.due_date as "dueDate", t.completed_at as "completedAt",
                t.company_id as "companyId", t.subtasks, t.comments,
                t.recurrence, t.recurrence_day as "recurrenceDay",
                t.recurrence_active as "recurrenceActive",
                t.sector_id as "sectorId",
                c.name as "companyName", u.name as "userName",
                s.name as "sectorName",
                COALESCE((SELECT json_agg(user_id) FROM task_assignees WHERE task_id = t.id), '[]'::json) as "assigneeIds"
            FROM tasks t
            LEFT JOIN companies c ON t.company_id = c.id
            LEFT JOIN users u ON t.assigned_to = u.id
            LEFT JOIN sectors s ON t.sector_id = s.id
            ORDER BY t.id DESC
        """
        cur.execute(query)
        res = row_to_dict(cur)
        for t in res:
             if isinstance(t['subtasks'], str): t['subtasks'] = json.loads(t['subtasks'])
             if t['comments'] is None: t['comments'] = []
             elif isinstance(t['comments'], str): t['comments'] = json.loads(t['comments'])

             # Handle assigneeIds
             if t['assigneeIds']:
                 try:
                     if isinstance(t['assigneeIds'], str): t['assigneeIds'] = json.loads(t['assigneeIds'])
                 except: t['assigneeIds'] = []
             else:
                 t['assigneeIds'] = []

        return res
    finally:
        conn.close()

# 🛡️ ROTA DE AUDITORIA
@router.get("/audit-tasks")
def get_audit_tasks(
    user_id: Optional[int] = None,
    company_id: Optional[int] = None,
    date_start: Optional[str] = None,
    date_end: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    skip: int = 0,
    limit: int = 100
):
    conn = get_db()
    try:
        cur = conn.cursor()

        query_parts = []
        params = []

        # Se status for fornecido, filtra por ele.
        if status:
            query_parts.append("t.status = %s")
            params.append(status)

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

        return {"data": res, "total": total_count, "limit": limit, "skip": skip}
    finally:
        conn.close()

@router.post("/tasks")
def create_task(t: TaskCreate, background_tasks: BackgroundTasks):
    conn = get_db()
    try:
        cur = conn.cursor()
        sub_json = json.dumps([s.model_dump() for s in t.subtasks])
        comp = int(t.companyId) if t.companyId else None

        # Primary Assignee Logic
        assign = None
        if t.assignedTo: assign = int(t.assignedTo)
        elif t.assigneeIds and len(t.assigneeIds) > 0: assign = int(t.assigneeIds[0]) # Default to first if not specified

        cur.execute("INSERT INTO tasks (description, status, assigned_to, priority, due_date, completed_at, company_id, subtasks, recurrence, recurrence_day, sector_id, recurrence_active) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                    (t.desc, t.status, assign, t.prio, t.dueDate, t.completedAt, comp, sub_json, t.recurrence, t.recurrenceDay, t.sectorId, t.recurrenceActive))

        tid = cur.fetchone()[0]

        # Multiple Assignees Insert
        notified_users = set()

        # Insert list
        if t.assigneeIds:
            for uid in t.assigneeIds:
                try:
                    cur.execute("INSERT INTO task_assignees (task_id, user_id) VALUES (%s, %s)", (tid, int(uid)))
                    notified_users.add(int(uid))
                except: pass # Ignore dups

        # Ensure primary assign is in list if not already
        if assign and assign not in notified_users:
             try:
                 cur.execute("INSERT INTO task_assignees (task_id, user_id) VALUES (%s, %s)", (tid, assign))
                 notified_users.add(assign)
             except: pass

        # Notifications
        now = datetime.now().isoformat()
        msg = f"Nova tarefa: {t.desc}"

        # If Sector Assigned, notify everyone in sector? (Maybe too noisy, skipping for now unless asked)
        # Notify specific assignees
        for uid in notified_users:
            cur.execute("INSERT INTO notifications (user_id, text, created_at, task_id) VALUES (%s, %s, %s, %s)", (uid, msg, now, tid))
            background_tasks.add_task(manager.broadcast, f"notification:{uid}")

        conn.commit()
        background_tasks.add_task(manager.broadcast, "update")

        return {"id": tid}
    finally:
        conn.close()

@router.post("/tasks/process-recurrence")
def process_recurrence(background_tasks: BackgroundTasks):
    conn = get_db()
    try:
        cur = conn.cursor()

        # Added filtering for active recurrence
        cur.execute("SELECT * FROM tasks WHERE recurrence IN ('daily', 'weekly', 'monthly', 'fortnightly') AND recurrence_active = TRUE")
        masters = row_to_dict(cur)

        created_count = 0
        today = datetime.now().date()
        today_str = today.isoformat()

        for t in masters:
            should_create = False
            target_date = today_str

            t_date_str = t['due_date']
            if not t_date_str: continue

            try:
                t_date = datetime.strptime(str(t_date_str), "%Y-%m-%d").date()
            except ValueError:
                continue

            if t['recurrence'] == 'daily':
                if t_date and today > t_date: should_create = True

            elif t['recurrence'] == 'weekly':
                rec_day = t['recurrence_day']
                if rec_day is not None and today.weekday() == rec_day:
                    if t_date and today > t_date: should_create = True

            elif t['recurrence'] == 'monthly':
                rec_day = t['recurrence_day']
                if rec_day is not None and today.day == rec_day:
                    if t_date and today > t_date: should_create = True

            elif t['recurrence'] == 'fortnightly':
                if t_date:
                    delta = (today - t_date).days
                    if delta > 0 and delta % 15 == 0: should_create = True

            if should_create:
                # CORREÇÃO CRÍTICA 2: Evitar parâmetro ambíguo no SQL para NULL
                # Construir query condicional
                comp_val = t['company_id']
                if comp_val is None:
                    query = "SELECT id FROM tasks WHERE description = %s AND due_date = %s AND company_id IS NULL"
                    params = (t['description'], target_date)
                else:
                    query = "SELECT id FROM tasks WHERE description = %s AND due_date = %s AND company_id = %s"
                    params = (t['description'], target_date, comp_val)

                cur.execute(query, params)

                if not cur.fetchone():
                    # Create task
                    sub_json = json.dumps(t['subtasks']) if isinstance(t['subtasks'], list) else t['subtasks']
                    if not sub_json: sub_json = '[]'

                    subs = json.loads(sub_json)
                    for s in subs:
                        s['done'] = False
                        s['done_by'] = None
                        s['done_at'] = None
                    sub_json_new = json.dumps(subs)

                    # Fetch original assignees
                    cur.execute("SELECT user_id FROM task_assignees WHERE task_id = %s", (t['id'],))
                    orig_assignees = [r[0] for r in cur.fetchall()]

                    cur.execute(
                        "INSERT INTO tasks (description, status, assigned_to, priority, due_date, completed_at, company_id, subtasks, recurrence, recurrence_day, sector_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                        (t['description'], 'todo', t['assigned_to'], t['priority'], target_date, None, t['company_id'], sub_json_new, 'none', None, t['sector_id'])
                    )
                    new_tid = cur.fetchone()[0]

                    # Copy assignees
                    for uid in orig_assignees:
                        try:
                            cur.execute("INSERT INTO task_assignees (task_id, user_id) VALUES (%s, %s)", (new_tid, uid))
                        except: pass

                    created_count += 1

        conn.commit()

        if created_count > 0:
            background_tasks.add_task(manager.broadcast, "update")

        return {"processed": len(masters), "created": created_count}
    finally:
        conn.close()

@router.put("/tasks/{id}")
def update_task(id: int, background_tasks: BackgroundTasks, t: dict = Body(...)):
    conn = get_db()
    try:
        cur = conn.cursor()
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

        background_tasks.add_task(manager.broadcast, "update")
        return {"success": True}
    finally:
        conn.close()

@router.post("/tasks/{id}/comments")
def add_comment(id: int, background_tasks: BackgroundTasks, payload: dict = Body(...)):
    # payload: { text: "...", authorId: 123 }
    conn = get_db()
    try:
        cur = conn.cursor()

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

        conn.commit()

        background_tasks.add_task(manager.broadcast, "update") # To refresh chat UI for others
        return {"success": True}
    finally:
        conn.close()

@router.delete("/tasks/{id}")
def del_task(id: int, background_tasks: BackgroundTasks):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM tasks WHERE id=%s", (id,))
        conn.commit()
        # Notifica clientes
        background_tasks.add_task(manager.broadcast, "update")
        return {"success": True}
    finally:
        conn.close()

@router.get("/recurrent-tasks")
def get_recurrent_tasks():
    conn = get_db()
    try:
        cur = conn.cursor()
        query = """
            SELECT
                t.id, t.description as "desc", t.status, t.assigned_to as "assignedTo",
                t.recurrence, t.recurrence_day as "recurrenceDay", t.recurrence_active as "recurrenceActive",
                t.sector_id as "sectorId",
                c.name as "companyName", u.name as "userName",
                s.name as "sectorName"
            FROM tasks t
            LEFT JOIN companies c ON t.company_id = c.id
            LEFT JOIN users u ON t.assigned_to = u.id
            LEFT JOIN sectors s ON t.sector_id = s.id
            WHERE t.recurrence IS NOT NULL AND t.recurrence != 'none'
            ORDER BY t.id DESC
        """
        cur.execute(query)
        res = row_to_dict(cur)
        return res
    finally:
        conn.close()

@router.put("/tasks/{id}/toggle-recurrence")
def toggle_recurrence(id: int, background_tasks: BackgroundTasks):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT recurrence_active FROM tasks WHERE id=%s", (id,))
        row = cur.fetchone()
        if not row: return {"error": "Not found"}

        # Toggle boolean (handle None as True default, but better explicitly)
        current = row[0]
        if current is None: current = True
        new_val = not current

        cur.execute("UPDATE tasks SET recurrence_active=%s WHERE id=%s", (new_val, id))
        conn.commit()

        # Opcional: Notificar update
        background_tasks.add_task(manager.broadcast, "update")

        return {"id": id, "recurrenceActive": new_val}
    finally:
        conn.close()

# --- ROTAS DE PADRÕES (STANDARDS) ---
@router.get("/standards")
def get_standards():
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, title, recurrence, subtasks FROM standard_tasks ORDER BY id ASC")
        res = row_to_dict(cur)
        for r in res:
            if isinstance(r['subtasks'], str): r['subtasks'] = json.loads(r['subtasks'])
        return res
    finally:
        conn.close()

@router.post("/standards")
def create_standard(item: StandardTaskCreate):
    conn = get_db()
    try:
        cur = conn.cursor()
        subs = json.dumps(item.subtasks)
        cur.execute("INSERT INTO standard_tasks (title, recurrence, subtasks) VALUES (%s, %s, %s) RETURNING id",
                    (item.title, item.recurrence, subs))
        new_id = cur.fetchone()[0]
        conn.commit()
        return {"id": new_id}
    finally:
        conn.close()

@router.delete("/standards/{id}")
def delete_standard(id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM standard_tasks WHERE id=%s", (id,))
        conn.commit()
        return {"success": True}
    finally:
        conn.close()
