# 🚀 Guia de Deploy Profissional - TaskFlow Enterprise

Este guia cobre os melhores métodos para colocar o TaskFlow em produção, garantindo segurança e estabilidade.

## 📋 Pré-requisitos
- **Servidor:** Uma VPS (DigitalOcean, AWS, Hetzner) ou PaaS (Railway, Render, Google Cloud Run).
- **Banco de Dados:** PostgreSQL (Recomendado versão 13+).
- **Domínio:** (Opcional, mas recomendado para SSL/HTTPS).

---

## 🛠️ Método 1: Docker (Recomendado)
O método mais robusto e fácil de manter. O projeto já inclui um `Dockerfile` otimizado.

### 1. Configurar Variáveis de Ambiente
Crie um arquivo `.env` na raiz (baseado no `.env.example`) com as credenciais do seu banco de produção:

```ini
DB_HOST=seu-host-postgres.com
DB_USER=seu_usuario
DB_PASS=sua_senha_secreta
DB_NAME=taskflow_prod
DB_PORT=5432
```

### 2. Build e Execução
No servidor, rode:

```bash
# 1. Construir a imagem
docker build -t taskflow-app .

# 2. Rodar o container (na porta 80)
docker run -d \
  -p 80:8080 \
  --env-file .env \
  --name taskflow \
  --restart always \
  taskflow-app
```

*Nota: O Dockerfile expõe a porta 8080. Mapeamos para a 80 externa para acesso web direto.*

---

## 🐧 Método 2: Instalação Manual (Linux/Ubuntu)
Para quem prefere configurar o ambiente "na unha".

### 1. Instalar Dependências do Sistema
```bash
sudo apt update
sudo apt install python3-pip python3-venv postgresql libpq-dev
```

### 2. Configurar o Projeto
```bash
# Clonar/Copiar arquivos
git clone seu-repo-taskflow /opt/taskflow
cd /opt/taskflow

# Criar ambiente virtual
python3 -m venv venv
source venv/bin/activate

# Instalar dependências Python
pip install -r requirements.txt
```

### 3. Executar com Gunicorn (Servidor de Produção)
Não use `python main.py` em produção. Use `gunicorn` com workers `uvicorn`.

```bash
pip install gunicorn
```

Crie um serviço do systemd para manter o app rodando: `/etc/systemd/system/taskflow.service`

```ini
[Unit]
Description=TaskFlow Server
After=network.target

[Service]
User=root
WorkingDirectory=/opt/taskflow
Environment="PATH=/opt/taskflow/venv/bin"
EnvironmentFile=/opt/taskflow/.env
ExecStart=/opt/taskflow/venv/bin/gunicorn -w 4 -k uvicorn.workers.UvicornWorker backend.main:app --bind 0.0.0.0:80

[Install]
WantedBy=multi-user.target
```

Ative o serviço:
```bash
sudo systemctl enable taskflow
sudo systemctl start taskflow
```

---

## ☁️ Método 3: PaaS (Railway / Render)
Plataformas que gerenciam tudo para você.

1.  Conecte seu repositório GitHub.
2.  Adicione as Variáveis de Ambiente (`DB_HOST`, etc) no painel da plataforma.
3.  **Comando de Start:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
4.  O banco de dados PostgreSQL geralmente é fornecido pela própria plataforma (adicione o Add-on).

---

## 🔒 Checklist de Segurança (Antes de Postar)

1.  **HTTPS:** Use Cloudflare ou Let's Encrypt (Certbot) na frente do servidor. O chat e downloads funcionam melhor com HTTPS.
2.  **Senhas Fortes:** Altere a senha do usuário `admin` logo no primeiro acesso.
3.  **Backup:** Configure backups automáticos do banco PostgreSQL.
