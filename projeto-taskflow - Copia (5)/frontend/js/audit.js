// Arquivo: frontend/js/audit.js

let AUDIT_DATA_STATE = {
    total: 0,
    currentPage: 1,
    itemsPerPage: 50,
    currentFilters: {}
};

function setupAuditFilters() {
    const userSelect = document.getElementById('filter-audit-user');
    userSelect.innerHTML = '<option value="">-- Todos os Colaboradores --</option>';
    USERS.forEach(user => {
        userSelect.innerHTML += `<option value="${user.id}">${user.name}</option>`;
    });

    const compSelect = document.getElementById('filter-audit-company');
    if (compSelect) {
        compSelect.innerHTML = '<option value="">-- Todas as Empresas --</option>';
        COMPANIES.forEach(comp => {
            compSelect.innerHTML += `<option value="${comp.id}">${comp.name}</option>`;
        });
    }
}

async function renderAuditData(page = 1) {
    const userId = document.getElementById('filter-audit-user').value;
    const compSelect = document.getElementById('filter-audit-company');
    const compId = compSelect ? compSelect.value : '';
    const dateStart = document.getElementById('audit-date-start').value;
    const dateEnd = document.getElementById('audit-date-end').value;
    
    // 🔍 NOVO: Captura valor da busca
    const searchText = document.getElementById('audit-search-text').value;
    
    const container = document.getElementById('audit-list-container');
    const paginationContainer = document.getElementById('audit-pagination-controls');
    
    container.innerHTML = `<p style="color:var(--text-muted); padding: 20px;">Carregando dados da página ${page}...</p>`;
    
    AUDIT_DATA_STATE.currentPage = page;
    const skip = (page - 1) * AUDIT_DATA_STATE.itemsPerPage;

    // Monta a URL com filtros
    let url = `/audit-tasks?skip=${skip}&limit=${AUDIT_DATA_STATE.itemsPerPage}`;
    if (userId) url += `&user_id=${userId}`;
    if (compId) url += `&company_id=${compId}`;
    if (dateStart) url += `&date_start=${dateStart}`;
    if (dateEnd) url += `&date_end=${dateEnd}`;
    
    // 🔍 NOVO: Adiciona na URL
    if (searchText) url += `&search=${encodeURIComponent(searchText)}`;
    
    // Salva estado para CSV
    AUDIT_DATA_STATE.currentFilters = { userId, compId, dateStart, dateEnd, searchText };

    const response = await fetchAPI(url, 'GET');

    if (!response || !response.data) {
        container.innerHTML = `<p style="color:var(--danger); padding: 20px;">Erro ao carregar dados.</p>`;
        return;
    }
    
    const auditData = response.data;
    AUDIT_DATA_STATE.total = response.total;

    updateKPIs(auditData, response.total);

    container.innerHTML = '';
    if (auditData.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); padding: 20px;">Nenhum registro encontrado para os filtros.</p>`;
    } else {
        auditData.forEach(task => {
            const companyName = task.companyName || 'Interna';
            const assigneeName = task.userName || 'Não atribuído';
            const completedDate = formatDate(task.completedAt);
            const prioClass = getPrioClass(task.prio);

            let subtasksHtml = '';
            if (task.subtasks && task.subtasks.length > 0) {
                subtasksHtml = `<div class="audit-details-panel">`;
                task.subtasks.forEach(sub => {
                    const doneBy = sub.done_by ? USERS.find(u => u.id === sub.done_by)?.name : 'N/A';
                    const doneAt = sub.done_at ? formatDate(sub.done_at) : 'N/A';
                    const statusIcon = sub.done ? '✅' : '❌';
                    
                    subtasksHtml += `<div style="margin-bottom: 4px;">
                        ${statusIcon} <strong>${sub.text}</strong> <span style="color:var(--text-muted); font-size:0.8rem;"> — ${doneBy} em ${doneAt}</span>
                    </div>`;
                });
                subtasksHtml += `</div>`;
            }

            const rowId = `audit-row-${task.id}`;
            const html = `
                <div class="audit-row" onclick="toggleAuditRow('${rowId}')">
                    <div style="font-weight:600; color:white;">${task.desc}</div>
                    <div style="color:var(--primary);">${companyName}</div>
                    <div style="font-size:0.85rem;">
                        <div style="color:white;">${assigneeName}</div>
                        <div style="color:var(--text-muted);">${completedDate}</div>
                    </div>
                    <div style="text-align:right;">
                        <span class="badge b-${prioClass}">${task.prio}</span>
                    </div>
                </div>
                <div id="${rowId}" style="display:none;">${subtasksHtml}</div>
            `;
            container.insertAdjacentHTML('beforeend', html);
        });
    }
    
    renderPaginationControls(paginationContainer);
}

function toggleAuditRow(id) {
    const wrapper = document.getElementById(id);
    if (wrapper.style.display === 'none') {
        wrapper.style.display = 'block';
    } else {
        wrapper.style.display = 'none';
    }
}

function updateKPIs(data, totalCount) {
    const kpiTotal = document.getElementById('kpi-total');
    if(kpiTotal) kpiTotal.innerText = totalCount;
    
    const kpiDone = document.getElementById('kpi-done');
    if(kpiDone) kpiDone.innerText = totalCount;

    const kpiEff = document.getElementById('kpi-eff');
    if (kpiEff && data.length > 0) {
        let onTime = 0;
        data.forEach(t => {
            if (t.completedAt && t.dueDate && t.completedAt.split('T')[0] <= t.dueDate) {
                onTime++;
            }
        });
        const eff = Math.round((onTime / data.length) * 100);
        kpiEff.innerText = `${eff}%`;
    } else if (kpiEff) {
        kpiEff.innerText = "0%";
    }
}

function renderPaginationControls(container) {
    container.innerHTML = '';
    if (AUDIT_DATA_STATE.total <= AUDIT_DATA_STATE.itemsPerPage) return;

    const totalPages = Math.ceil(AUDIT_DATA_STATE.total / AUDIT_DATA_STATE.itemsPerPage);
    const currentPage = AUDIT_DATA_STATE.currentPage;
    
    let html = `<div style="display:flex; gap:10px;">`;
    html += `<button class="btn-secondary" ${currentPage === 1 ? 'disabled' : ''} onclick="renderAuditData(${currentPage - 1})">Anterior</button>`;
    html += `<span style="padding:10px; color:var(--text-muted);">Página ${currentPage} de ${totalPages}</span>`;
    html += `<button class="btn-secondary" ${currentPage >= totalPages ? 'disabled' : ''} onclick="renderAuditData(${currentPage + 1})">Próxima</button>`;
    html += `</div>`;
    
    container.innerHTML = html;
}

// Exportar com Search
async function exportAuditCSV() {
    const { userId, compId, dateStart, dateEnd, searchText } = AUDIT_DATA_STATE.currentFilters;
    let url = `/audit-tasks?skip=0&limit=1000`;
    if (userId) url += `&user_id=${userId}`;
    if (compId) url += `&company_id=${compId}`;
    if (dateStart) url += `&date_start=${dateStart}`;
    if (dateEnd) url += `&date_end=${dateEnd}`;
    if (searchText) url += `&search=${encodeURIComponent(searchText)}`;

    const res = await fetchAPI(url, 'GET');
    if (!res || !res.data) return showToast("Erro ao exportar", "error");

    const data = res.data;
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Tarefa,Empresa,Responsavel,Status,Prioridade,Data Conclusao,Checklist\n";

    data.forEach(t => {
        const sub = t.subtasks ? t.subtasks.map(s => `[${s.done?'X':' '}] ${s.text}`).join(' | ') : '';
        const safeDesc = t.desc.replace(/"/g, '""'); 
        const safeComp = (t.companyName || '').replace(/"/g, '""');
        
        const row = [
            t.id,
            `"${safeDesc}"`,
            `"${safeComp}"`,
            `"${t.userName || ''}"`,
            t.status,
            t.prio,
            t.completedAt,
            `"${sub}"`
        ].join(",");
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_taskflow_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function initializeAuditModule() {
    setupAuditFilters();
    renderAuditData(1);
}