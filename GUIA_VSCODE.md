# 🚀 Rodando Tudo Pelo VS Code

Como você prefere usar o terminal integrado do VS Code e seu Ngrok está na Área de Trabalho, siga estes passos para manter tudo organizado.

### 1️⃣ Abra o Terminal do VS Code
*   No menu superior, clique em **Terminal** > **New Terminal** (ou pressione `Ctrl + '`).

### 2️⃣ Terminal 1: Iniciar o Servidor (Backend)
Neste primeiro terminal que abriu, digite o comando para iniciar o TaskFlow:

```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
*(Deixe esse terminal rodando. Você verá mensagens de "Application startup complete".)*

---

### 3️⃣ Terminal 2: Iniciar o Ngrok
Agora vamos abrir uma segunda aba de terminal para o Ngrok.

1.  No painel do terminal (canto direito), clique no botão **`+`** (ou na setinha ao lado dele) para criar um novo terminal.
2.  Agora você precisa ir até a Área de Trabalho onde o `ngrok.exe` está. Digite:

```bash
cd %USERPROFILE%\Desktop
```

3.  Agora inicie o Ngrok apontando para a porta 8000:

```bash
ngrok http 8000
```

### ✅ Pronto!
*   Copie o link `https://...ngrok-free.app` que apareceu no Terminal 2.
*   Pode minimizar o painel do terminal se quiser, mas **não feche** as lixeiras (botão de excluir terminal), senão o site sai do ar.
