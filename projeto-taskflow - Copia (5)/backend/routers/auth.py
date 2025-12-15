from fastapi import APIRouter
from ..database import get_db, row_to_one, verify_pass
from ..schemas import UserLogin

router = APIRouter()

@router.post("/login")
def login(user: UserLogin):
    conn = get_db()
    cur = conn.cursor()
    # Busca o usuário pelo ID
    cur.execute("SELECT * FROM users WHERE id = %s", (user.id,))
    db_user = row_to_one(cur)
    conn.close()
    
    # Verifica senha e retorna dados limpos (sem o hash)
    if db_user and verify_pass(user.password, db_user['password_hash']):
        db_user['roleDesc'] = db_user['role_desc']
        del db_user['password_hash']
        return {"success": True, "user": db_user}
    
    return {"success": False}