function renderDashboard() {
    document.getElementById('dash-total').innerText = TASKS.length;
    document.getElementById('dash-done').innerText = TASKS.filter(t=> ['done', 'archived'].includes(t.status)).length;
    document.getElementById('dash-todo').innerText = TASKS.filter(t=>t.status==='todo').length;
    document.getElementById('dash-doing').innerText = TASKS.filter(t=>t.status==='doing').length;

    const uList = document.getElementById('urgent-task-list'); uList.innerHTML = '';
    TASKS.filter(t => t.status !== 'done' && t.status !== 'archived' && (t.prio === 'Alta' || t.dueDate < new Date().toISOString().split('T')[0])).forEach(t => { 
        uList.insertAdjacentHTML('beforeend', `<div class="urgent-item"><div><strong>${t.desc}</strong></div><span class="badge b-${getPrioClass(t.prio)}">${t.prio}</span></div>`); 
    });
    renderCharts();
}

function renderCharts() {
    // GRÁFICO 1: 7 DIAS
    const week = document.getElementById('chart-weekly'); week.innerHTML = ''; const days = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
    for(let i=6; i>=0; i--) { 
        const d = new Date(); d.setDate(new Date().getDate() - i); 
        const dateStr = d.toISOString().split('T')[0]; 
        const count = TASKS.filter(t => (t.status === 'done' || t.status === 'archived') && t.completedAt === dateStr).length; 
        week.insertAdjacentHTML('beforeend', `<div class="chart-row"><span style="width:30px; font-size:0.8rem;">${days[d.getDay()]}</span><div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${Math.min(count*10+5,100)}%; background:var(--primary);">${count}</div></div></div>`); 
    }
    
    // GRÁFICO 2: TODOS OS MEMBROS
    const uChart = document.getElementById('chart-users'); uChart.innerHTML = '';
    USERS.forEach(u => { 
        const c = TASKS.filter(t => t.assignedTo == u.id && (t.status === 'done' || t.status === 'archived')).length; 
        uChart.insertAdjacentHTML('beforeend', `<div class="chart-row"><span style="font-weight:bold; color:${u.color}">${u.initials}</span><div class="chart-bar-bg"><div class="chart-bar-fill" style="width:${Math.min(c*10+5,100)}%; background:${u.color}">${c}</div></div></div>`); 
    });
}