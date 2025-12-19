// --- LOAD DATA & RENDER ---
async function loadInitialData() {
    document.getElementById('loading-txt').style.display = 'block';
    const users = await fetchAPI('/users');
    if (users) { USERS = users; renderLoginList(); }
    document.getElementById('loading-txt').style.display = 'none';
}

async function loadAppData() {
    const [u, c, t] = await Promise.all([fetchAPI('/users'), fetchAPI('/companies'), fetchAPI('/tasks')]);
    if (u) USERS = u; if (c) COMPANIES = c; if (t) TASKS = t;

    // Carrega notificações se logado
    if (currentUser) loadNotifications();

    renderAll();
    updateSelects();

    verificarTarefasAutomaticas();
    verificarLimpezaDiaria();

    // 🛡️ NOVO: Condicional para Módulo de Auditoria (Apenas Admin)
    const navAudit = document.getElementById('nav-audit');
    if (navAudit) {
        // Mostra apenas se o usuário for 'admin'
        navAudit.style.display = (currentUser.role === 'admin') ? 'flex' : 'none';
    }
}

function renderAll() {
    renderBoard();
    renderDashboard();
    renderCompanies();
    renderSettings();
    updateSelects();
    // Renderiza o calendário se estiver visível, ou só deixa pronto
    if (typeof renderCalendar === 'function') {
         // Se estiver na aba calendario, renderiza
         const calView = document.getElementById('view-calendar');
         if (calView && calView.classList.contains('active')) renderCalendar();
    }
}

function updateSelects() {
    const userOpts = USERS.map(u => `<option value="${u.id}">${u.name}</option>`).join('');
    const as = document.getElementById('input-assignee'); if(as) as.innerHTML = userOpts;
    const cs = document.getElementById('comp-default-assignee'); if(cs) cs.innerHTML = `<option value="">-- Selecione --</option>` + userOpts;
    const fs = document.getElementById('filter-user-select'); if(fs) fs.innerHTML = `<option value="all">Todos</option>` + userOpts;
    const compOpts = `<option value="">-- Nenhuma / Interna --</option>` + COMPANIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const ccs = document.getElementById('create-company-select'); if(ccs) ccs.innerHTML = compOpts;

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



loadInitialData();

// --- REALTIME (WEBSOCKET) ---
let socket = null;
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws`;

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