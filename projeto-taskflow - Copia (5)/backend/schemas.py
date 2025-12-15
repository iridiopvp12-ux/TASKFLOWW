from pydantic import BaseModel
from typing import List, Optional, Any

# ==========================================
# MODELOS DE DADOS (SCHEMAS)
# ==========================================

class Subtask(BaseModel):
    text: str
    done: bool = False
    done_by: Optional[int] = None 
    done_at: Optional[str] = None 

class UserLogin(BaseModel):
    id: int
    password: str

class UserCreate(BaseModel):
    name: str
    role: str
    roleDesc: str
    initials: str
    color: str
    password: str

class TaskCreate(BaseModel):
    desc: str
    dueDate: str
    assignedTo: Optional[int] = None 
    prio: str
    companyId: Optional[str] = None 
    subtasks: List[Subtask] = [] 
    status: str = "todo"
    completedAt: Optional[str] = None
    recurrence: Optional[str] = "none"
    recurrenceDay: Optional[int] = None
    
class CompanyCreate(BaseModel):
    name: str
    defaultAssignee: Optional[int] = None
    templates: List[dict] = []

# Necessário para salvar padrões no banco
class StandardTaskCreate(BaseModel):
    title: str
    recurrence: str
    subtasks: List[str] = []