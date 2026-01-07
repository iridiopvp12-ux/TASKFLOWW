// --- MOBILE DASHBOARD ---
function renderMobileDashboard() {
    // Basic metrics
    if (document.getElementById('dash-todo')) document.getElementById('dash-todo').textContent = TASKS.filter(t => t.status === 'todo').length;
    if (document.getElementById('dash-doing')) document.getElementById('dash-doing').textContent = TASKS.filter(t => t.status === 'doing').length;
    if (document.getElementById('dash-done')) document.getElementById('dash-done').textContent = TASKS.filter(t => t.status === 'done').length;

    // Chart (Reusing simplified logic from dashboard.js)
    renderMobileChart();
}

function renderMobileChart() {
    const ctx = document.getElementById('chart-weekly-canvas');
    if (!ctx) return;

    // Destroy previous instance if exists (Chart.js specific)
    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    // Data Mockup (or real calculation similar to dashboard.js)
    // For brevity, let's just count total completed per day last 7 days
    const last7Days = Array.from({length: 7}, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() - (6-i));
        return d.toISOString().split('T')[0];
    });

    const dataPoints = last7Days.map(date =>
        TASKS.filter(t => t.status === 'done' && t.completedAt === date).length
    );

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: last7Days.map(d => d.split('-').slice(1).join('/')),
            datasets: [{
                label: 'Tarefas Feitas',
                data: dataPoints,
                backgroundColor: '#3b82f6',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

// --- MOBILE BOARD (TASKS) ---
function setTaskTab(status) {
    CURRENT_TAB = status;
    document.querySelectorAll('.tasks-tabs .tab').forEach(b => {
        b.classList.toggle('active', b.onclick.toString().includes(status));
    });
    renderMobileBoard();
}

function renderMobileBoard() {
    const list = document.getElementById('mobile-task-list');
    list.innerHTML = '';

    const filtered = TASKS.filter(t => t.status === CURRENT_TAB);

    filtered.forEach(t => {
        const assignee = USERS.find(u => u.id === t.assignee_id)?.name || 'N/A';
        const company = COMPANIES.find(c => c.id === t.company_id)?.name || 'Interna';

        const card = document.createElement('div');
        card.className = 'task-card-mobile';
        card.onclick = () => openMobileTaskDetails(t);

        const titleDiv = document.createElement('div');
        titleDiv.className = 't-title';
        titleDiv.textContent = t.description;

        const metaDiv1 = document.createElement('div');
        metaDiv1.className = 't-meta';
        metaDiv1.innerHTML = `<span>👤 ${assignee}</span><span>📅 ${formatDate(t.due_date)}</span>`;

        const metaDiv2 = document.createElement('div');
        metaDiv2.className = 't-meta';
        metaDiv2.style.marginTop = '5px';
        metaDiv2.style.color = 'var(--primary)';
        metaDiv2.textContent = `🏢 ${company}`;

        card.appendChild(titleDiv);
        card.appendChild(metaDiv1);
        card.appendChild(metaDiv2);
        list.appendChild(card);
    });

    if(filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Nenhuma tarefa aqui.</div>`;
    }
}

// --- MOBILE DETAILS ---
let currentTaskMobile = null;
function openMobileTaskDetails(task) {
    currentTaskMobile = task;
    const modal = document.getElementById('modal-details');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('open'), 10); // CSS transition

    document.getElementById('detail-title-display').textContent = task.description;

    const assigneeName = USERS.find(u => u.id === task.assignee_id)?.name || 'N/A';
    const companyName = COMPANIES.find(c => c.id === task.company_id)?.name || 'Interna';

    const contentDiv = document.getElementById('detail-content');
    contentDiv.innerHTML = ''; // Clear

    // Status Area
    const statusArea = document.createElement('div');
    statusArea.style.cssText = "margin-bottom:15px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px;";
    statusArea.innerHTML = `
        <div style="font-size:0.9rem; color:#94a3b8;">Status atual: <strong style="color:white; text-transform:uppercase;">${task.status}</strong></div>
        <div style="display:flex; gap:10px; margin-top:10px;">
            <button class="btn-secondary" onclick="moveTaskMobile('todo')">Pendente</button>
            <button class="btn-secondary" onclick="moveTaskMobile('doing')">Exec.</button>
            <button class="btn-secondary" onclick="moveTaskMobile('done')">Feita</button>
        </div>
    `;
    contentDiv.appendChild(statusArea);

    const infoP1 = document.createElement('p');
    infoP1.innerHTML = `<strong>Responsável:</strong> ${assigneeName}`;
    contentDiv.appendChild(infoP1);

    const infoP2 = document.createElement('p');
    infoP2.innerHTML = `<strong>Empresa:</strong> ${companyName}`;
    contentDiv.appendChild(infoP2);

    const infoP3 = document.createElement('p');
    infoP3.innerHTML = `<strong>Prazo:</strong> ${formatDate(task.due_date)}`;
    contentDiv.appendChild(infoP3);

    renderMobileSubtasks(task);
}

function renderMobileSubtasks(task) {
    const list = document.getElementById('subtask-list');
    list.innerHTML = '';
    const subs = task.subtasks || [];

    subs.forEach((sub, idx) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.marginBottom = '5px';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = sub.done;
        checkbox.onchange = () => toggleMobileSubtask(idx);

        const span = document.createElement('span');
        span.textContent = sub.text;
        if(sub.done) {
            span.style.textDecoration = 'line-through';
            span.style.color = 'gray';
        }

        const delBtn = document.createElement('span');
        delBtn.textContent = '×';
        delBtn.style.cssText = "margin-left:auto; color:red; cursor:pointer;";
        delBtn.onclick = () => deleteMobileSubtask(idx);

        row.appendChild(checkbox);
        row.appendChild(span);
        row.appendChild(delBtn);
        list.appendChild(row);
    });
}

// --- CRUD ACTIONS ---

async function saveTask() {
    const desc = document.getElementById('input-desc').value;
    const date = document.getElementById('input-date').value;
    const assignee = document.getElementById('input-assignee').value;

    if(!desc || !date) {
        showToast("Preencha título e data", "error");
        return;
    }

    const payload = {
        description: desc,
        due_date: date,
        assignee_id: assignee ? parseInt(assignee) : null,
        company_id: null, // Simple mobile creation
        status: 'todo',
        priority: 'Média',
        recurrence: 'none'
    };

    const res = await fetchAPI('/tasks', 'POST', payload);
    if(res) {
        showToast("Tarefa criada!", "success");
        closeModal('modal-create');
        loadAppData(); // Refresh
        // Clear inputs
        document.getElementById('input-desc').value = '';
        document.getElementById('input-date').value = '';
    }
}

async function deleteCurrentTask() {
    if(!currentTaskMobile) return;
    if(!confirm("Excluir esta tarefa?")) return;

    await fetchAPI(`/tasks/${currentTaskMobile.id}`, 'DELETE');
    closeModal('modal-details');
    showToast("Tarefa excluída", "success");
    loadAppData();
}

async function deleteMobileSubtask(idx) {
    if (!currentTaskMobile) return;
    currentTaskMobile.subtasks.splice(idx, 1);
    await fetchAPI(`/tasks/${currentTaskMobile.id}`, 'PUT', { subtasks: currentTaskMobile.subtasks });
    renderMobileSubtasks(currentTaskMobile);
}

async function moveTaskMobile(newStatus) {
    if (!currentTaskMobile) return;
    await fetchAPI(`/tasks/${currentTaskMobile.id}`, 'PUT', { status: newStatus });
    closeModal('modal-details');
    // loadAppData triggered by WS, but let's optimistic update
    currentTaskMobile.status = newStatus;
    renderMobileBoard();
}

async function toggleMobileSubtask(idx) {
    if (!currentTaskMobile) return;
    currentTaskMobile.subtasks[idx].done = !currentTaskMobile.subtasks[idx].done;
    await fetchAPI(`/tasks/${currentTaskMobile.id}`, 'PUT', { subtasks: currentTaskMobile.subtasks });
    renderMobileSubtasks(currentTaskMobile);
}

async function addSubtask() {
    const inp = document.getElementById('new-subtask-input');
    if (!inp.value.trim() || !currentTaskMobile) return;

    if(!currentTaskMobile.subtasks) currentTaskMobile.subtasks = [];
    currentTaskMobile.subtasks.push({ text: inp.value.trim(), done: false });

    await fetchAPI(`/tasks/${currentTaskMobile.id}`, 'PUT', { subtasks: currentTaskMobile.subtasks });
    inp.value = '';
    renderMobileSubtasks(currentTaskMobile);
}

// --- MOBILE CHAT ---
async function initMobileChat() {
    const msgs = await fetchAPI('/chat/messages');
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';

    if (msgs) {
        msgs.forEach(renderMobileChatMessage);
        container.scrollTop = container.scrollHeight;
    }
}

function renderMobileChatMessage(msg) {
    const container = document.getElementById('chat-messages');
    const isMine = (currentUser && msg.user_id === currentUser.id);
    const div = document.createElement('div');
    div.className = `chat-msg ${isMine ? 'mine' : ''}`;

    const userName = USERS.find(u => u.id === msg.user_id)?.name || 'User';

    // Header
    const header = document.createElement('div');
    header.style.cssText = `font-size:0.7rem; color:gray; margin-bottom:2px; text-align:${isMine?'right':'left'}`;
    header.textContent = userName;

    // Bubble
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = msg.content; // Safe text insertion

    div.appendChild(header);
    div.appendChild(bubble);
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function sendChatMessage() {
    const inp = document.getElementById('chat-input');
    const txt = inp.value.trim();
    if(!txt || !currentUser) return;

    await fetchAPI('/chat/send', 'POST', {
        user_id: currentUser.id,
        content: txt,
        file_url: null,
        audio_url: null
    });
    inp.value = '';
    // WS will update view
}

function handleChatNotification(payload) {
    // Only if chat view is active, append message
    if(document.getElementById('view-chat').classList.contains('active')) {
        if(payload.action === 'create') {
            renderMobileChatMessage(payload.data);
        }
    } else {
        // Maybe show a red dot on nav?
    }
}
