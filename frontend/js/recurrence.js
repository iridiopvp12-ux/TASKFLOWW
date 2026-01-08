
async function loadRecurrentTasks() {
    const search = document.getElementById('recurrence-search').value.toLowerCase();
    const list = document.getElementById('recurrence-list');
    list.innerHTML = '<div style="padding:20px; text-align:center;">Carregando...</div>';

    const tasks = await fetchAPI('/recurrent-tasks');
    if (!tasks) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:var(--danger);">Erro ao carregar tarefas.</div>';
        return;
    }

    list.innerHTML = '';

    const filtered = tasks.filter(t => t.desc.toLowerCase().includes(search));

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
            <button class="btn-icon" onclick="toggleRecurrence(${t.id})" title="${toggleTitle}">${toggleIcon}</button>
            <button class="btn-icon" onclick="deleteRecurrentTask(${t.id})" title="Excluir Mestre">🗑️</button>
        </div>
    `;
    return div;
}

async function toggleRecurrence(id) {
    const btn = event.currentTarget;
    btn.disabled = true;
    try {
        const res = await fetchAPI(`/tasks/${id}/toggle-recurrence`, 'PUT', {});
        if (res) {
            showToast(res.recurrenceActive ? "Recorrência ativada!" : "Recorrência pausada!", "success");
            loadRecurrentTasks(); // Reload to refresh list
        }
    } finally {
        btn.disabled = false;
    }
}

async function deleteRecurrentTask(id) {
    if (!confirm("Atenção: Você está excluindo a TAREFA MESTRE. Isso irá parar a criação de novas cópias para sempre e apagará este registro. Deseja continuar?")) return;

    await fetchAPI(`/tasks/${id}`, 'DELETE');
    showToast("Tarefa recorrente removida.", "success");
    loadRecurrentTasks();
}
