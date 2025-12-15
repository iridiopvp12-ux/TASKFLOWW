import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles # Import moved to top
from fastapi.responses import FileResponse # Import moved to top
import os

from backend.database import init_db
from backend.realtime import manager

import backend.routers.auth as auth
import backend.routers.users as users
import backend.routers.companies as companies
import backend.routers.tasks as tasks
import backend.routers.notifications as notifications

app = FastAPI()

# 1. Configuração de CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Inicialização do Banco
@app.on_event("startup")
def startup_event():
    init_db()

# 3. Rotas da API (Backend)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(companies.router)
app.include_router(tasks.router)
app.include_router(notifications.router)

# 3.1 Rota WebSocket (Realtime)
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # Mantém a conexão viva e pode receber pings do cliente se necessário
            data = await websocket.receive_text()
            # Opcional: Se o cliente enviar algo, podemos processar aqui
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# 4. Configuração do Frontend (PRECISA SER ANTES DO IF MAIN)
# Serve os arquivos CSS e JS
app.mount("/css", StaticFiles(directory="frontend/css"), name="css")
app.mount("/js", StaticFiles(directory="frontend/js"), name="js")

# Serve o HTML principal na raiz
@app.get("/")
async def read_index():
    return FileResponse('frontend/index.html')

# 5. Iniciar o Servidor
if __name__ == "__main__":
    # Certifique-se de rodar este comando na pasta raiz do projeto!
    print("🚀 Servidor iniciando em http://localhost:8000")
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)