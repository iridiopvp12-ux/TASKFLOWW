
let RECURRENT_TASKS = [];

async function loadRecurrentTasks(forceReload = false) {
    const list = document.getElementById('recurrence-list');

    // Only fetch if empty or forced
    if (RECURRENT_TASKS.length === 0 || forceReload) {
        list.innerHTML = '<div style="padding:20px; text-align:center;">Carregando...</div>';
        const tasks = await fetchAPI('/recurrent-tasks');
        if (!tasks) {
            list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--danger);">Erro ao carregar tarefas.</div>';
            return;
        }
        RECURRENT_TASKS = tasks;
    }

    renderRecurrentList();
}

function renderRecurrentList() {
    const search = document.getElementById('recurrence-search').value.toLowerCase();
    const list = document.getElementById('recurrence-list');
    list.innerHTML = '';

    const filtered = RECURRENT_TASKS.filter(t => t.desc.toLowerCase().includes(search));

    if (filtered.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Nenhuma tarefa recorrente encontrada.</div>';
        return;
    }

    filtered.forEach(t => {
        list.appendChild(renderRecurrenceRow(t));
    });
}

function renderRecurrenceRow(t) {
    const div = document.createElement('div');
    div.className = 'data-item';
    div.style.display = 'grid';
    div.style.gridTemplateColumns = '2fr 1fr 1fr 1fr 120px';
    div.style.alignItems = 'center';
    div.style.padding = '15px';
    div.style.borderBottom = '1px solid var(--border)';

    // Formatar Frequência
    const freqMap = {
        'daily': 'Diária',
        'weekly': 'Semanal',
        'monthly': 'Mensal',
        'fortnightly': 'Quinzenal'
    };
    let freqText = freqMap[t.recurrence] || t.recurrence;
    if (t.recurrence === 'weekly' && t.recurrenceDay !== null) {
        const days = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
        freqText += ` (${days[t.recurrenceDay]})`;
    }
    if (t.recurrence === 'monthly' && t.recurrenceDay !== null) {
        freqText += ` (Dia ${t.recurrenceDay})`;
    }

    // Status Badge
    const isActive = (t.recurrenceActive !== false); // Default true if null/undefined
    const statusBadge = isActive
        ? `<span class="badge" style="background:rgba(16, 185, 129, 0.2); color:#34d399;">Ativo</span>`
        : `<span class="badge" style="background:rgba(245, 158, 11, 0.2); color:#fbbf24;">Pausado</span>`;

    const toggleIcon = isActive ? '⏸️' : '▶️';
    const toggleTitle = isActive ? 'Pausar Recorrência' : 'Retomar Recorrência';

    div.innerHTML = `
        <div style="font-weight:500; color:white;">${t.desc} <span style="font-size:0.8rem; color:var(--text-muted); display:block;">${t.companyName || 'Interna'}</span></div>
        <div style="font-size:0.9rem; color:var(--text-muted);">${t.userName || 'Sem dono'}</div>
        <div style="font-size:0.9rem;">${freqText}</div>
        <div>${statusBadge}</div>
        <div style="text-align:right; display:flex; gap:10px; justify-content:flex-end;">
            <button class="btn-icon" onclick="openEditRecurrenceModal(${t.id})" title="Editar">✏️</button>
            <button class="btn-icon" onclick="toggleRecurrence(${t.id})" title="${toggleTitle}">${toggleIcon}</button>
            <button class="btn-icon" onclick="deleteRecurrentTask(${t.id})" title="Excluir Mestre">🗑️</button>
        </div>
    `;
    return div;
}

// --- EDIT RECURRENCE LOGIC ---
let currentRecurrenceId = null;

function openEditRecurrenceModal(id) {
    const t = RECURRENT_TASKS.find(x => x.id === id);
    if (!t) return;
    currentRecurrenceId = id;

    // Populate Fields
    const recType = document.getElementById('edit-rec-type');
    recType.value = t.recurrence;

    document.getElementById('edit-rec-offset').value = t.dueOffset || 0;

    // Determine what to put in "Date Base"
    // If weekly => we need a date that corresponds to recurrenceDay (0=Mon, 6=Sun or whatever the BE logic is)
    // Actually BE logic: 0=Monday, 6=Sunday (Python default)
    // If monthly => recurrenceDay is day of month (1-31)

    // Since input type="date" requires YYYY-MM-DD, we can just set it to today/tomorrow adjusted for that day
    // Or simpler: We ask user to pick a date, and we extract the day from it.

    // Let's try to set a valid date so user sees current config
    const today = new Date();
    let setDate = new Date();

    if (t.recurrence === 'monthly' && t.recurrenceDay) {
        // Set to this month's recurrence day
        // Watch out for overflow (e.g. day 31 in Feb)
        setDate.setDate(t.recurrenceDay);
    } else if (t.recurrence === 'weekly' && t.recurrenceDay !== null) {
        // Find next occurrence of this weekday
        const currentDay = today.getDay(); // 0=Sun, 1=Mon...
        // Python: 0=Mon, 6=Sun. Map JS(0-6 Sun-Sat) to Python(0-6 Mon-Sun)
        // JS: Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6
        // PY: Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6

        let jsDayTarget = t.recurrenceDay + 1;
        if (jsDayTarget === 7) jsDayTarget = 0; // Sunday

        const dist = (jsDayTarget + 7 - currentDay) % 7;
        setDate.setDate(today.getDate() + dist);
    }

    document.getElementById('edit-rec-date').value = setDate.toISOString().split('T')[0];

    toggleEditRecurrenceFields();

    const m = document.getElementById('modal-edit-recurrence');
    m.style.display = 'flex';
    setTimeout(() => m.classList.add('open'), 10);
}

function toggleEditRecurrenceFields() {
    const val = document.getElementById('edit-rec-type').value;
    const dateGroup = document.getElementById('group-edit-rec-date');
    const help = document.getElementById('help-edit-rec-date');

    if (val === 'daily' || val === 'fortnightly') {
        // Daily: date doesn't matter much unless start date, but we can keep it as "Start From"
        // Fortnightly: Date matters for the 15-day anchor
        dateGroup.style.display = 'block';
        help.innerText = 'Define a data de referência para a contagem.';
    } else if (val === 'weekly') {
        dateGroup.style.display = 'block';
        help.innerText = 'O dia da semana desta data será usado (Ex: Selecione uma Segunda-feira).';
    } else if (val === 'monthly') {
        dateGroup.style.display = 'block';
        help.innerText = 'O dia do mês desta data será usado (Ex: Dia 5).';
    } else {
        dateGroup.style.display = 'none';
    }
}

async function saveRecurrenceChanges() {
    if (!currentRecurrenceId) return;

    const recType = document.getElementById('edit-rec-type').value;
    const dateStr = document.getElementById('edit-rec-date').value;
    const offset = parseInt(document.getElementById('edit-rec-offset').value) || 0;

    if (!dateStr) return showToast("Selecione uma data base.", "error");

    const dateObj = new Date(dateStr + 'T00:00:00'); // Local time
    let recurrenceDay = null;

    if (recType === 'weekly') {
        // Convert JS Day (0=Sun) to Python Day (0=Mon...6=Sun)
        const jsDay = dateObj.getDay();
        recurrenceDay = jsDay === 0 ? 6 : jsDay - 1;
    } else if (recType === 'monthly') {
        recurrenceDay = dateObj.getDate();
    }

    // For fortnightly/daily, we might want to update the 'due_date' (anchor) of the task to the new date
    // Actually, backend uses 'due_date' as anchor for fortnightly.
    // So we should send 'dueDate' update as well.

    const payload = {
        recurrence: recType,
        recurrenceDay: recurrenceDay,
        dueOffset: offset,
        dueDate: dateStr // Update anchor date
    };

    const res = await fetchAPI(`/tasks/${currentRecurrenceId}`, 'PUT', payload);
    if (res) {
        showToast("Recorrência atualizada!", "success");
        closeModal('modal-edit-recurrence');
        loadRecurrentTasks(true);
    }
}

async function toggleRecurrence(id) {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
        const res = await fetchAPI(`/tasks/${id}/toggle-recurrence`, 'PUT', {});
        if (res) {
            showToast(res.recurrenceActive ? "Recorrência ativada!" : "Recorrência pausada!", "success");
            loadRecurrentTasks(true); // Force reload to update state
        }
    } finally {
        btn.disabled = false;
    }
}

async function deleteRecurrentTask(id) {
    if (!confirm("Atenção: Você está excluindo a TAREFA MESTRE. Isso irá parar a criação de novas cópias para sempre e apagará este registro. Deseja continuar?")) return;

    await fetchAPI(`/tasks/${id}`, 'DELETE');
    showToast("Tarefa recorrente removida.", "success");
    loadRecurrentTasks(true);
}
