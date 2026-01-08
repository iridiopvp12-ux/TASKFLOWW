console.log(">>> FRONTEND MAIN v2.1 LOADED <<<");

// --- LOAD DATA & RENDER ---
async function loadInitialData() {
    // Load local prefs
    if (window.loadNotificationPrefs) loadNotificationPrefs();

    document.getElementById('loading-txt').style.display = 'block';
    const users = await fetchAPI('/users');
    if (users) { USERS = users; renderLoginList(); }
    document.getElementById('loading-txt').style.display = 'none';

    // Login Persistente
    const savedId = localStorage.getItem('taskflow_user_id');
    if (savedId) {
        // Tenta logar automaticamente
        if (users && users.find(u => u.id == savedId)) {
            initLogin(parseInt(savedId)); // Prepara
            // Simula clique ou login direto se tivéssemos token. Como é senha, só preenche.
            // Para "Lembrar de mim" real, precisaríamos de token.
            // Vamos apenas facilitar: se recarregar, volta pra tela de senha do usuário
        }
    }
}

async function loadAppData() {
    const [u, c, t, s] = await Promise.all([fetchAPI('/users'), fetchAPI('/companies'), fetchAPI('/tasks'), fetchAPI('/sectors')]);
    if (u) USERS = u; if (c) COMPANIES = c; if (t) TASKS = t; if (s) SECTORS = s;

    // Carrega notificações se logado
    if (currentUser) loadNotifications();

    renderAll();
    updateSelects();

    // verificarTarefasAutomaticas(); // REMOVIDO DAQUI para evitar loop de updates/toasts
    // verificarLimpezaDiaria(); // REMOVIDO DAQUI

    // 🛡️ NOVO: Condicional para Módulo de Auditoria (Apenas Admin)
    const navAudit = document.getElementById('nav-audit');
    if (navAudit) {
        // Mostra apenas se o usuário for 'admin'
        navAudit.style.display = (currentUser.role === 'admin') ? 'flex' : 'none';
    }
}

function renderAll() {
    updateSelects(); // Call updateSelects first to populate filters
    renderBoard();
    renderDashboard();
    renderCompanies();

    // Configurações: Atualiza visibilidade dos painéis de admin
    const adminPanel = document.getElementById('settings-admin-panel');
    if (adminPanel) {
        adminPanel.style.display = (currentUser.role === 'admin') ? 'block' : 'none';
    }
    renderSettings();
    renderSectorsList(); // Render Sectors in Settings

    // Renderiza o calendário se estiver visível, ou só deixa pronto
    if (typeof renderCalendar === 'function') {
         // Se estiver na aba calendario, renderiza
         const calView = document.getElementById('view-calendar');
         if (calView && calView.classList.contains('active')) renderCalendar();
    }
}

function updateSelects() {
    const userOpts = USERS.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    // const as = document.getElementById('input-assignee'); if(as) as.innerHTML = userOpts; // Now handled by custom renderer
    const cs = document.getElementById('comp-default-assignee'); if(cs) cs.innerHTML = `<option value="">-- Selecione --</option>` + userOpts;

    // Filtros de Kanban/Dash
    const sectorOpts = SECTORS.map(s => `<option value="SEC:${s.id}">Setor: ${s.name}</option>`).join('');
    const fs = document.getElementById('filter-user-select');
    if(fs) fs.innerHTML = `<option value="all">Todos</option>` + sectorOpts + userOpts;

    const compOpts = `<option value="">-- Nenhuma / Interna --</option>` + COMPANIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const ccs = document.getElementById('create-company-select'); if(ccs) ccs.innerHTML = compOpts;

    // User Creation Modal: Sector Select
    const userSec = document.getElementById('user-sector');
    if(userSec) {
        userSec.innerHTML = `<option value="">-- Nenhum --</option>` + SECTORS.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }

    // 🛡️ NOVO: Atualiza o filtro de usuários na aba Auditoria
    if (currentUser && currentUser.role === 'admin') {
        setupAuditFilters();
    }
}

function switchView(v) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    document.getElementById(`view-${v}`).classList.add('active');
    document.getElementById(`nav-${v}`).classList.add('active');

    if (v === 'dash') renderDashboard();
    if (v === 'board') renderBoard(); // Force update
    if (v === 'chat') initChat(); // Init Chat
    if (v === 'calendar' && typeof renderCalendar === 'function') renderCalendar();

    if (v === 'settings') {
        if (window.loadNotificationPrefs) loadNotificationPrefs();
    }

    // 🛡️ NOVO: Hook para inicializar a Auditoria
    if (v === 'audit' && currentUser.role === 'admin') {
        initializeAuditModule();
    }
}

// --- AUTOMAÇÕES ---
async function verificarTarefasAutomaticas() {
    // Agora a lógica roda no backend para evitar duplicidade (race conditions)
    // Chamamos o endpoint que verifica e cria se necessário
    const res = await fetchAPI('/tasks/process-recurrence', 'POST', {});
    if (res && res.created > 0) {
        showToast(`${res.created} tarefas recorrentes geradas!`, "success");
        // loadAppData será chamado pelo WebSocket "update" que o backend envia
    }
}

async function verificarLimpezaDiaria() {
    const hojeStr = new Date().toISOString().split('T')[0];
    let mudouAlgo = false;
    const tarefasAntigas = TASKS.filter(t => t.status === 'done' && t.completedAt && t.completedAt !== hojeStr);

    for (const t of tarefasAntigas) {
        await fetchAPI(`/tasks/${t.id}`, 'PUT', { status: 'archived', completedAt: t.completedAt, subtasks: t.subtasks });
        mudouAlgo = true;
    }
    if (mudouAlgo) { const t = await fetchAPI('/tasks'); if(t) { TASKS = t; renderAll(); showToast("Quadro limpo (Dia novo)!", "success"); } }
}

// Executa automações apenas uma vez ao iniciar (se logado) ou via setInterval longo
setInterval(() => {
    if (currentUser) {
        verificarTarefasAutomaticas();
        verificarLimpezaDiaria();
    }
}, 60 * 60 * 1000); // 1 hora


loadInitialData();

// --- REALTIME (WEBSOCKET) ---
let socket = null;
function connectWebSocket() {
    if (!currentUser) {
        // Se não tiver usuário, tenta de novo em breve (espera login)
        setTimeout(connectWebSocket, 1000);
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws?user_id=${currentUser.id}`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
        console.log("🟢 WebSocket Conectado");
    };

    socket.onmessage = (event) => {
        if (event.data === "update") {
            const isModalOpen = document.querySelector('.modal-overlay.open');
            // Se tiver notificação específica, atualiza sempre
            if (currentUser) {
                setTimeout(() => loadAppData(), 100);
            }
        } else if (event.data.startsWith("notification:")) {
            const targetId = parseInt(event.data.split(':')[1]);
            if (currentUser && currentUser.id === targetId) {
                showToast("🔔 Nova Notificação!", "success");
                loadNotifications();
                // Play sound or desktop notif
                if (window.playNotificationSound) playNotificationSound();
                if (window.triggerDesktopNotification) triggerDesktopNotification("Nova Notificação", "Você tem um novo alerta no TaskFlow");
            }
        } else if (event.data.startsWith("chat:")) {
            const payload = JSON.parse(event.data.substring(5));
            handleChatNotification(payload);
        }
    };

    socket.onclose = () => {
        console.log("🔴 WebSocket Desconectado. Tentando reconectar...");
        setTimeout(connectWebSocket, 3000); // Tenta reconectar em 3s
    };

    socket.onerror = (err) => {
        console.error("WebSocket Error:", err);
        socket.close();
    };
}

// Inicia conexão
connectWebSocket();

// --- SECTORS UI LOGIC ---

function openSectorModal() {
    document.getElementById('sector-name').value = '';
    const modal = document.getElementById('modal-sector');
    modal.classList.add('open');
    modal.style.display = 'flex';
}

async function saveSector() {
    const name = document.getElementById('sector-name').value;
    if(!name) return alert("Nome obrigatório");

    await fetchAPI('/sectors', 'POST', { name });
    closeModal('modal-sector');
    // Realtime update should reload
}

function renderSectorsList() {
    const container = document.getElementById('sector-list-settings');
    if(!container) return;

    container.innerHTML = '';

    if (SECTORS.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted); padding:10px;">Nenhum setor cadastrado.</div>';
        return;
    }

    SECTORS.forEach(s => {
        const div = document.createElement('div');
        div.className = 'data-item';
        div.innerHTML = `
            <div class="data-info">
                <h4>${s.name}</h4>
                <p>ID: ${s.id}</p>
            </div>
            <button class="btn-danger-outline" onclick="deleteSector(${s.id})">Excluir</button>
        `;
        container.appendChild(div);
    });
}

async function deleteSector(id) {
    if(!confirm("Tem certeza? Usuários e tarefas deste setor perderão o vínculo.")) return;
    await fetchAPI(`/sectors/${id}`, 'DELETE');
}