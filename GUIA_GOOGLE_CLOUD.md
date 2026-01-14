# ☁️ Guia de Deploy no Google Cloud Platform (GCP)

Este guia oferece duas opções para rodar o TaskFlow no Google Cloud.

> **🚨 IMPORTANTE SOBRE ARQUIVOS (UPLOADS):**
> O TaskFlow salva imagens e arquivos na pasta local `frontend/uploads`.
> *   **Opção A (Compute Engine - VM):** Os arquivos ficam salvos no disco da máquina (Seguro e Simples). ✅ **Recomendado para este app.**
> *   **Opção B (Cloud Run):** O disco é temporário. Se o serviço reiniciar, **todos os arquivos enviados no chat somem**. Só use se planeja alterar o código para usar Google Cloud Storage.

---

## 🖥️ Opção A: Google Compute Engine (Máquina Virtual) - Recomendado
Funciona como um PC ligado 24h. Mantém seus arquivos salvos.

### 1. Criar a Máquina
1. Acesse o [Console do Google Cloud](https://console.cloud.google.com/).
2. Vá em **Compute Engine** > **Instâncias de VM**.
3. Clique em **Criar Instância**.
   - **Nome:** `taskflow-server`
   - **Região:** Escolha a mais próxima (ex: `southamerica-east1` para Brasil).
   - **Tipo:** `e2-micro` (Grátis/Barato) ou `e2-small` (Melhor performance).
   - **Disco de Inicialização:** Ubuntu 22.04 LTS.
   - **Firewall:** Marque "Permitir tráfego HTTP" e "HTTPS".
4. Clique em **Criar**.

### 2. Acessar e Instalar
1. Na lista de VMs, clique no botão **SSH** ao lado da sua instância.
2. No terminal que abrir, instale o Docker:
   ```bash
   sudo apt update
   sudo apt install -y docker.io docker-compose git
   ```

### 3. Baixar e Configurar
1. Clone seu repositório (ou copie os arquivos):
   ```bash
   git clone https://github.com/SEU_USUARIO/SEU_REPO.git taskflow
   cd taskflow
   ```
2. Crie o arquivo de configuração:
   ```bash
   nano .env
   ```
   Cole suas configurações de banco de dados (Cloud SQL ou um Postgres instalado na mesma VM):
   ```ini
   DB_HOST=localhost  # Ou IP do Cloud SQL
   DB_USER=taskflow
   DB_PASS=sua_senha
   DB_NAME=taskflow
   ```
   *(Salver com Ctrl+O, Enter, Ctrl+X)*

### 4. Rodar o App
```bash
# Constrói a imagem
sudo docker build -t taskflow-app .

# Roda o app na porta 80 (HTTP padrão)
sudo docker run -d \
  -p 80:8080 \
  --env-file .env \
  --name taskflow \
  --restart always \
  -v $(pwd)/frontend/uploads:/app/frontend/uploads \
  taskflow-app
```
> **Nota:** A flag `-v ...` garante que os uploads fiquem salvos na pasta da VM, mesmo se atualizar o Docker.

---

## 🚀 Opção C: Docker Compose (Mais Fácil)
Se você escolheu a VM (Opção A), esta é a forma mais simples de subir **App + Banco de Dados** com um só comando.

1. **Acessar e Baixar (como na Opção A)**
   ```bash
   git clone https://github.com/SEU_USUARIO/SEU_REPO.git taskflow
   cd taskflow
   ```

2. **Rodar Tudo**
   O arquivo `docker-compose.yml` já está configurado.
   ```bash
   sudo docker compose up -d --build
   ```

   Isso vai:
   - Baixar e subir um banco PostgreSQL (versão 13).
   - Configurar usuários e senhas automaticamente.
   - Construir e rodar o TaskFlow na porta 80.
   - Salvar dados do banco e uploads no disco.

---

## 🏃 Opção B: Google Cloud Run (Serverless)
Escala automática, mas requer banco externo e **não salva arquivos locais permanentemente**.

### 1. Pré-requisitos
- Tenha o `gcloud CLI` instalado no seu PC ou use o **Cloud Shell** no navegador.
- Tenha um banco PostgreSQL pronto (Google Cloud SQL).

### 2. Enviar para o Container Registry
No seu PC, na pasta do projeto:
```bash
# 1. Autenticar
gcloud auth login
gcloud config set project [SEU_ID_DO_PROJETO]

# 2. Construir e Enviar a imagem
gcloud builds submit --tag gcr.io/[SEU_ID_DO_PROJETO]/taskflow-app
```

### 3. Fazer o Deploy
```bash
gcloud run deploy taskflow \
  --image gcr.io/[SEU_ID_DO_PROJETO]/taskflow-app \
  --platform managed \
  --region southamerica-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars DB_HOST=[IP_DO_BANCO],DB_USER=[USER],DB_PASS=[SENHA],DB_NAME=taskflow
```

---

## 🗄️ Banco de Dados (Cloud SQL)
Para ambas as opções, o ideal é usar um banco gerenciado:
1. Vá em **SQL** no console do Google Cloud.
2. Crie uma instância **PostgreSQL**.
3. Crie um banco de dados chamado `taskflow` e um usuário.
4. Pegue o **IP Público** da instância e use na variável `DB_HOST`.
   *Nota: Lembre-se de autorizar o IP da sua VM ou do Cloud Run nas configurações de "Conexões" do SQL.*
