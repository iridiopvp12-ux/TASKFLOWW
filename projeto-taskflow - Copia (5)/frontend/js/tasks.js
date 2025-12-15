// Arquivo: frontend/js/tasks.js

// --- CRIAÇÃO DE TAREFAS ---
function openCreateModal(){ 
    loadTemplatesForCompany(); 
    document.getElementById('input-assignee').value = currentUser.id; 
    document.getElementById('input-date').value = new Date().toISOString().split('T')[0]; 
    
    document.getElementById('input-desc').value = '';
    document.getElementById('create-company-select').value = '';
    document.getElementById('create-template-select').innerHTML = '<option value="">-- Manual --</option>';

    const m=document.getElementById('modal-create'); 
    m.style.display='flex'; 
    setTimeout(()=>m.classList.add('open'),10); 
}

function loadTemplatesForCompany() { 
    const cid = document.getElementById('create-company-select').value; 
    const tSel = document.getElementById('create-template-select'); 
    tSel.innerHTML = '<option value="">-- Manual --</option>'; 
    
    if(cid) { 
        const c = COMPANIES.find(x => x.id == cid); 
        if(c && c.templates) c.templates.forEach((t,i) => tSel.innerHTML += `<option value="${i}">${t.name}</option>`); 
        if(c && c.defaultAssignee) document.getElementById('input-assignee').value = c.defaultAssignee; 
    } 
}

function applyTemplate() { 
    const cid = document.getElementById('create-company-select').value; 
    const tid = document.getElementById('create-template-select').value; 
    
    if(cid && tid !== "") { 
        const c = COMPANIES.find(x => x.id == cid); 
        if (c && c.templates && c.templates[tid]) {
             document.getElementById('input-desc').value = `${c.templates[tid].name} - ${c.name}`; 
        }
    } 
}

async function saveTask() {
    const desc = document.getElementById('input-desc').value;
    const date = document.getElementById('input-date').value;
    const recurrence = document.getElementById('input-recurrence').value; 

    if(!desc || !date) return showToast("Preencha dados obrigatórios", "error");
    
    let recurrenceDay = null;
    if (recurrence === 'monthly') recurrenceDay = parseInt(date.split('-')[2]); 
    else if (recurrence === 'weekly') {
        const d = new Date(date + 'T00:00:00'); 
        recurrenceDay = d.getDay();
    }

    const compId = document.getElementById('create-company-select').value;
    const tIndex = document.getElementById('create-template-select').value;
    let subtasks = [];

    if(compId && tIndex !== "") {
        const c = COMPANIES.find(x => x.id == compId);
        if(c && c.templates && c.templates[tIndex]) {
            subtasks = c.templates[tIndex].subtasks.map(s => ({ text: s, done: false, done_by: null, done_at: null }));
        }
    }

    const newTask = {
        desc, dueDate: date, assignedTo: parseInt(document.getElementById('input-assignee').value),
        prio: document.getElementById('input-prio').value,
        companyId: compId, subtasks,
        status: "todo", completedAt: null,
        recurrence, recurrenceDay 
    };

    const res = await fetchAPI('/tasks', 'POST', newTask);
    if(res) { 
        closeModal('modal-create'); 
        await loadAppData(); 
        showToast("Tarefa Criada!", "success"); 
    }
}

// --- DETALHES & SUBTASKS ---
function openDetails(id) {
    currentOpenTaskId = id;
    const t = TASKS.find(x => x.id == id);
    const c = COMPANIES.find(x => x.id == t.companyId);

    document.getElementById('detail-title-display').innerText = t.desc;
    document.getElementById('detail-company-display').innerText = c ? c.name : 'INTERNO';
    document.getElementById('detail-prio-display').innerText = t.prio;
    document.getElementById('detail-date-display').innerText = `📅 ${formatDate(t.dueDate)}`;

    const sel = document.getElementById('detail-assignee-select');
    sel.innerHTML = '<option value="">-- Sem Dono --</option>';
    
    if(typeof USERS !== 'undefined') {
        USERS.forEach(u => {
            const isSelected = (t.assignedTo == u.id) ? 'selected' : '';
            sel.innerHTML += `<option value="${u.id}" ${isSelected}>${u.name}</option>`;
        });
    }

    renderSubtasks(t);
    renderComments(t); // NEW
    const modal = document.getElementById('modal-details');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('open'), 10);
}

// --- COMENTÁRIOS ---
function renderComments(task) {
    const list = document.getElementById('comments-list');
    list.innerHTML = '';
    if (!task.comments || task.comments.length === 0) {
        list.innerHTML = '<div style="color:#64748b; text-align:center;">Nenhum comentário.</div>';
        return;
    }
    task.comments.forEach(c => {
        const u = USERS.find(x => x.id === c.author_id);
        const name = u ? u.name : 'Desconhecido';
        const date = new Date(c.created_at).toLocaleString('pt-BR');

        list.insertAdjacentHTML('beforeend', `
            <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--primary);">
                    <span>${name}</span>
                    <span>${date}</span>
                </div>
                <div style="color:#e2e8f0; margin-top:2px;">${c.text}</div>
            </div>
        `);
    });
    list.scrollTop = list.scrollHeight;
}

async function postComment() {
    const input = document.getElementById('new-comment-input');
    const txt = input.value;
    if (!txt) return;

    const res = await fetchAPI(`/tasks/${currentOpenTaskId}/comments`, 'POST', { text: txt, authorId: currentUser.id });
    if (res && res.success) {
        input.value = '';
        // Atualiza localmente para feedback instantâneo (Optimistic seria melhor, mas aqui recarregamos)
        // O WebSocket vai atualizar tudo, mas se quisermos ver AGORA:
        const t = TASKS.find(x => x.id === currentOpenTaskId);
        if (!t.comments) t.comments = [];
        t.comments.push({ text: txt, author_id: currentUser.id, created_at: new Date().toISOString() });
        renderComments(t);
    }
}

// DELEGAÇÃO FUNCIONAL
async function delegateTask() {
    const sel = document.getElementById('detail-assignee-select');
    const newOwnerId = sel.value ? parseInt(sel.value) : null;
    
    const res = await fetchAPI(`/tasks/${currentOpenTaskId}`, 'PUT', { assignedTo: newOwnerId });
    
    if(res) {
        showToast("Responsável alterado! 🤝", "success");
        const t = TASKS.find(x => x.id == currentOpenTaskId);
        if(t) t.assignedTo = newOwnerId;
        await loadAppData(false);
    }
}

async function deleteCurrentTask() {
    if(confirm("Excluir esta tarefa?")) {
        await fetchAPI(`/tasks/${currentOpenTaskId}`, 'DELETE');
        closeModal('modal-details');
        await loadAppData();
    }
}

function renderSubtasks(task) {
    const list = document.getElementById('subtask-list');
    list.innerHTML = '';
    task.subtasks.forEach((s, idx) => {
        const doneBy = s.done_by ? USERS.find(u => u.id === s.done_by)?.name : '';
        const doneAt = s.done_at ? `<small style="color:#64748b; margin-left:15px;">Concluído por ${doneBy} em ${formatDate(s.done_at)}</small>` : '';

        const html = `<div class="subtask-item" style="display:flex; flex-direction:column; gap:0; margin-bottom:8px; padding: 5px 0;">
            <div style="display:flex; gap:10px; align-items:center;">
                <input type="checkbox" ${s.done?'checked':''} onchange="toggleSub(${idx})">
                <span style="flex:1; ${s.done?'text-decoration:line-through;color:#64748b':''}">${s.text}</span>
                <button style="border:none; background:none; color:#ef4444;" onclick="removeSub(${idx})">×</button>
            </div>
            ${doneAt}
        </div>`;
        list.insertAdjacentHTML('beforeend', html);
    });
    const done = task.subtasks.filter(s => s.done).length;
    const pct = task.subtasks.length > 0 ? Math.round((done/task.subtasks.length)*100) : 0;
    document.getElementById('detail-progress').innerText = `${pct}%`;
}

async function toggleSub(idx) {
    const t = TASKS.find(x => x.id == currentOpenTaskId);
    const sub = t.subtasks[idx];
    
    sub.done = !sub.done;

    if (sub.done) {
        sub.done_by = currentUser.id;
        sub.done_at = new Date().toISOString(); 
    } else {
        sub.done_by = null;
        sub.done_at = null;
    }

    const doneCount = t.subtasks.filter(s => s.done).length;
    const totalCount = t.subtasks.length;
    let newStatus = t.status; 
    let newDate = t.completedAt;
    
    if (doneCount === totalCount && totalCount > 0) { 
        newStatus = 'done'; 
        newDate = new Date().toISOString().split('T')[0]; 
        showToast("Tarefa Concluída! 🎉", "success"); 
    } 
    else if (doneCount > 0 && t.status === 'todo') { 
        newStatus = 'doing'; 
        newDate = null; 
    } 
    else if (doneCount < totalCount && t.status === 'done') { 
        newStatus = 'doing'; 
        newDate = null; 
    }

    await fetchAPI(`/tasks/${t.id}`, 'PUT', { subtasks: t.subtasks, status: newStatus, completedAt: newDate });
    
    t.status = newStatus; t.completedAt = newDate;
    renderSubtasks(t); 
    await loadAppData(false); 
}

async function addSubtask() {
    const txt = document.getElementById('new-subtask-input').value;
    if(!txt) return;
    const t = TASKS.find(x => x.id == currentOpenTaskId);
    t.subtasks.push({ text: txt, done: false, done_by: null, done_at: null });
    let newStatus = t.status; let newDate = t.completedAt;
    if (t.status === 'done') { newStatus = 'doing'; newDate = null; }
    await fetchAPI(`/tasks/${t.id}`, 'PUT', { subtasks: t.subtasks, status: newStatus, completedAt: newDate });
    document.getElementById('new-subtask-input').value = ''; renderSubtasks(t); await loadAppData(false);
}

async function removeSub(idx) {
    const t = TASKS.find(x => x.id == currentOpenTaskId);
    t.subtasks.splice(idx, 1);
    
    const doneCount = t.subtasks.filter(s => s.done).length;
    const totalCount = t.subtasks.length;
    let newStatus = t.status; let newDate = t.completedAt;
    if (totalCount > 0 && doneCount === totalCount) { newStatus = 'done'; newDate = new Date().toISOString().split('T')[0]; }
    await fetchAPI(`/tasks/${t.id}`, 'PUT', { subtasks: t.subtasks, status: newStatus, completedAt: newDate });
    renderSubtasks(t); await loadAppData(false);
}