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
    } else {
        chatComponent.rooms = '[]';
        chatComponent.roomsLoaded = true;
    }
}

async function handleFetchMessages(event) {
    // Documentação: event.detail é o objeto { room, options }
    const { room, options } = event.detail[0] || event.detail;

    // Mostra loading
    chatComponent.messagesLoaded = false;

    try {
        // Garantir roomId como string
        const roomIdStr = String(room.roomId);

        // Busca mensagens do backend
        const msgs = await fetchAPI(`/chat/messages?roomId=${roomIdStr}&currentUserId=${currentUser.id}`);

        if (msgs) {
            chatComponent.messages = JSON.stringify(msgs);
        } else {
            chatComponent.messages = '[]';
        }
    } finally {
        // Sempre marcar como loaded para matar o spinner, sem timeout
        chatComponent.messagesLoaded = true;
    }
}

async function handleSendMessage(event) {
    const { roomId, content, files, replyMessage } = event.detail[0] || event.detail;

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

            // Check if backend rejected files (empty array returned)
            if (uploadedFiles.length === 0 && files.length > 0) {
                showToast("Tipo de arquivo não permitido.", "error");
                return;
            }

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
    const { messageId, newContent, roomId } = event.detail[0] || event.detail;
    await fetchAPI(`/chat/message/${messageId}`, 'PUT', {
        action: 'edit',
        content: newContent
    });
    // Realtime vai atualizar a UI
}

async function handleDeleteMessage(event) {
    const { message, roomId } = event.detail[0] || event.detail;
    await fetchAPI(`/chat/message/${message._id}`, 'PUT', {
        action: 'delete'
    });
    // Realtime vai atualizar a UI
}

async function handleReaction(event) {
    const { messageId, reaction, remove, roomId } = event.detail[0] || event.detail;
    await fetchAPI(`/chat/message/${messageId}`, 'PUT', {
        action: 'react',
        reaction: reaction.unicode,
        remove: remove,
        userId: currentUser.id
    });
}

async function handleAddRoom(event) {
    console.log("Add Room Clicked");
    renderGroupUserSelect();
    document.getElementById('modal-new-group').style.display = 'flex'; // Open custom modal logic or use global
    // Se usar a classe global .modal-overlay
    const m = document.getElementById('modal-new-group');
    if(m) {
        m.classList.add('open');
        m.style.display = 'flex';
    }
}

function renderGroupUserSelect() {
    const container = document.getElementById('new-group-users-list');
    if(!container) return;
    container.innerHTML = '';

    USERS.forEach(u => {
        if(u.id === currentUser.id) return; // Don't show self

        const div = document.createElement('div');
        div.style.padding = '5px';
        div.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        div.innerHTML = `
            <label style="display:flex; align-items:center; cursor:pointer; margin:0;">
                <input type="checkbox" value="${u.id}" class="group-user-checkbox" style="margin-right:10px;">
                ${u.name}
            </label>
        `;
        container.appendChild(div);
    });
}

async function createGroup() {
    const nameInput = document.getElementById('new-group-name');
    const name = nameInput.value.trim();

    if(!name) {
        alert("Digite o nome do grupo.");
        return;
    }

    const checkboxes = document.querySelectorAll('.group-user-checkbox:checked');
    const userIds = Array.from(checkboxes).map(cb => parseInt(cb.value));

    // Add self
    userIds.push(currentUser.id);

    const res = await fetchAPI('/chat/room', 'POST', { roomName: name, users: userIds });

    if(res) {
        // Reset and Close
        nameInput.value = '';
        closeModal('modal-new-group');
        loadRooms();
    }
}

// Expose to window for HTML button
window.createGroup = createGroup;

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
