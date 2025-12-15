// Arquivo: frontend/js/companies.js

// NOTA: 'STANDARD_TASKS' e 'temporarySubtasks' já existem no config.js. 
// Não declaramos novamente para evitar erro de SyntaxError.

let packageQueue = []; // Esta é exclusiva deste arquivo, então mantemos.

// --- RENDERIZAÇÃO E CRUD DE EMPRESAS ---

function renderCompanies() {
    const list = document.getElementById('company-list'); 
    if(!list) return; // Segurança contra erro se a tela não carregou
    
    list.className = 'company-grid'; 
    list.innerHTML = '';
    
    const term = document.getElementById('company-search-input').value.toLowerCase();
    // Proteção: garante que COMPANIES seja um array
    let filtered = Array.isArray(COMPANIES) ? COMPANIES : [];
    
    if (term) filtered = filtered.filter(c => c.name.toLowerCase().includes(term));

    if (filtered.length === 0) {
        list.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:40px;">Nenhuma empresa encontrada.</div>`;
        return;
    }

    filtered.forEach(c => { 
        const u = USERS.find(x => x.id == c.defaultAssignee);
        const initial = c.name ? c.name.charAt(0).toUpperCase() : '?';
        // Proteção: Se templates for null, conta como 0
        const tplCount = (c.templates && Array.isArray(c.templates)) ? c.templates.length : 0;
        
        const html = `
        <div class="company-card">
            <div class="comp-header">
                <div class="comp-avatar">${initial}</div>
                <div class="comp-info">
                    <h4>${c.name}</h4>
                    <p>${u ? 'Resp: ' + u.name : 'Sem responsável'}</p>
                </div>
            </div>
            
            <div class="comp-stats">
                <span>Modelos</span>
                <strong style="color:white;">${tplCount}</strong>
            </div>

            <div class="comp-actions">
                <button class="btn-icon-action" onclick="openCompanyModal(${c.id})">✏️ Editar</button>
                <button class="btn-icon-action" onclick="openTemplateManager(${c.id})">⚙️ Modelos</button>
                <button class="btn-icon-action delete" onclick="deleteCompany(${c.id})">🗑️</button>
            </div>
        </div>`;
        
        list.insertAdjacentHTML('beforeend', html);
    });
}

// MODAL DE EMPRESA "SUPER" (GERADOR DE PACOTES + VISUALIZADOR)
async function openCompanyModal(id = null) {
    currentEditingCompanyId = id;
    
    // Reseta estados
    packageQueue = [];
    temporarySubtasks = []; // Limpa a variável global
    renderTempSubtasks();
    renderPackageQueue();
    clearStagingArea(); 

    // --- CARREGA PADRÕES DO BANCO (BACKEND) ---
    const stdSelect = document.getElementById('comp-standard-task');
    if (stdSelect) {
        stdSelect.innerHTML = '<option value="">-- Manual (Em branco) --</option>';
        try {
            const resStandards = await fetchAPI('/standards');
            if(resStandards && Array.isArray(resStandards)) {
                STANDARD_TASKS = resStandards; // Atualiza a variável global
                STANDARD_TASKS.forEach((t, i) => {
                    stdSelect.innerHTML += `<option value="${i}">⚡ ${t.title}</option>`;
                });
            }
        } catch (e) { console.error("Erro ao carregar padrões:", e); }
    }

    const existingSection = document.getElementById('section-existing-tasks');

    if (id) {
        // MODO EDIÇÃO
        const c = COMPANIES.find(x => x.id == id);
        if (c) {
            document.getElementById('comp-name').value = c.name;
            document.getElementById('comp-default-assignee').value = c.defaultAssignee || "";
            if (existingSection) {
                existingSection.style.display = 'block';
                renderExistingCompanyTasks(id);
            }
        }
    } else {
        // MODO CRIAÇÃO
        document.getElementById('comp-name').value = '';
        document.getElementById('comp-default-assignee').value = '';
        if (existingSection) existingSection.style.display = 'none';
    }

    const m = document.getElementById('modal-company'); 
    m.style.display='flex'; 
    setTimeout(() => m.classList.add('open'), 10); 
}

function renderExistingCompanyTasks(companyId) {
    const container = document.getElementById('existing-tasks-list');
    if (!container) return;
    container.innerHTML = '';

    const companyTasks = TASKS.filter(t => t.companyId == companyId && t.status !== 'archived');

    if (companyTasks.length === 0) {
        container.innerHTML = `<div style="padding:15px; color:var(--text-muted); text-align:center;">Nenhuma tarefa ativa encontrada.</div>`;
        return;
    }

    companyTasks.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

    companyTasks.forEach(t => {
        let statusColor = '#94a3b8'; 
        let statusText = 'Pendente';
        if (t.status === 'doing') { statusColor = 'var(--prio-med)'; statusText = 'Andamento'; }
        if (t.status === 'done') { statusColor = 'var(--prio-low)'; statusText = 'Concluído'; }

        const subCount = (t.subtasks && Array.isArray(t.subtasks)) ? t.subtasks.length : 0;
        const subDone = (t.subtasks && Array.isArray(t.subtasks)) ? t.subtasks.filter(s => s.done).length : 0;

        container.insertAdjacentHTML('beforeend', `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px; border-bottom:1px solid var(--border); background: var(--bg-card);">
                <div style="display:flex; align-items:center; gap: 10px;">
                    <div style="width:10px; height:10px; border-radius:50%; background:${statusColor};" title="${statusText}"></div>
                    <div>
                        <div style="font-weight:600; color:var(--text-primary);">${t.desc}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted);">
                            Vence: ${formatDateBr(t.dueDate)} | ${subDone}/${subCount} check
                        </div>
                    </div>
                </div>
                <div>
                     <button class="btn-secondary" style="font-size:0.7rem; padding: 4px 8px;" onclick="closeModal('modal-company'); openDetails(${t.id})">Abrir</button>
                </div>
            </div>
        `);
    });
}

function clearStagingArea() {
    document.getElementById('comp-standard-task').value = "";
    document.getElementById('comp-task-desc').value = '';
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('comp-task-date').value = today;
    document.getElementById('comp-task-recurrence').value = 'monthly';
    temporarySubtasks = [];
    renderTempSubtasks();
}

function fillStandardTask() {
    const idx = document.getElementById('comp-standard-task').value;
    if(idx === "") return; 

    const tpl = STANDARD_TASKS[idx];
    if (tpl) {
        document.getElementById('comp-task-desc').value = tpl.title;
        document.getElementById('comp-task-recurrence').value = tpl.recurrence;
        // Copia segura das subtarefas
        temporarySubtasks = (tpl.subtasks && Array.isArray(tpl.subtasks)) ? [...tpl.subtasks] : []; 
        renderTempSubtasks();
    }
}

function addTempSubtask() {
    const input = document.getElementById('comp-new-subtask-input');
    const val = input.value;
    if(val) {
        temporarySubtasks.push(val);
        input.value = '';
        renderTempSubtasks();
    }
}

function renderTempSubtasks() {
    const list = document.getElementById('comp-temp-subtasks-list');
    if (!list) return;
    list.innerHTML = '';
    temporarySubtasks.forEach((s, idx) => {
        list.insertAdjacentHTML('beforeend', `
            <div class="temp-subtask-item">
                <span>${s}</span> 
                <button style="background:none; border:none; color:var(--danger); cursor:pointer;" onclick="removeTempSubtask(${idx})">×</button>
            </div>
        `);
    });
}

function removeTempSubtask(idx) {
    temporarySubtasks.splice(idx, 1);
    renderTempSubtasks();
}

function addTaskToPackage() {
    const desc = document.getElementById('comp-task-desc').value;
    const date = document.getElementById('comp-task-date').value;
    const rec = document.getElementById('comp-task-recurrence').value;

    if (!desc) return showToast("Dê um título para a tarefa.", "error");
    if (!date) return showToast("Defina uma data de início.", "error");

    const taskObj = {
        desc: desc,
        date: date,
        recurrence: rec,
        subtasks: [...temporarySubtasks]
    };

    packageQueue.push(taskObj);
    clearStagingArea();
    renderPackageQueue();
}

function renderPackageQueue() {
    const container = document.getElementById('package-list-render');
    const countLabel = document.getElementById('pkg-count');
    
    if (countLabel) countLabel.innerText = `${packageQueue.length} tarefas`;
    if (!container) return;
    
    container.innerHTML = '';

    if (packageQueue.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">Pacote vazio. Adicione tarefas acima.</div>`;
        return;
    }

    packageQueue.forEach((t, index) => {
        container.insertAdjacentHTML('beforeend', `
            <div style="background: var(--bg-card); padding: 8px 12px; border-bottom: 1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:600; font-size: 0.9rem;">${t.desc}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted);">
                        📅 ${formatDateBr(t.date)} | 🔄 ${translateRecurrence(t.recurrence)} | ✅ ${t.subtasks.length} itens
                    </div>
                </div>
                <button class="btn-danger-outline" style="padding: 2px 8px;" onclick="removeFromPackage(${index})">🗑️</button>
            </div>
        `);
    });
}

function removeFromPackage(index) {
    packageQueue.splice(index, 1);
    renderPackageQueue();
}

async function saveCompany() { 
    const name = document.getElementById('comp-name').value; 
    const def = document.getElementById('comp-default-assignee').value; 
    
    if(!name) return showToast("Nome da empresa obrigatório", "error");
    
    let companyId = null;

    // 1. Criar ou Atualizar Empresa
    if (currentEditingCompanyId) {
        const oldComp = COMPANIES.find(c => c.id == currentEditingCompanyId);
        await fetchAPI(`/companies/${currentEditingCompanyId}`, 'PUT', { 
            name, 
            defaultAssignee: def ? parseInt(def) : null,
            templates: oldComp ? (oldComp.templates || []) : [] 
        });
        companyId = currentEditingCompanyId;
    } else {
        const resComp = await fetchAPI('/companies', 'POST', { 
            name, 
            defaultAssignee: def ? parseInt(def) : null,
            templates: [] 
        });
        
        if (resComp && resComp.id) {
            companyId = resComp.id;
        } else {
            return showToast("Erro ao criar empresa.", "error");
        }
    }

    // 2. Processar Fila de Tarefas
    if (packageQueue.length > 0) {
        let successCount = 0;
        const assigneeId = def ? parseInt(def) : (currentUser ? currentUser.id : null);
        const finalAssignee = isNaN(assigneeId) ? null : assigneeId;

        for (const task of packageQueue) {
            let recurrenceDay = null;
            if (task.recurrence === 'monthly') {
                recurrenceDay = parseInt(task.date.split('-')[2]); 
            } else if (task.recurrence === 'weekly') {
                const d = new Date(task.date + 'T00:00:00'); 
                recurrenceDay = d.getDay();
            }

            const finalSubtasks = task.subtasks.map(s => ({ text: s, done: false }));

            await fetchAPI('/tasks', 'POST', {
                desc: task.desc, 
                dueDate: task.date, 
                assignedTo: finalAssignee, 
                prio: 'Média',
                companyId: String(companyId), 
                subtasks: finalSubtasks, 
                status: "todo", 
                completedAt: null,
                recurrence: task.recurrence, 
                recurrenceDay: recurrenceDay
            });
            successCount++;
        }
        showToast(`Empresa salva e ${successCount} tarefas geradas!`, "success");
    } else {
        showToast("Empresa salva com sucesso.", "success");
    }

    closeModal('modal-company'); 
    await loadAppData(); 
}

async function deleteCompany(id) { 
    if(confirm("Excluir empresa?")) { 
        await fetchAPI(`/companies/${id}`, 'DELETE'); 
        await loadAppData(); 
    } 
}

function translateRecurrence(r) {
    const map = { 'none': 'Única', 'daily': 'Diário', 'weekly': 'Semanal', 'monthly': 'Mensal', 'fortnightly': 'Quinzenal' };
    return map[r] || r;
}

function formatDateBr(dateStr) {
    if(!dateStr) return "-";
    const [y,m,d] = dateStr.split('-');
    return `${d}/${m}`;
}

// --- FUNÇÕES DE PADRÕES (SALVAR NO BANCO) ---

async function openStdTaskManager() {
    const res = await fetchAPI('/standards'); // Busca do Banco
    if(res) {
        STANDARD_TASKS = res; // Atualiza variável global
        renderStdTaskList();
        const m = document.getElementById('modal-std-tasks');
        m.style.display = 'flex'; 
        setTimeout(() => m.classList.add('open'), 10);
    }
}

function renderStdTaskList() {
    const container = document.getElementById('std-task-list-container');
    if (!container) return;
    container.innerHTML = '';
    
    if(STANDARD_TASKS.length === 0) {
        container.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:20px;">Nenhum padrão salvo.</div>';
        return;
    }

    STANDARD_TASKS.forEach((item) => {
        container.insertAdjacentHTML('beforeend', `
            <div style="background:var(--bg-body); padding:12px; border:1px solid var(--border); border-radius:6px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:bold; color:white;">${item.title}</div>
                    <div style="font-size:0.8rem; color:var(--text-muted);">Freq: ${translateRecurrence(item.recurrence)} | ${item.subtasks ? item.subtasks.length : 0} etapas</div>
                </div>
                <button class="btn-danger-outline" onclick="deleteStdTask(${item.id})">Remover</button>
            </div>
        `);
    });
}

// FUNÇÃO CRÍTICA: SALVAR NO BANCO
async function saveStdTask() {
    const title = document.getElementById('std-title').value;
    const rec = document.getElementById('std-rec').value;
    const subsText = document.getElementById('std-subs-text').value;

    if(!title) return showToast("Título obrigatório", "error");
    
    const subs = subsText.split(/[\n,]/).map(s => s.trim()).filter(s => s !== "");

    // Envia para a rota /standards do Backend
    const payload = { title, recurrence: rec, subtasks: subs };
    const res = await fetchAPI('/standards', 'POST', payload);

    if(res) {
        // Recarrega a lista para pegar o ID correto
        const newList = await fetchAPI('/standards');
        if(newList) STANDARD_TASKS = newList;
        
        document.getElementById('std-title').value = '';
        document.getElementById('std-rec').value = 'none';
        document.getElementById('std-subs-text').value = '';
        
        renderStdTaskList();
        showToast("Padrão salvo permanentemente!", "success");
    }
}

async function deleteStdTask(id) {
    if(confirm("Remover este padrão do banco de dados?")) {
        await fetchAPI(`/standards/${id}`, 'DELETE');
        STANDARD_TASKS = STANDARD_TASKS.filter(t => t.id !== id);
        renderStdTaskList();
    }
}

// --- GESTÃO DE TEMPLATES POR EMPRESA (LEGADO) ---
function openTemplateManager(id) { 
    currentEditingCompanyId = id; 
    const c = COMPANIES.find(x => x.id == id); 
    document.getElementById('template-modal-title').innerText = `Modelos: ${c.name}`; 
    renderTemplateList(c); 
    currentEditingTemplateIndex = -1;
    document.getElementById('tpl-name').value = ''; 
    document.getElementById('tpl-subtasks-container').innerHTML = ''; 
    addSubtaskToTemplateInput(); 
    const m = document.getElementById('modal-templates'); m.style.display = 'flex'; setTimeout(() => m.classList.add('open'), 10); 
}

function renderTemplateList(c) { 
    const con = document.getElementById('template-list-container'); con.innerHTML = ''; 
    if(c.templates && Array.isArray(c.templates)) {
        c.templates.forEach((t, idx) => { 
            con.insertAdjacentHTML('beforeend', `
            <div style="background:var(--bg-body); padding:10px; border:1px solid var(--border); margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <div style="cursor:pointer;" onclick="editTemplate(${idx})">
                    <strong>${t.name}</strong><br><small>${t.subtasks.length} etapas (Clique para editar)</small>
                </div>
                <button class="btn-danger-outline" onclick="deleteTemplate(${idx})">🗑️</button>
            </div>`); 
        }); 
    }
}

function editTemplate(idx) {
    currentEditingTemplateIndex = idx;
    const c = COMPANIES.find(x => x.id == currentEditingCompanyId);
    const t = c.templates[idx];
    document.getElementById('tpl-name').value = t.name;
    const container = document.getElementById('tpl-subtasks-container');
    container.innerHTML = '';
    t.subtasks.forEach(sub => {
        const id = Date.now() + Math.random();
        container.insertAdjacentHTML('beforeend', `<div class="subtask-row" id="row-${id}"><input type="text" class="form-input tpl-sub-input" value="${sub}"><button class="btn-danger-outline" onclick="document.getElementById('row-${id}').remove()">x</button></div>`);
    });
}

function addSubtaskToTemplateInput() { 
    const id = Date.now(); 
    document.getElementById('tpl-subtasks-container').insertAdjacentHTML('beforeend', `<div class="subtask-row" id="row-${id}"><input type="text" class="form-input tpl-sub-input" placeholder="Etapa..."><button class="btn-danger-outline" onclick="document.getElementById('row-${id}').remove()">x</button></div>`); 
}

async function saveTemplate() { 
    const name = document.getElementById('tpl-name').value; 
    const subs = Array.from(document.querySelectorAll('.tpl-sub-input')).map(i => i.value).filter(v => v); 
    if(!name || subs.length===0) return; 
    const c = COMPANIES.find(x => x.id == currentEditingCompanyId); 
    if(!c.templates) c.templates = [];
    if (currentEditingTemplateIndex >= 0) c.templates[currentEditingTemplateIndex] = { name, subtasks: subs };
    else c.templates.push({ name, subtasks: subs }); 
    await fetchAPI(`/companies/${c.id}/templates`, 'PUT', { templates: c.templates }); 
    renderTemplateList(c); 
    currentEditingTemplateIndex = -1;
    document.getElementById('tpl-name').value = ''; 
    document.getElementById('tpl-subtasks-container').innerHTML = ''; 
    addSubtaskToTemplateInput(); 
}

async function deleteTemplate(idx) { 
    if(confirm("Excluir modelo?")) { 
        const c = COMPANIES.find(x => x.id == currentEditingCompanyId); 
        c.templates.splice(idx, 1); 
        await fetchAPI(`/companies/${c.id}/templates`, 'PUT', { templates: c.templates }); 
        renderTemplateList(c); 
    } 
}