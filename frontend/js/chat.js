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
    chatComponent.addEventListener('open-file', handleOpenFile);
    chatComponent.addEventListener('menu-action-handler', handleMenuAction);

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
            // Corrigir URLs dos arquivos (caso sejam relativas)
            msgs.forEach(m => {
                if (m.files) {
                    m.files.forEach(f => {
                        f.url = fixFileUrl(f.url);
                        if (f.preview) f.preview = fixFileUrl(f.preview);
                    });
                }
            });
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
                showToast("Arquivo não permitido (Executáveis bloqueados).", "error");
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

    const res = await fetchAPI(`/chat/room?current_user_id=${currentUser.id}`, 'POST', { roomName: name, users: userIds });

    if(res) {
        // Reset and Close
        nameInput.value = '';
        closeModal('modal-new-group');
        loadRooms();
    }
}

async function handleMenuAction(event) {
    const { roomId, action } = event.detail[0] || event.detail;
    // Precisamos de info da sala (ownerId)
    const rooms = JSON.parse(chatComponent.rooms);
    const room = rooms.find(r => r.roomId === roomId);

    if (!room) return;

    // Check if it's a DM or Group
    const isGroup = roomId.toString().startsWith('group_');

    // Mapeando ações do menu padrão (se usarmos customMenu, adaptaremos)
    // O componente tem actions built-in? O vue-advanced-chat tem 'menu-actions' prop.
    // Vamos assumir que configuraremos 'menuActions' dinamicamente.
    // Por padrão o componente não emite 'menu-action-handler' sem custom actions.
    // Vamos configurar as actions ao carregar as salas ou ao abrir a sala.
    // Mas o listener é global.

    // Como identificar qual ação?
    // O event detail traz { action: { name: '...' }, roomId }

    const actionName = action.name;

    if (actionName === 'leaveGroup') {
        if (!confirm("Sair do grupo?")) return;
        await fetchAPI(`/chat/room/${roomId}`, 'PUT', { action: 'leave', currentUserId: currentUser.id });
        loadRooms();
        chatComponent.roomId = null; // Close
    } else if (actionName === 'renameGroup') {
        const newName = prompt("Novo nome:", room.roomName);
        if (newName && newName !== room.roomName) {
             await fetchAPI(`/chat/room/${roomId}`, 'PUT', { action: 'rename', roomName: newName, currentUserId: currentUser.id });
             loadRooms();
        }
    } else if (actionName === 'addMember') {
        // Simple prompt for User ID (Melhorar com modal depois)
        // Por simplicidade, listar usuários num prompt? Não, modal.
        // Reutilizar o modal de criar grupo? Adaptado.
        alert("Funcionalidade simplificada: Para adicionar, recrie o grupo ou peça ao admin.");
        // TODO: Implementar Modal de Adicionar Membros específico
    } else if (actionName === 'removeMember') {
        // Show list of members to remove
        // Precisamos dos usuários da sala.
        const memberId = prompt("ID do usuário para remover (Veja na lista de contatos):");
        if(memberId) {
             await fetchAPI(`/chat/room/${roomId}`, 'PUT', { action: 'remove_member', userId: memberId, currentUserId: currentUser.id });
             // Reload room logic?
             alert("Solicitação enviada.");
        }
    }
}

// Configura o menu dinâmico ao carregar as salas (ou poderia ser no click)
// O vue-advanced-chat aceita `menu-actions` como prop.
// Vamos definir globalmente, mas filtrar visualmente? Não, a prop é array.
// Melhor estratégia: Passar JSON na prop `menu-actions` que serve pra todas,
// e o handler decide se pode ou não.
// Mas para UX, seria bom só mostrar 'Gerenciar' se for dono.
// O componente atualiza props reativamente.
// Vamos definir menuActions fixas e controlar o erro no backend.

chatComponent.menuActions = JSON.stringify([
    { name: 'leaveGroup', title: 'Sair do Grupo' },
    { name: 'renameGroup', title: 'Renomear (Dono)' },
    { name: 'removeMember', title: 'Remover Membro (ID)' }
]);


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

    // Fix URL before render
    if (msg.files) {
        msg.files.forEach(f => {
            f.url = fixFileUrl(f.url);
            if (f.preview) f.preview = fixFileUrl(f.preview);
        });
    }

    chatComponent.messages = JSON.stringify([...currentMsgs, msg]);
}

function fixFileUrl(url) {
    if (!url) return url;
    if (url.startsWith('http') || url.startsWith('blob:')) return url;
    // Remove leading slash if API_URL has trailing slash
    // Mas assumindo API_URL sem trailing slash e url com
    return `${API_URL}${url}`;
}

function handleOpenFile(event) {
    // Prevent default behavior if possible (though event is custom)
    if (event.preventDefault) event.preventDefault();

    const { file } = event.detail[0] || event.detail;

    // Tenta encontrar a URL em propriedades alternativas se file.url não existir
    let targetUrl = file ? (file.url || file.file || file.source || file.src) : null;

    // Se for objeto, tenta extrair url
    if (typeof targetUrl === 'object' && targetUrl !== null) {
        targetUrl = targetUrl.url || targetUrl.file;
    }

    // Se ainda não achou e temos um objeto file, procura qualquer string que pareça URL
    if (!targetUrl && file) {
        for (const key in file) {
            const val = file[key];
            if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('/uploads') || val.startsWith('blob:'))) {
                targetUrl = val;
                break;
            }
        }
    }

    // Garante que a URL seja absoluta se for relativa
    if (targetUrl && typeof targetUrl === 'string') {
        targetUrl = fixFileUrl(targetUrl);
    }

    // Force usage of download endpoint for files to ensure headers are correct
    // Regex matches /uploads/UUID.ext
    if (targetUrl && targetUrl.includes('/uploads/')) {
        const parts = targetUrl.split('/uploads/');
        if (parts.length > 1) {
             const filename = parts[1];
             const originalName = file.name || filename;
             // Construct download URL
             targetUrl = `${API_URL}/chat/download/${filename}?name=${encodeURIComponent(originalName)}`;
        }
    }

    if (targetUrl) {
        showToast(`Abrindo ${file.name || 'arquivo'}...`, "info");
        const link = document.createElement('a');
        link.href = targetUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } else {
        console.error("File url missing. File object:", file);
        // Debug para o usuário ver o que chegou
        const debugInfo = file ? Object.keys(file).join(', ') : 'null';
        showToast(`Erro: URL inválida. Props: ${debugInfo}`, "error");
    }
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
