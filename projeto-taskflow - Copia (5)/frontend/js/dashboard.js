// Arquivo: frontend/js/dashboard.js

// Variáveis globais para as instâncias dos gráficos (para destruir antes de recriar)
let chartWeeklyInstance = null;
let chartUsersInstance = null;
let chartCompaniesInstance = null;

function renderDashboard() {
    // 1. Atualiza Cartões (KPIs)
    document.getElementById('dash-total').innerText = TASKS.length;
    document.getElementById('dash-done').innerText = TASKS.filter(t=> ['done', 'archived'].includes(t.status)).length;
    document.getElementById('dash-todo').innerText = TASKS.filter(t=>t.status==='todo').length;
    document.getElementById('dash-doing').innerText = TASKS.filter(t=>t.status==='doing').length;

    // 2. Lista de Urgentes (Alta Prioridade ou Atrasadas)
    const uList = document.getElementById('urgent-task-list');
    uList.innerHTML = '';
    const urgentTasks = TASKS.filter(t => t.status !== 'done' && t.status !== 'archived' && (t.prio === 'Alta' || t.dueDate < new Date().toISOString().split('T')[0]));

    // Mostra apenas as 5 primeiras para não poluir
    urgentTasks.slice(0, 5).forEach(t => {
        const isLate = t.dueDate < new Date().toISOString().split('T')[0];
        const badgeClass = isLate ? 'b-high' : `b-${getPrioClass(t.prio)}`;
        const label = isLate ? 'ATRASADO' : t.prio;

        uList.insertAdjacentHTML('beforeend', `
            <div class="urgent-item" onclick="openDetails(${t.id})" style="cursor:pointer;">
                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><strong>${t.desc}</strong></div>
                <span class="badge ${badgeClass}">${label}</span>
            </div>`
        );
    });

    if (urgentTasks.length === 0) {
        uList.innerHTML = '<div style="color:#64748b; font-size:0.9rem; text-align:center; padding:10px;">Tudo em dia! 😎</div>';
    }

    // 3. Renderiza Gráficos Chart.js
    renderCharts();
}

function renderCharts() {
    // Configurações globais de estilo
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';

    // --- GRÁFICO 1: PRODUTIVIDADE (7 DIAS) ---
    const ctxWeekly = document.getElementById('chart-weekly-canvas').getContext('2d');
    const labelsWeek = [];
    const dataWeek = [];

    for(let i=6; i>=0; i--) {
        const d = new Date(); d.setDate(new Date().getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayName = d.toLocaleDateString('pt-BR', { weekday: 'short' });

        labelsWeek.push(dayName);
        const count = TASKS.filter(t => (t.status === 'done' || t.status === 'archived') && t.completedAt && t.completedAt.startsWith(dateStr)).length;
        dataWeek.push(count);
    }

    if (chartWeeklyInstance) chartWeeklyInstance.destroy();
    chartWeeklyInstance = new Chart(ctxWeekly, {
        type: 'line',
        data: {
            labels: labelsWeek,
            datasets: [{
                label: 'Tarefas Concluídas',
                data: dataWeek,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    // --- GRÁFICO 2: POR MEMBRO (CONCLUÍDAS) ---
    const ctxUsers = document.getElementById('chart-users-canvas').getContext('2d');
    const labelsUsers = [];
    const dataUsers = [];
    const colorsUsers = [];

    USERS.forEach(u => {
        labelsUsers.push(u.name.split(' ')[0]); // Primeiro nome
        const c = TASKS.filter(t => t.assignedTo == u.id && (t.status === 'done' || t.status === 'archived')).length;
        dataUsers.push(c);
        colorsUsers.push(u.color || '#64748b');
    });

    if (chartUsersInstance) chartUsersInstance.destroy();
    chartUsersInstance = new Chart(ctxUsers, {
        type: 'bar',
        data: {
            labels: labelsUsers,
            datasets: [{
                label: 'Concluídas',
                data: dataUsers,
                backgroundColor: colorsUsers,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });

    // --- GRÁFICO 3: DEMANDAS POR EMPRESA (TOP 5) ---
    const ctxCompanies = document.getElementById('chart-companies-canvas').getContext('2d');

    // Conta tarefas por empresa
    const compCounts = {};
    TASKS.forEach(t => {
        if (!t.companyId) return; // Pula internas/sem empresa
        compCounts[t.companyId] = (compCounts[t.companyId] || 0) + 1;
    });

    // Transforma em array e ordena
    const sortedComps = Object.entries(compCounts)
        .sort((a, b) => b[1] - a[1]) // Maior para menor
        .slice(0, 5); // Top 5

    const labelsComp = [];
    const dataComp = [];
    const bgColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

    sortedComps.forEach(item => {
        const compId = item[0];
        const count = item[1];
        const comp = COMPANIES.find(c => c.id == compId);
        labelsComp.push(comp ? comp.name : 'Desconhecida');
        dataComp.push(count);
    });

    if (chartCompaniesInstance) chartCompaniesInstance.destroy();
    chartCompaniesInstance = new Chart(ctxCompanies, {
        type: 'doughnut',
        data: {
            labels: labelsComp,
            datasets: [{
                data: dataComp,
                backgroundColor: bgColors,
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#cbd5e1' } }
            }
        }
    });
}
