// Arquivo: frontend/js/chat.js

// Referência ao WebComponent
let chatComponent = null;

function initChat() {
    // Registrar Web Component (CDN)
    if (window['vue-advanced-chat']) {
        window['vue-advanced-chat'].register();
    }

    chatComponent = document.getElementById('chat-component');

    if (!currentUser) return;

    // Configuração básica do componente
    chatComponent.currentUserId = currentUser.id.toString();
    chatComponent.theme = 'dark';

    // Mapeamento de Estilos (TaskFlow Palette)
    // Cores extraídas do styles.css
    chatComponent.styles = JSON.stringify({
        general: {
            color: '#f1f5f9', // --text-main
            colorSpinner: '#3b82f6', // --primary
            borderStyle: 'none',
            background: '#0f172a' // --bg-body
        },
        container: {
            border: 'none',
            borderRadius: '0',
            boxShadow: 'none'
        },
        header: {
            background: '#1e293b', // --bg-sidebar
            colorRoomName: '#fff',
            colorRoomInfo: '#94a3b8' // --text-muted
        },
        footer: {
            background: '#1e293b',
            borderTop: '1px solid #475569', // --border
            colorInputText: '#fff'
        },
        sidebar: {
            background: '#1e293b',
            borderRight: '1px solid #475569',
            colorSearch: '#fff',
            colorPreview: '#94a3b8'
        },
        message: {
            background: '#334155', // --bg-card (others)
            backgroundMe: '#3b82f6', // --primary (me)
            color: '#fff',
            colorStarted: '#94a3b8'
        }
    });

    // Traduções
    chatComponent.textMessages = JSON.stringify({
        ROOMS_EMPTY: 'Sem conversas',
        ROOM_EMPTY: 'Selecione uma conversa',
        NEW_MESSAGES: 'Novas mensagens',
        MESSAGE_DELETED: 'Mensagem apagada',
        MESSAGES_EMPTY: 'Nenhuma mensagem',
        CONVERSATION_STARTED: 'Conversa iniciada em:',
        TYPE_MESSAGE: 'Digite sua mensagem...',
        SEARCH: 'Buscar',
        IS_ONLINE: 'Online',
        LAST_SEEN: 'Visto por último ',
        IS_TYPING: 'está digitando...',
        CANCEL_SELECT_MESSAGE: 'Cancelar Seleção'
    });

    // Event Listeners do Componente
    chatComponent.addEventListener('fetch-messages', handleFetchMessages);
    chatComponent.addEventListener('send-message', handleSendMessage);
    chatComponent.addEventListener('edit-message', handleEditMessage);
    chatComponent.addEventListener('delete-message', handleDeleteMessage);
    chatComponent.addEventListener('send-message-reaction', handleReaction);
    chatComponent.addEventListener('add-room', handleAddRoom);

    // Carregar lista de salas (Usuários)
    loadRooms();
}

async function loadRooms() {
    // Busca a lista de usuários formatada como rooms
    const rooms = await fetchAPI(`/chat/rooms?current_user_id=${currentUser.id}`);
    if (rooms) {
        chatComponent.rooms = JSON.stringify(rooms);
        chatComponent.roomsLoaded = true;
    }
}

async function handleFetchMessages(event) {
    const { room, options } = event.detail[0];

    // Mostra loading
    chatComponent.messagesLoaded = false;

    // Busca mensagens do backend
    const msgs = await fetchAPI(`/chat/messages?roomId=${room.roomId}&currentUserId=${currentUser.id}`);

    if (msgs) {
        chatComponent.messages = JSON.stringify(msgs);
    }
    // Sempre marcar como loaded para matar o spinner
    setTimeout(() => { chatComponent.messagesLoaded = true; }, 10);
}

async function handleSendMessage(event) {
    const { roomId, content, files, replyMessage } = event.detail[0];

    // Se houver arquivos (blobs), precisamos fazer upload primeiro
    let uploadedFiles = [];
    if (files && files.length > 0) {
        const formData = new FormData();
        files.forEach(f => formData.append('files', f.blob, f.name));

        try {
            // Usa fetch direto pois api.js pode não tratar list de upload do jeito certo se não adaptar
            const token = localStorage.getItem('token');
            const headers = {};
            // if (token) headers['Authorization'] = `Bearer ${token}`; // Se usar Auth
            // Não setar Content-Type para multipart form data, o browser faz isso com boundary

            const res = await fetch(`${API_URL}/chat/upload`, {
                method: 'POST',
                body: formData,
                headers: { 'ngrok-skip-browser-warning': 'true' }
            });
            uploadedFiles = await res.json();

        } catch (e) {
            console.error("Erro upload", e);
            showToast("Erro ao enviar arquivos", "error");
            return;
        }
    }

    const payload = {
        senderId: currentUser.id,
        roomId: roomId, // Target User ID
        content: content,
        files: uploadedFiles,
        replyMessage: replyMessage
    };

    // Envia mensagem
    const newMsg = await fetchAPI('/chat/message', 'POST', payload);

    // A lib vue-advanced-chat adiciona a mensagem otimisticamente se a prop `auto-scroll` estiver configurada para tal,
    // mas geralmente espera-se que a gente atualize a prop `messages` ou deixe o realtime fazer isso.
    // Como implementamos o retorno, se quiséssemos adicionar manualmente:
    // const currentMsgs = JSON.parse(chatComponent.messages);
    // currentMsgs.push(newMsg);
    // chatComponent.messages = JSON.stringify(currentMsgs);

    // Mas vamos confiar no realtime (WS) para consistência ou na resposta imediata?
    // A resposta do POST já é o objeto. Se o componente não atualizar sozinho (visto que não usamos :messages.sync no vanilla de forma direta),
    // podemos ter que forçar.
    // O evento `send-message` NÃO adiciona a mensagem automaticamente no array `messages` interno do componente quando usado via prop string.

    // No entando, o backend vai mandar um evento WS logo em seguida.
    // Se adicionarmos aqui E o WS chegar, pode duplicar se não tivermos cuidado com IDs.
    // O backend retorna o ID real. O componente gera um ID temporário? Não, nós mandamos o conteúdo.
    // Melhor abordagem: adicionar o retorno do backend às mensagens atuais.

    /*
       NOTA: Se o WS for rápido, ele chega quase junto.
       Vamos adicionar manualmente para garantir UX rápida.
    */
    if (newMsg) {
        addMessageToComponent(newMsg);
    }
}

async function handleEditMessage(event) {
    const { messageId, newContent, roomId } = event.detail[0];
    await fetchAPI(`/chat/message/${messageId}`, 'PUT', {
        action: 'edit',
        content: newContent
    });
    // Realtime vai atualizar a UI
}

async function handleDeleteMessage(event) {
    const { message, roomId } = event.detail[0];
    await fetchAPI(`/chat/message/${message._id}`, 'PUT', {
        action: 'delete'
    });
    // Realtime vai atualizar a UI
}

async function handleReaction(event) {
    const { messageId, reaction, remove, roomId } = event.detail[0];
    await fetchAPI(`/chat/message/${messageId}`, 'PUT', {
        action: 'react',
        reaction: reaction.unicode,
        remove: remove,
        userId: currentUser.id
    });
}

async function handleAddRoom(event) {
    // detail[0] = { roomId, roomName, users: [id, id], ... }
    // mas o evento add-room do componente geralmente abre um modal interno ou esperamos que a gente abra?
    // O componente vue-advanced-chat emite 'add-room' quando clica no botão '+'.
    // Precisamos abrir nosso modal ou usar prompt simples.
    // O componente não tem modal de seleção de usuarios embutido para criar sala, nós que temos que implementar a UI de seleção.
    // Vamos fazer um prompt simples por enquanto ou usar o modal de usuario existente adaptado?
    // Prompt simples de nome + seleção automatica (todos?) não faz sentido.
    // Vamos assumir que o usuário quer criar grupo.

    const roomName = prompt("Nome do Grupo:");
    if (!roomName) return;

    // Simplificação: Criar grupo vazio e depois adicionar (ou selecionar usuarios agora).
    // Como não temos UI de multiselect pronta no prompt, vamos pegar todos os users exceto eu para teste, ou melhor:
    // Mostrar prompt de IDs? Não.
    // Vamos criar o grupo só com o criador por enquanto, e a interface permite adicionar depois?
    // O componente não tem menu "add member" nativo fácil de hookar sem UI custom.
    // Vamos criar um grupo com TODOS os usuários para facilitar o teste do cliente, ou listar IDs.

    // Melhor: Criar grupo vazio.
    const res = await fetchAPI('/chat/room', 'POST', { roomName: roomName, users: [currentUser.id] });
    if(res) {
        loadRooms(); // Refresh list
    }
}

// --- INTEGRAÇÃO WEBSOCKET ---
// Chamado pelo main.js quando chega mensagem "chat:..."
function handleChatNotification(payload) {
    if (!chatComponent) return;

    const { action, data, roomId } = payload;

    // Se for mensagem nova
    if (action === 'message') {
        // data é o objeto da mensagem
        // roomId no payload do target é o senderId.

        // Verifica se a sala aberta é a do remetente
        if (chatComponent.roomId === roomId) {
            addMessageToComponent(data);

            // Marca como lida no backend (opcional, já fazemos no GET, mas realtime pode precisar)
            // fetchAPI(...)
        } else {
            // Incrementa contador na lista de salas se não estiver aberta
            updateRoomUnread(roomId, data);

            // Som de notificação se não fui eu
            if (data.senderId !== currentUser.id.toString()) {
                if (window.playNotificationSound) playNotificationSound();
                showToast(`Nova mensagem de ${data.senderId}`, "success"); // Melhorar pegando nome
            }
        }
    }

    // Se for edição/deleção/reação
    if (['edit', 'delete', 'react'].includes(action)) {
        // Se a sala estiver aberta, atualiza a mensagem específica
        if (chatComponent.roomId === payload.roomId || chatComponent.roomId === payload.senderId) {
            // Precisamos atualizar o array de mensagens
            // O componente não tem método direto "updateMessage", temos que manipular o array 'messages'
            updateMessageInList(payload);
        }
    }
}

function addMessageToComponent(msg) {
    // Evita duplicatas (se já veio pelo retorno do POST)
    const currentMsgs = JSON.parse(chatComponent.messages || '[]');
    if (currentMsgs.find(m => m._id === msg._id)) return;

    chatComponent.messages = JSON.stringify([...currentMsgs, msg]);
}

function updateMessageInList(payload) {
    const currentMsgs = JSON.parse(chatComponent.messages || '[]');
    const idx = currentMsgs.findIndex(m => m._id === payload.messageId);
    if (idx === -1) return;

    const msg = currentMsgs[idx];

    if (payload.action === 'delete') {
        msg.deleted = true;
        msg.content = '🚫 Mensagem apagada';
        msg.disableActions = true;
        msg.disableReactions = true;
    } else if (payload.action === 'edit') {
        msg.content = payload.content;
        msg.edited = true;
    } else if (payload.action === 'react') {
        msg.reactions = payload.reactions;
    }

    // Reatribui para forçar update
    currentMsgs[idx] = msg;
    chatComponent.messages = JSON.stringify([...currentMsgs]);
}

async function updateRoomUnread(targetRoomId, lastMsg) {
    // Atualiza a lista de quartos (sobe pro topo, aumenta contador)
    // Precisamos recarregar rooms ou manipular o JSON 'rooms'

    const currentRooms = JSON.parse(chatComponent.rooms || '[]');
    const roomIdx = currentRooms.findIndex(r => r.roomId === targetRoomId);

    if (roomIdx !== -1) {
        const room = currentRooms[roomIdx];
        room.unreadCount = (room.unreadCount || 0) + 1;
        room.lastMessage = {
            content: lastMsg.content,
            senderId: lastMsg.senderId,
            timestamp: lastMsg.timestamp,
            new: true
        };
        // Move pro topo
        currentRooms.splice(roomIdx, 1);
        currentRooms.unshift(room);
        chatComponent.rooms = JSON.stringify([...currentRooms]);
    } else {
        // Se sala não existe (novo usuário?), recarrega tudo
        loadRooms();
    }
}
