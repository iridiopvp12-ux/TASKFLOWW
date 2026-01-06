// Arquivo: frontend/js/chat.js

let activeChat = { type: 'global', targetId: null };
let chatMessages = [];

function initChat() {
    renderChatList();
    loadMessages();
}

function renderChatList() {
    const list = document.getElementById('chat-list');
    list.innerHTML = '';

    // Global
    const isActiveGlobal = activeChat.type === 'global' ? 'active' : '';
    list.insertAdjacentHTML('beforeend', `
        <div class="chat-item ${isActiveGlobal}" onclick="selectChat('global', null)">
            <div class="avatar" style="background:var(--primary)">G</div>
            <div>
                <div style="font-weight:600; color:white;">Global</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">Todos os membros</div>
            </div>
        </div>
    `);

    // Users
    USERS.forEach(u => {
        if (u.id === currentUser.id) return;
        const isActive = (activeChat.type === 'dm' && activeChat.targetId === u.id) ? 'active' : '';

        list.insertAdjacentHTML('beforeend', `
            <div class="chat-item ${isActive}" onclick="selectChat('dm', ${u.id})">
                <div class="avatar" style="background:${u.color}">${u.initials}</div>
                <div>
                    <div style="font-weight:600; color:white;">${u.name}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${u.roleDesc}</div>
                </div>
            </div>
        `);
    });
}

function selectChat(type, targetId) {
    activeChat = { type, targetId };

    // Update Header
    const title = document.getElementById('chat-header-title');
    const desc = document.getElementById('chat-header-desc');

    if (type === 'global') {
        title.innerText = 'Global';
        desc.innerText = 'Todos os membros';
    } else {
        const u = USERS.find(x => x.id === targetId);
        title.innerText = u ? u.name : 'Usuário';
        desc.innerText = u ? u.roleDesc : '';
    }

    renderChatList(); // Update active class
    loadMessages();
}

async function loadMessages() {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '<div style="text-align:center; color:#64748b; margin-top:20px;">Carregando...</div>';

    let url = '/chat/messages?type=global';
    if (activeChat.type === 'dm') {
        url = `/chat/dm?user1=${currentUser.id}&user2=${activeChat.targetId}`;
    }

    const res = await fetchAPI(url);
    if (res) {
        chatMessages = res;
        renderMessages();
    }
}

function renderMessages() {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';

    if (chatMessages.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#64748b; margin-top:50px;">Nenhuma mensagem ainda.</div>';
        return;
    }

    chatMessages.forEach(msg => {
        const isMe = msg.sender_id === currentUser.id;
        const time = new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        let attachmentHtml = '';
        if (msg.attachment) {
            if (msg.attachment.match(/\.(jpeg|jpg|gif|png)$/i)) {
                attachmentHtml = `<img src="${msg.attachment}" class="chat-img-preview" onclick="window.open('${msg.attachment}')">`;
            } else if (msg.attachment.match(/\.(mp3|wav|ogg|webm)$/i)) {
                attachmentHtml = `<div style="margin-top:5px;"><audio controls src="${msg.attachment}"></audio></div>`;
            } else {
                attachmentHtml = `<div style="margin-top:5px;"><a href="${msg.attachment}" target="_blank" style="color:white; text-decoration:underline;">📄 Abrir Arquivo</a></div>`;
            }
        }

        // Trash icon for deletion (if me)
        const deleteBtn = isMe || currentUser.role === 'admin'
            ? `<span style="cursor:pointer; margin-left:8px; font-size:0.8rem; opacity:0.5;" title="Apagar" onclick="deleteChatMessage(${msg.id})">🗑️</span>`
            : '';

        const html = `
            <div class="chat-msg ${isMe ? 'me' : ''}">
                ${!isMe ? `<div class="mini-av" style="background:${msg.sender_color}; min-width:32px; height:32px;">${msg.sender_initials}</div>` : ''}
                <div>
                    <div class="chat-msg-meta">
                        ${isMe ? 'Você' : msg.sender_name} • ${time}
                        ${deleteBtn}
                    </div>
                    <div class="chat-msg-bubble">
                        ${msg.content ? `<div>${msg.content}</div>` : ''}
                        ${attachmentHtml}
                    </div>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });

    container.scrollTop = container.scrollHeight;
}

async function deleteChatMessage(id) {
    if(confirm("Apagar mensagem?")) {
        await fetchAPI(`/chat/message/${id}`, 'DELETE');
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const txt = input.value;
    if (!txt && !pendingUpload) return;

    const payload = {
        senderId: currentUser.id,
        targetId: activeChat.targetId,
        type: activeChat.type,
        content: txt,
        attachment: pendingUpload
    };

    input.value = '';
    pendingUpload = null; // Clear
    document.getElementById('chat-file-upload').value = ''; // Reset file input

    // Optimistic append? Maybe just wait for WS for simplicity in chat sync
    await fetchAPI('/chat/message', 'POST', payload);
}

// File Upload
let pendingUpload = null;
async function uploadChatFile() {
    const fileInput = document.getElementById('chat-file-upload');
    const file = fileInput.files[0];
    if (!file) return;

    await performFileUpload(file);
}

async function performFileUpload(file) {
    const formData = new FormData();
    formData.append('file', file);

    showToast("Enviando arquivo...", "normal");

    try {
        const res = await fetch(`${API_URL}/chat/upload`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();

        if (data.url) {
            pendingUpload = data.url;
            sendChatMessage(); // Auto-send
        } else {
            showToast("Erro no upload", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Erro no upload", "error");
    }
}

// Audio Recording
let mediaRecorder = null;
let audioChunks = [];

async function toggleRecording() {
    const btn = document.getElementById('btn-mic');

    if (mediaRecorder && mediaRecorder.state === 'recording') {
        // Stop
        mediaRecorder.stop();
        btn.innerHTML = '🎤';
        btn.classList.remove('recording');
        btn.style.color = '';
    } else {
        // Start
        if (!navigator.mediaDevices) {
            alert("Microfone não suportado ou sem permissão.");
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = event => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                // Convert blob to file
                const file = new File([audioBlob], "audio_message.webm", { type: 'audio/webm' });
                await performFileUpload(file);
            };

            mediaRecorder.start();
            btn.innerHTML = '⏹️';
            btn.classList.add('recording');
            btn.style.color = 'red';
        } catch (err) {
            console.error(err);
            alert("Erro ao acessar microfone.");
        }
    }
}

// Handle WS Event
function handleChatNotification(payload) {
    if (payload.action === 'create') {
        const data = payload.data;
        // Check if message belongs to active view
        let shouldRender = false;

        if (activeChat.type === 'global' && data.type === 'global') {
            shouldRender = true;
        } else if (activeChat.type === 'dm') {
            if (data.sender_id === currentUser.id && data.target_id === activeChat.targetId) shouldRender = true;
            if (data.sender_id === activeChat.targetId && data.target_id === currentUser.id) shouldRender = true;
        }

        if (shouldRender) {
            chatMessages.push(data);
            renderMessages();
            if (data.sender_id !== currentUser.id) {
                if (window.playNotificationSound) playNotificationSound();
            }
        } else {
            if (data.type === 'dm' && data.target_id === currentUser.id) {
                showToast(`Nova mensagem de ${data.sender_name}`, "success");
                if (window.playNotificationSound) playNotificationSound();
                if (window.triggerDesktopNotification) triggerDesktopNotification(`Mensagem de ${data.sender_name}`, data.content || "Enviou um anexo");
            }
        }
    } else if (payload.action === 'delete') {
        const id = payload.id;
        chatMessages = chatMessages.filter(m => m.id !== id);
        renderMessages();
    }
}
