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
    
    // 🛡️ NOVO: Hook para inicializar a Auditoria
    if (v === 'audit' && currentUser.role === 'admin') {
        initializeAuditModule();
    }
}

// --- AUTOMAÇÕES ---
async function verificarTarefasAutomaticas() {
    if (!TASKS || TASKS.length === 0) return;
    const hoje = new Date();
    const diaMesHoje = hoje.getDate();    
    const diaSemanaHoje = hoje.getDay(); 
    const dataHojeFormatada = hoje.toISOString().split('T')[0];
    const mesAtualFormatado = dataHojeFormatada.substring(0, 7); 

    let mudouAlgo = false;

    const tarefasRecorrentes = TASKS.filter(t => t.recurrence && t.recurrence !== 'none');

    for (const tOriginal of tarefasRecorrentes) {
        let deveCriar = false;
        let jaExisteNoPeriodo = false;

        if (tOriginal.recurrence === 'daily') {
            if (dataHojeFormatada > tOriginal.dueDate) deveCriar = true; 
            jaExisteNoPeriodo = TASKS.some(t => t.desc === tOriginal.desc && t.dueDate === dataHojeFormatada);
        } 
        else if (tOriginal.recurrence === 'weekly') {
            if (diaSemanaHoje === tOriginal.recurrenceDay) deveCriar = true;
            jaExisteNoPeriodo = TASKS.some(t => t.desc === tOriginal.desc && t.dueDate === dataHojeFormatada);
        } 
        else if (tOriginal.recurrence === 'monthly') {
            if (diaMesHoje >= tOriginal.recurrenceDay) {
                deveCriar = true;
            }
            jaExisteNoPeriodo = TASKS.some(t => 
                t.desc === tOriginal.desc && 
                t.dueDate.substring(0, 7) === mesAtualFormatado
            );
        } 
        else if (tOriginal.recurrence === 'fortnightly') {
            const dataOrig = new Date(tOriginal.dueDate);
            const diffTime = Math.abs(hoje - dataOrig);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            if (diffDays > 0 && diffDays % 15 === 0) deveCriar = true;
            jaExisteNoPeriodo = TASKS.some(t => t.desc === tOriginal.desc && t.dueDate === dataHojeFormatada);
        }

        if (deveCriar && !jaExisteNoPeriodo) {
            await fetchAPI('/tasks', 'POST', {
                desc: tOriginal.desc,
                dueDate: dataHojeFormatada, 
                assignedTo: tOriginal.assignedTo, 
                prio: tOriginal.prio,
                companyId: tOriginal.companyId,
                subtasks: tOriginal.subtasks.map(s => ({...s, done: false, done_by: null, done_at: null})), // Garante novos campos
                status: "todo",
                completedAt: null,
                recurrence: 'none',
                recurrenceDay: null
            });
            mudouAlgo = true;
        }
    }
    if (mudouAlgo) { const t = await fetchAPI('/tasks'); if(t) { TASKS = t; renderAll(); showToast("Recorrências geradas!", "success"); } }
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
setInterval(() => { 
    const isModalOpen = document.querySelector('.modal-overlay.open'); 
    if (currentUser && !isModalOpen) { 
        loadAppData(); 
    } 
}, 5000);