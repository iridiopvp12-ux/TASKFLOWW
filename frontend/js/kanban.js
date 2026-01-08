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

    const fVal = document.getElementById('filter-user-select').value;

    // VISIBILITY LOGIC
    // Admin sees everything by default, unless filtered.
    // User sees only their tasks OR their sector tasks.

    if (currentUser.role === 'user') {
        filtered = filtered.filter(t => {
            // Check if assigned (legacy or multi)
            const isAssigned = (t.assignedTo === currentUser.id) || (t.assigneeIds && t.assigneeIds.includes(currentUser.id));
            // Check sector
            const isSector = (t.sectorId && currentUser.sector_id && t.sectorId === currentUser.sector_id);
            // Public/Open tasks? "LIVRE" if assignedTo is null AND sectorId is null? Maybe.
            // Requirement says: "Task appears for everyone in the sector".
            return isAssigned || isSector;
        });
    }

    // FILTER LOGIC (Dropdown)
    if (fVal !== 'all') {
        if (fVal.startsWith('SEC:')) {
            const secId = parseInt(fVal.split(':')[1]);
            filtered = filtered.filter(t => t.sectorId === secId);
        } else {
            const uid = parseInt(fVal);
            filtered = filtered.filter(t => t.assignedTo == uid || (t.assigneeIds && t.assigneeIds.includes(uid)));
        }
    }

    document.getElementById('count-todo').innerText = filtered.filter(t => t.status === 'todo').length;
    document.getElementById('count-doing').innerText = filtered.filter(t => t.status === 'doing').length;
    document.getElementById('count-done').innerText = filtered.filter(t => t.status === 'done').length;

    filtered.forEach(createCard);
}

function createCard(task) {
    // Determine visual owner (Legacy or First of Multi or Sector)
    let u = null;

    // Priority: Sector Badge? Or User Badge?
    // If sector task, maybe show Sector Name?
    // User requested "Task appears for everyone in the sector".

    if (task.sectorId) {
        const s = SECTORS.find(x => x.id === task.sectorId);
        if (s) {
            u = { name: `Setor: ${s.name}`, color: '#6366f1', initials: 'SEC' };
        }
    }

    if (!u) {
        // Try user
        let uid = task.assignedTo;
        if (!uid && task.assigneeIds && task.assigneeIds.length > 0) uid = task.assigneeIds[0];

        if (uid) {
            const found = USERS.find(x => x.id == uid);
            if (found) {
                 u = found;
                 if (task.assigneeIds && task.assigneeIds.length > 1) {
                     u = { ...found, name: `${found.name} +${task.assigneeIds.length-1}` }; // Visual indicator of multiple
                 }
            }
        }
    }

    if (!u) u = { name: 'LIVRE', color: '#94a3b8', initials: '?' };

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
        if (task.status === newStatus) return;

        // --- OPTIMISTIC UI ---
        const card = document.getElementById(id);
        if (card) {
            ev.currentTarget.appendChild(card);

            const oldCol = document.getElementById('count-' + task.status);
            const newCol = document.getElementById('count-' + newStatus);
            if(oldCol) oldCol.innerText = Math.max(0, parseInt(oldCol.innerText) - 1);
            if(newCol) newCol.innerText = parseInt(newCol.innerText) + 1;
        }

        let newDate = task.completedAt;
        if (newStatus === 'done' && task.status !== 'done') {
            newDate = new Date().toISOString().split('T')[0];
        } else if (newStatus !== 'done') {
            newDate = null;
        }

        // Update Local State immediately
        task.status = newStatus;
        task.completedAt = newDate;

        // Sync with Server
        await fetchAPI(`/tasks/${id}`, 'PUT', { status: newStatus, completedAt: newDate, subtasks: task.subtasks });

        // No explicit reload, wait for WebSocket to confirm (or silent success)
    }
}