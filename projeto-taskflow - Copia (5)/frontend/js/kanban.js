function renderBoard() {
    ['todo', 'doing', 'done'].forEach(id => document.getElementById(id).innerHTML = '');
    let filtered = TASKS;
    filtered = filtered.filter(t => t.status !== 'archived');
    
    const search = document.getElementById('task-search').value.toLowerCase();
    if(search) {
        filtered = filtered.filter(t => {
            const taskMatch = t.desc.toLowerCase().includes(search);
            const c = COMPANIES.find(x => x.id == t.companyId);
            const compMatch = c ? c.name.toLowerCase().includes(search) : false;
            return taskMatch || compMatch;
        });
    }
    
    if (currentUser.role === 'user') {
        filtered = filtered.filter(t => t.assignedTo == currentUser.id || !t.assignedTo);
    } else {
        const fVal = document.getElementById('filter-user-select').value;
        if (fVal !== 'all') filtered = filtered.filter(t => t.assignedTo == fVal);
    }

    document.getElementById('count-todo').innerText = filtered.filter(t => t.status === 'todo').length;
    document.getElementById('count-doing').innerText = filtered.filter(t => t.status === 'doing').length;
    document.getElementById('count-done').innerText = filtered.filter(t => t.status === 'done').length;

    filtered.forEach(createCard);
}

function createCard(task) {
    let u = USERS.find(x => x.id == task.assignedTo);
    if (!u && !task.assignedTo) u = { name: 'LIVRE', color: '#94a3b8', initials: '?' };
    else if (!u) u = { name: 'Desconhecido', color: '#64748b', initials: '?' };
    const c = COMPANIES.find(x => x.id == task.companyId);
    const done = task.subtasks.filter(s => s.done).length;
    const total = task.subtasks.length;
    const pct = total > 0 ? (done/total)*100 : 0;
    const isLate = task.status !== 'done' && task.dueDate < new Date().toISOString().split('T')[0];
    
    let recIcon = '';
    if (task.recurrence === 'daily') recIcon = '<span title="Diário" style="margin-left:5px">🔁</span>';
    if (task.recurrence === 'weekly') recIcon = '<span title="Semanal" style="margin-left:5px">📅</span>';
    if (task.recurrence === 'monthly') recIcon = '<span title="Mensal" style="margin-left:5px">🗓️</span>';
    if (task.recurrence === 'fortnightly') recIcon = '<span title="Quinzenal" style="margin-left:5px">📅x2</span>';

    const html = `
    <div class="card p-${task.prio} ${total>0?'has-subtasks':''} ${isLate?'overdue':''}" id="${task.id}" draggable="true" ondragstart="drag(event)" onclick="openDetails(${task.id})">
        
        <div class="card-company-header">
             <div class="card-company-name">${c ? c.name : 'INTERNO'}</div>
             <span class="badge b-${getPrioClass(task.prio)}">${task.prio}</span>
        </div>

        <h3>${task.desc} ${recIcon}</h3>
        
        <div class="card-date ${isLate?'late-text':''}"><span>📅 ${formatDate(task.dueDate)}</span></div>
        <div class="mini-progress"><div class="mini-progress-bar" style="width:${pct}%"></div></div>
        <div class="card-meta">
            <div class="assignee-pill"><div class="mini-av" style="background:${u.color}">${u.initials}</div></div>
            ${total>0 ? `<span style="font-size:0.7rem;">📝 ${done}/${total}</span>`:''}
        </div>
    </div>`;
    document.getElementById(task.status).insertAdjacentHTML('beforeend', html);
}

// DRAG & DROP
async function drop(ev) {
    ev.preventDefault();
    const id = parseInt(ev.dataTransfer.getData("text"));
    document.querySelectorAll('.task-list').forEach(el => el.classList.remove('drag-over'));
    const task = TASKS.find(t => t.id === id);
    
    if(task) {
        const newStatus = ev.currentTarget.id;
        let newDate = task.completedAt;
        if (newStatus === 'done' && task.status !== 'done') {
            newDate = new Date().toISOString().split('T')[0];
        } else if (newStatus !== 'done') {
            newDate = null;
        }
        
        await fetchAPI(`/tasks/${id}`, 'PUT', { status: newStatus, completedAt: newDate, subtasks: task.subtasks });
        await loadAppData();
    }
}