// Arquivo: frontend/js/dashboard.js

// Variáveis globais para as instâncias dos gráficos
let chartWeeklyInstance = null;
let chartUsersInstance = null;
let chartCompaniesInstance = null;

function renderDashboard() {
    // FILTROS DE DATA
    const startInput = document.getElementById('dash-date-start');
    const endInput = document.getElementById('dash-date-end');

    // Se vazio, define padrão (últimos 30 dias)
    if (!startInput.value) {
        const d = new Date(); d.setDate(d.getDate() - 30);
        startInput.value = d.toISOString().split('T')[0];
    }
    if (!endInput.value) {
        endInput.value = new Date().toISOString().split('T')[0];
    }

    const startDate = startInput.value;
    const endDate = endInput.value;

    // Filtra tarefas pela data de CONCLUSÃO (se feito) ou CRIAÇÃO/VENCIMENTO?
    // Dashboard geralmente olha para produtividade no período.
    // Vamos considerar:
    // - Para KPIs de STATUS (Total, Pendente, Doing): Estado ATUAL (snapshot), independente de data?
    //   OU filtra tarefas criadas/vencendo no período?
    //   Geralmente "Total" é total do banco.
    //   Mas "Concluídas" deve respeitar o filtro de data (Produtividade do mês).
    // Vamos filtrar APENAS para os gráficos e contagem de concluídas. O resto mostra snapshot atual.

    // --- FILTER BY SECTOR / ASSIGNEE ---
    // Reuse logic from Kanban filter
    const fVal = document.getElementById('filter-user-select').value;
    let viewTasks = TASKS;

    // 1. VISIBILITY (Scope)
    if (currentUser.role === 'user') {
        viewTasks = viewTasks.filter(t => {
            const isAssigned = (t.assignedTo === currentUser.id) || (t.assigneeIds && t.assigneeIds.includes(currentUser.id));
            const isSector = (t.sectorId && currentUser.sector_id && t.sectorId === currentUser.sector_id);
            return isAssigned || isSector;
        });
    }

    // 2. USER DROPDOWN FILTER
    if (fVal && fVal !== 'all') {
        if (fVal.startsWith('SEC:')) {
            const secId = parseInt(fVal.split(':')[1]);
            viewTasks = viewTasks.filter(t => t.sectorId === secId);
        } else {
            const uid = parseInt(fVal);
            viewTasks = viewTasks.filter(t => t.assignedTo == uid || (t.assigneeIds && t.assigneeIds.includes(uid)));
        }
    }

    // Filtro para Concluídas no período (Within View Scope)
    const filteredDone = viewTasks.filter(t =>
        ['done', 'archived'].includes(t.status) &&
        t.completedAt >= startDate &&
        t.completedAt <= endDate
    );

    // 1. Atualiza Cartões (KPIs)
    document.getElementById('dash-total').innerText = viewTasks.length; // Total Geral (Scope)
    document.getElementById('dash-done').innerText = filteredDone.length; // Concluídas no Período
    document.getElementById('dash-todo').innerText = viewTasks.filter(t=>t.status==='todo').length; // Atual
    document.getElementById('dash-doing').innerText = viewTasks.filter(t=>t.status==='doing').length; // Atual

    // 2. Lista de Urgentes (Alta Prioridade ou Atrasadas) - Snapshot Atual
    const uList = document.getElementById('urgent-task-list');
    uList.innerHTML = '';
    const urgentTasks = viewTasks.filter(t => t.status !== 'done' && t.status !== 'archived' && (t.prio === 'Alta' || t.dueDate < new Date().toISOString().split('T')[0]));

    // Na TV, mostramos mais itens se couber (scroll oculto)
    urgentTasks.forEach(t => {
        const isLate = t.dueDate < new Date().toISOString().split('T')[0];
        const badgeClass = isLate ? 'b-high' : `b-${getPrioClass(t.prio)}`;
        const label = isLate ? 'ATRASADO' : t.prio;

        uList.insertAdjacentHTML('beforeend', `
            <div class="urgent-item" onclick="openDetails(${t.id})" style="cursor:pointer; padding: 12px 18px;">
                <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size: 0.95rem;"><strong>${t.desc}</strong></div>
                <span class="badge ${badgeClass}" style="font-size: 0.7rem;">${label}</span>
            </div>`
        );
    });

    if (urgentTasks.length === 0) {
        uList.innerHTML = '<div style="color:#64748b; font-size:1.2rem; text-align:center; padding:40px;">Tudo em dia! 😎</div>';
    }

    // 3. Renderiza Gráficos Chart.js
    renderCharts(startDate, endDate, filteredDone, viewTasks);
}

function renderCharts(startDate, endDate, filteredDone, viewTasks) {
    Chart.defaults.color = '#94a3b8';
    Chart.defaults.borderColor = '#334155';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 14;

    // Register the datalabels plugin if using Chart.js < 3 global registration or ensure it's available
    // Since we included the CDN, we should register it if it's not automatic.
    // Usually CDN registers it to Chart.registry or Chart.plugins.
    if (Chart.register && window.ChartDataLabels) {
        Chart.register(window.ChartDataLabels);
    }

    const commonDatalabels = {
        display: true,
        color: 'white',
        align: 'end',
        anchor: 'end',
        font: { weight: 'bold', size: 12 },
        offset: 0,
        padding: 4
    };

    // --- GRÁFICO 1: PRODUTIVIDADE (DIÁRIA NO PERÍODO) ---
    const ctxWeekly = document.getElementById('chart-weekly-canvas').getContext('2d');
    const labelsWeek = [];
    const dataWeek = [];

    // Gera labels de dias entre start e end
    let curr = new Date(startDate);
    const end = new Date(endDate);

    while (curr <= end) {
        const dateStr = curr.toISOString().split('T')[0];
        const dayName = curr.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

        labelsWeek.push(dayName);
        const count = filteredDone.filter(t => t.completedAt && t.completedAt.startsWith(dateStr)).length;
        dataWeek.push(count);

        curr.setDate(curr.getDate() + 1);
    }

    if (chartWeeklyInstance) chartWeeklyInstance.destroy();
    chartWeeklyInstance = new Chart(ctxWeekly, {
        type: 'line',
        data: {
            labels: labelsWeek,
            datasets: [{
                label: 'Concluídas',
                data: dataWeek,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    ...commonDatalabels,
                    align: 'top',
                    display: function(context) {
                        return context.dataset.data[context.dataIndex] > 0; // Hide 0s
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 12 } } },
                x: { ticks: { font: { size: 12 } } }
            }
        }
    });

    // --- GRÁFICO 2: POR MEMBRO (CONCLUÍDAS NO PERÍODO) ---
    const ctxUsers = document.getElementById('chart-users-canvas').getContext('2d');
    const labelsUsers = [];
    const dataUsers = [];
    const colorsUsers = [];

    USERS.forEach(u => {
        labelsUsers.push(u.name.split(' ')[0]);
        const c = filteredDone.filter(t => t.assignedTo == u.id).length;
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
                borderRadius: 4,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                datalabels: {
                    ...commonDatalabels,
                    anchor: 'end',
                    align: 'top',
                    display: function(context) {
                        return context.dataset.data[context.dataIndex] > 0;
                    }
                }
            },
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } },
                x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } }
            }
        }
    });

    // --- GRÁFICO 3: DEMANDAS POR EMPRESA (TOP 5) ---
    const ctxCompanies = document.getElementById('chart-companies-canvas').getContext('2d');

    const compCounts = {};
    // Use viewTasks or TASKS? viewTasks is better for consistency with filters
    // However, the original code used TASKS (all). But since we filter visuals now, we should filter charts too.
    // Let's use viewTasks (which is filtered by scope/dropdown)
    viewTasks.forEach(t => {
        if (!t.companyId) return;
        compCounts[t.companyId] = (compCounts[t.companyId] || 0) + 1;
    });

    const sortedComps = Object.entries(compCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

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
            layout: { padding: 10 },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 11 }, padding: 15 }
                },
                datalabels: {
                    color: 'white',
                    font: { weight: 'bold', size: 12 },
                    formatter: (value, ctx) => {
                        return value;
                    }
                }
            }
        }
    });
}
