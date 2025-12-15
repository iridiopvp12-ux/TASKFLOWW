// Arquivo: frontend/js/focus.js

function renderFocus() {
    const container = document.getElementById('focus-task-list');
    if (!container) return;

    container.innerHTML = '';

    // Filtra tarefas do usuário atual
    const myTasks = TASKS.filter(t =>
        t.assignedTo === currentUser.id &&
        ['todo', 'doing'].includes(t.status)
    );

    // Ordena: Atrasadas primeiro, depois por Data, depois por Prioridade
    myTasks.sort((a, b) => {
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        const prioMap = { 'Alta': 0, 'Média': 1, 'Baixa': 2 };
        return prioMap[a.prio] - prioMap[b.prio];
    });

    if (myTasks.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:50px; color:#64748b;">Nada pendente! Bom trabalho. 🧘</div>';
        return;
    }

    const today = new Date().toISOString().split('T')[0];

    // Agrupa
    const overdue = myTasks.filter(t => t.dueDate < today);
    const forToday = myTasks.filter(t => t.dueDate === today);
    const upcoming = myTasks.filter(t => t.dueDate > today);

    if (overdue.length > 0) renderFocusGroup(container, '🔥 Atrasadas', overdue, 'var(--danger)');
    if (forToday.length > 0) renderFocusGroup(container, '📅 Para Hoje', forToday, 'var(--primary)');
    if (upcoming.length > 0) renderFocusGroup(container, '🚀 Próximas', upcoming, 'var(--prio-med)');
}

function renderFocusGroup(container, title, tasks, color) {
    let html = `<h3 style="color:${color}; border-bottom:1px solid var(--border); padding-bottom:10px; margin-top:30px;">${title} (${tasks.length})</h3>`;
    html += '<div style="display:flex; flex-direction:column; gap:10px;">';

    tasks.forEach(t => {
        const c = COMPANIES.find(x => x.id == t.companyId);
        const compName = c ? c.name : 'Interno';

        html += `
        <div class="card" style="display:flex; align-items:center; justify-content:space-between; padding:15px;" onclick="openDetails(${t.id})">
            <div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:4px;">${compName}</div>
                <div style="font-size:1rem; font-weight:600; color:#e2e8f0;">${t.desc}</div>
            </div>
            <div style="text-align:right;">
                <span class="badge b-${getPrioClass(t.prio)}">${t.prio}</span>
                <div style="font-size:0.8rem; color:var(--text-muted); margin-top:5px;">${formatDate(t.dueDate)}</div>
            </div>
        </div>`;
    });

    html += '</div>';
    container.insertAdjacentHTML('beforeend', html);
}