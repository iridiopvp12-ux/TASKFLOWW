# 🌐 Guia: Colocando o TaskFlow Online (Acesso Externo)

Este guia explica como usar seu computador como servidor para acessar o TaskFlow de qualquer lugar (via Internet), permitindo testar a interface Mobile no seu celular enquanto mantém o banco de dados no seu PC.

## 🚀 Passo 1: Instalar o Ngrok
O **Ngrok** é uma ferramenta segura que cria um "túnel" do seu PC para a internet.

1.  Acesse o site oficial: [https://ngrok.com/download](https://ngrok.com/download)
2.  Faça o download da versão para seu sistema (Windows, Mac ou Linux).
3.  **Windows**: Extraia o arquivo baixado (`ngrok.exe`) para uma pasta de fácil acesso (ex: Área de Trabalho ou a própria pasta do projeto).
4.  Crie uma conta gratuita no site do ngrok para obter seu **Authtoken**.
5.  Abra o terminal (Prompt de Comando) e configure seu token (copie do site):
    ```bash
    ngrok config add-authtoken SEU_TOKEN_AQUI
    ```

---

## 💻 Passo 2: Iniciar o TaskFlow
Antes de colocar na internet, o sistema precisa estar rodando no seu PC.

1.  Abra a pasta do projeto `projeto-taskflow`.
2.  **Windows**: Dê um duplo clique no arquivo `start_public.bat`.
    *   *Nota: Uma janela preta vai abrir indicando que o servidor está rodando na porta 8000. Não feche essa janela.*
3.  **Linux/Mac**: No terminal, execute `./start_public.sh`.

---

## 🔗 Passo 3: Criar o Link Público
Agora vamos gerar o link para acessar pelo celular.

1.  Abra um **NOVO** terminal (Prompt de Comando ou PowerShell).
2.  Navegue até onde o `ngrok` está (se não estiver instalado no sistema todo) e digite:
    ```bash
    ngrok http 8000
    ```
3.  Uma tela aparecerá com o status "Online". Procure pela linha **Forwarding**.
    *   Ela terá um endereço parecido com: `https://a1b2-c3d4.ngrok-free.app`

---

## 📱 Passo 4: Acessar
1.  **Copie o link** (https://...) gerado pelo ngrok.
2.  Envie para o seu celular (WhatsApp, Telegram, email).
3.  **No Celular**: Ao clicar no link, o TaskFlow detectará automaticamente que é um dispositivo móvel e carregará a nova interface **TaskFlow Mobile**.
4.  **No Computador (fora de casa)**: Se usar o mesmo link num PC, ele abrirá a versão Desktop normal.

---

### ⚠️ Importante
*   O link do ngrok muda cada vez que você reinicia o programa (na versão gratuita).
*   Seu computador precisa ficar ligado e com o script do Passo 2 rodando para o site funcionar.
*   O banco de dados continua salvo apenas no seu computador.
