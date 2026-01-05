# TaskFlow Enterprise

## Instalação

1.  Instale Python 3.10+
2.  Instale dependências:
    ```bash
    pip install -r requirements.txt
    ```
    (Certifique-se de que `python-multipart` e `websockets` estão no requirements ou instalados)

## Execução

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

## Funcionalidades

*   **Dashboard TV**: Visualização otimizada para monitores.
*   **Chat Interno**: Comunicação em tempo real com envio de arquivos.
*   **Notificações**: Alertas de atribuição de tarefas.
*   **Calendário**: Visão cronológica das tarefas.
*   **Recorrência**: Geração automática de tarefas recorrentes (Diário/Semanal/Mensal/Quinzenal).

## Solução de Problemas

*   **Erro de Conexão**: Verifique se o Backend está rodando.
*   **Logs**: O sistema usa WebSockets. Desconexões ocasionais são normais e reconectam automaticamente.
