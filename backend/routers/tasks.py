from fastapi import APIRouter, Body, BackgroundTasks
from typing import Optional
import json
from ..database import get_db, row_to_dict
from ..schemas import TaskCreate, StandardTaskCreate
from ..realtime import manager
from datetime import datetime, timedelta

print(">>> LOADING TASKS ROUTER v3.0 (NORMALIZED) <<<")

router = APIRouter()

@router.get("/tasks")
def get_tasks():
    conn = get_db()
    try:
        cur = conn.cursor()

        # 1. Fetch Main Tasks
        query = """
            SELECT
                t.id, t.description as "desc", t.status, t.assigned_to as "assignedTo",
                t.priority as prio, t.due_date as "dueDate", t.completed_at as "completedAt",
                t.company_id as "companyId",
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
        tasks = row_to_dict(cur)

        # 2. Fetch All Subtasks (Normalized)
        # Avoid N+1 by fetching all and mapping in memory
        cur.execute("SELECT * FROM task_subtasks ORDER BY id ASC")
        all_subs = row_to_dict(cur)

        # Map subtasks to tasks
        subs_map = {}
        for s in all_subs:
            tid = s['task_id']
            if tid not in subs_map: subs_map[tid] = []
            subs_map[tid].append({
                "text": s['text'],
                "done": s['done'],
                "done_by": s['done_by'],
                "done_at": s['done_at']
            })

        # 3. Fetch All Comments (Normalized)
        cur.execute("SELECT * FROM task_comments ORDER BY created_at ASC")
        all_comms = row_to_dict(cur)

        # Map comments to tasks
        comms_map = {}
        for c in all_comms:
            tid = c['task_id']
            if tid not in comms_map: comms_map[tid] = []
            comms_map[tid].append({
                "text": c['text'],
                "author_id": c['author_id'],
                "created_at": c['created_at']
            })

        # 4. Assemble Result
        for t in tasks:
             # Handle assigneeIds (pg8000 might return string for json_agg)
             if t['assigneeIds']:
                 try:
                     if isinstance(t['assigneeIds'], str): t['assigneeIds'] = json.loads(t['assigneeIds'])
                 except: t['assigneeIds'] = []
             else:
                 t['assigneeIds'] = []

             # Attach Subtasks & Comments from Maps
             t['subtasks'] = subs_map.get(t['id'], [])
             t['comments'] = comms_map.get(t['id'], [])

        return tasks
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
                t.due_date AS "dueDate", t.completed_at AS "completedAt",
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

        # Populate subtasks for audit (optional, but good for completeness)
        # Doing individual queries here as Audit is usually paginated/small batch
        for t in res:
             cur.execute("SELECT text, done FROM task_subtasks WHERE task_id = %s", (t['id'],))
             subs = row_to_dict(cur)
             t['subtasks'] = subs # Simplified for Audit View

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
        # Note: 'subtasks' column in tasks table is ignored/deprecated now
        comp = int(t.companyId) if t.companyId else None

        # Primary Assignee Logic
        assign = None
        if t.assignedTo: assign = int(t.assignedTo)
        elif t.assigneeIds and len(t.assigneeIds) > 0: assign = int(t.assigneeIds[0])

        cur.execute("INSERT INTO tasks (description, status, assigned_to, priority, due_date, completed_at, company_id, recurrence, recurrence_day, sector_id, recurrence_active, due_offset) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id",
                    (t.desc, t.status, assign, t.prio, t.dueDate, t.completedAt, comp, t.recurrence, t.recurrenceDay, t.sectorId, t.recurrenceActive, t.dueOffset))

        tid = cur.fetchone()[0]

        # Insert Normalized Subtasks
        if t.subtasks:
            for s in t.subtasks:
                # TaskCreate subtasks are objects or dicts
                txt = s.text
                done = s.done
                done_by = s.done_by
                done_at = s.done_at
                cur.execute("INSERT INTO task_subtasks (task_id, text, done, done_by, done_at) VALUES (%s, %s, %s, %s, %s)",
                            (tid, txt, done, done_by, done_at))

        # Multiple Assignees Insert
        notified_users = set()

        if t.assigneeIds:
            for uid in t.assigneeIds:
                try:
                    cur.execute("INSERT INTO task_assignees (task_id, user_id) VALUES (%s, %s)", (tid, int(uid)))
                    notified_users.add(int(uid))
                except: pass

        if assign and assign not in notified_users:
             try:
                 cur.execute("INSERT INTO task_assignees (task_id, user_id) VALUES (%s, %s)", (tid, assign))
                 notified_users.add(assign)
             except: pass

        # Notifications
        now = datetime.now().isoformat()
        msg = f"Nova tarefa: {t.desc}"

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
                # Calculate new due_date based on offset
                due_offset = t.get('due_offset', 0) or 0
                final_due_date = target_date
                if due_offset > 0:
                    try:
                        base_dt = datetime.strptime(target_date, "%Y-%m-%d")
                        final_due_date = (base_dt + timedelta(days=due_offset)).date().isoformat()
                    except: pass

                # Check if already created (using target_date which is creation date logic, but unique constraint might need review.
                # For now checking same description and company created TODAY (or for this recurrence cycle))
                # Actually original logic checked due_date = target_date. Now due_date changes.
                # We should check if a task was created FROM THIS MASTER for this cycle.
                # But we don't link back.
                # Original logic: SELECT id ... WHERE ... AND due_date = %s (target_date)
                # If we change due_date, we might create duplicates if we run this multiple times a day.
                # Let's keep checking using the final_due_date or maybe we should store "recurrence_origin_date"?
                # For simplicity and backward compat, we check if a task exists with the CALCULATED due_date.

                comp_val = t['company_id']
                if comp_val is None:
                    query = "SELECT id FROM tasks WHERE description = %s AND due_date = %s AND company_id IS NULL"
                    params = (t['description'], final_due_date)
                else:
                    query = "SELECT id FROM tasks WHERE description = %s AND due_date = %s AND company_id = %s"
                    params = (t['description'], final_due_date, comp_val)

                cur.execute(query, params)

                if not cur.fetchone():
                    # Fetch master subtasks (Normalized)
                    cur.execute("SELECT text FROM task_subtasks WHERE task_id = %s", (t['id'],))
                    master_subs = [r[0] for r in cur.fetchall()]

                    cur.execute(
                        "INSERT INTO tasks (description, status, assigned_to, priority, due_date, completed_at, company_id, recurrence, recurrence_day, sector_id) VALUES (%s, %s, %s, %s, %s, %s, %s, 'none', None, %s) RETURNING id",
                        (t['description'], 'todo', t['assigned_to'], t['priority'], final_due_date, None, t['company_id'], t['sector_id'])
                    )
                    new_tid = cur.fetchone()[0]

                    # Insert Subtasks
                    for txt in master_subs:
                        cur.execute("INSERT INTO task_subtasks (task_id, text, done) VALUES (%s, %s, FALSE)", (new_tid, txt))

                    # Fetch original assignees
                    cur.execute("SELECT user_id FROM task_assignees WHERE task_id = %s", (t['id'],))
                    orig_assignees = [r[0] for r in cur.fetchall()]

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

        cur.execute("SELECT assigned_to, description FROM tasks WHERE id=%s", (id,))
        row = cur.fetchone()
        old_assign = row[0] if row else None
        desc = row[1] if row else "Tarefa"

        if 'status' in t:
            updates.append("status=%s"); params.append(t['status'])
        if 'completedAt' in t:
            updates.append("completed_at=%s"); params.append(t['completedAt'])

        # Subtasks handling: SYNC Strategy (Delete All & Insert New)
        if 'subtasks' in t:
            # We don't update tasks table column 'subtasks' anymore
            # 1. Delete existing
            cur.execute("DELETE FROM task_subtasks WHERE task_id = %s", (id,))
            # 2. Insert new
            new_subs = t['subtasks']
            if isinstance(new_subs, str): new_subs = json.loads(new_subs)

            for s in new_subs:
                # Handle possible dict or object structure
                txt = s.get('text', '')
                done = s.get('done', False)
                done_by = s.get('done_by')
                done_at = s.get('done_at')

                cur.execute("INSERT INTO task_subtasks (task_id, text, done, done_by, done_at) VALUES (%s, %s, %s, %s, %s)",
                            (id, txt, done, done_by, done_at))

        if 'assignedTo' in t:
            updates.append("assigned_to=%s"); val = t['assignedTo']; params.append(int(val) if val else None)
        if 'dueDate' in t:
            updates.append("due_date=%s"); params.append(t['dueDate'])
        if 'prio' in t:
            updates.append("priority=%s"); params.append(t['prio'])
        if 'recurrence' in t:
            updates.append("recurrence=%s"); params.append(t['recurrence'])
        if 'recurrenceDay' in t:
            updates.append("recurrence_day=%s"); params.append(t['recurrenceDay'])
        if 'dueOffset' in t:
            updates.append("due_offset=%s"); params.append(t['dueOffset'])

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

        # Get assignee for notification
        cur.execute("SELECT assigned_to, description FROM tasks WHERE id=%s", (id,))
        row = cur.fetchone()
        if not row: return {"error": "Not found"}

        assignee = row[0]
        desc = row[1]

        # INSERT into normalized table
        created_at = datetime.now().isoformat()
        cur.execute("INSERT INTO task_comments (task_id, text, author_id, created_at) VALUES (%s, %s, %s, %s)",
                    (id, payload['text'], payload['authorId'], created_at))

        # Notify assignee if author is different
        if assignee and assignee != payload['authorId']:
            msg = f"Novo comentário em: {desc}"
            cur.execute("INSERT INTO notifications (user_id, text, created_at, task_id) VALUES (%s, %s, %s, %s)", (assignee, msg, created_at, id))
            background_tasks.add_task(manager.broadcast, f"notification:{assignee}")

        conn.commit()

        background_tasks.add_task(manager.broadcast, "update")
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
                t.due_offset as "dueOffset",
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
