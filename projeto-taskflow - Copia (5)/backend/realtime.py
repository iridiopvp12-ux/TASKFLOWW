from fastapi import WebSocket
from typing import List

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        # Itera sobre uma cópia para evitar erros se a lista mudar durante a iteração
        for connection in self.active_connections[:]:
            try:
                await connection.send_text(message)
            except Exception:
                # Se falhar ao enviar (ex: desconectou abruptamente), remove
                self.disconnect(connection)

manager = ConnectionManager()
