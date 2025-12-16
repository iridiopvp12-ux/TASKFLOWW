from fastapi import APIRouter, Body
import json
from ..database import get_db, row_to_dict
from ..schemas import CompanyCreate

router = APIRouter()

@router.get("/companies")
def get_comps():
    conn = get_db(); cur = conn.cursor()
    cur.execute('SELECT id, name, default_assignee as "defaultAssignee", templates FROM companies')
    res = row_to_dict(cur)
    for c in res:
         # --- CORREÇÃO DE SEGURANÇA ---
         # Se templates for None (nulo no banco), transforma em lista vazia para não travar o front
         if c['templates'] is None:
             c['templates'] = []
         # Se for string (JSON), converte para lista
         elif isinstance(c['templates'], str):
             c['templates'] = json.loads(c['templates'])

    conn.close()
    return res

@router.post("/companies")
def create_comp(c: CompanyCreate):
    conn = get_db(); cur = conn.cursor()
    tpl = json.dumps(c.templates)
    assign = int(c.defaultAssignee) if c.defaultAssignee else None
    cur.execute("INSERT INTO companies (name, default_assignee, templates) VALUES (%s, %s, %s) RETURNING id", (c.name, assign, tpl))
    cid = cur.fetchone()[0]
    conn.commit(); conn.close()
    return {"id": cid}

@router.put("/companies/{id}")
def update_comp(id: int, c: CompanyCreate):
    conn = get_db(); cur = conn.cursor()
    tpl = json.dumps(c.templates)
    assign = int(c.defaultAssignee) if c.defaultAssignee else None
    cur.execute("UPDATE companies SET name=%s, default_assignee=%s, templates=%s WHERE id=%s", (c.name, assign, tpl, id))
    conn.commit(); conn.close()
    return {"success": True}

@router.put("/companies/{id}/templates")
def update_templates(id: int, payload: dict = Body(...)):
    conn = get_db(); cur = conn.cursor()
    tpl = json.dumps(payload.get('templates', []))
    cur.execute("UPDATE companies SET templates=%s WHERE id=%s", (tpl, id))
    conn.commit(); conn.close()
    return {"success": True}

@router.delete("/companies/{id}")
def del_comp(id: int):
    conn = get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM companies WHERE id=%s", (id,))
    conn.commit(); conn.close()
    return {"success": True}
