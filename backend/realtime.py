from fastapi import WebSocket
from typing import List, Dict, Optional

class ConnectionManager:
    def __init__(self):
        # Mapeia user_id -> lista de conexões (um usuário pode ter várias abas)
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: str, user_id: int):
        """Envia mensagem para todas as conexões ativas de um usuário específico."""
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(message)
                except Exception:
                    # Se falhar, assume desconexão no próximo ciclo ou deixa o disconnect limpar
                    pass

    async def broadcast(self, message: str):
        """Envia mensagem para TODOS os usuários conectados."""
        for user_id, connections in self.active_connections.items():
            for connection in connections:
                try:
                    await connection.send_text(message)
                except Exception:
                    pass

manager = ConnectionManager()
