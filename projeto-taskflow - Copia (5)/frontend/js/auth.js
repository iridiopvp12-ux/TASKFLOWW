// --- LOGIN ---
function renderLoginList() {
    const list = document.getElementById('login-list');
    list.innerHTML = '';
    USERS.forEach(u => {
        const badge = u.role === 'admin' ? 'role-admin' : 'role-user';
        const html = `
            <div class="user-select-btn" onclick="initLogin(${u.id})">
                <div class="avatar" style="background:${u.color}">${u.initials}</div>
                <div><div style="font-weight:600;">${u.name}</div><div style="font-size:0.8rem; color:#94a3b8;">${u.roleDesc}</div></div>
                <span class="role-badge ${badge}">${u.role === 'admin' ? 'Admin' : 'Equipe'}</span>
            </div>`;
        list.insertAdjacentHTML('beforeend', html);
    });
}

function initLogin(id) {
    pendingLoginUserId = id;
    const u = USERS.find(x => x.id === id);
    document.getElementById('login-user-name').innerText = `Olá, ${u.name.split(' ')[0]}`;
    document.getElementById('login-input-pass').value = '';
    const modal = document.getElementById('modal-login-pass');
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('open'), 10);
    setTimeout(() => document.getElementById('login-input-pass').focus(), 100);
}

async function performLogin() {
    const pwd = document.getElementById('login-input-pass').value;
    const res = await fetchAPI('/login', 'POST', { id: pendingLoginUserId, password: pwd });
    if (res && res.success) {
        currentUser = res.user;
        closeModal('modal-login-pass');
        document.getElementById('login-screen').style.display = 'none';
        document.getElementById('app-container').classList.add('active');
        document.getElementById('current-name').innerText = currentUser.name;
        document.getElementById('current-role').innerText = currentUser.roleDesc;
        const av = document.getElementById('current-avatar');
        av.innerText = currentUser.initials;
        av.style.backgroundColor = currentUser.color;
        if (currentUser.role !== 'admin') {
            ['nav-settings', 'nav-company', 'btn-delete-task'].forEach(id => {
                const el = document.getElementById(id); if(el) el.style.display = 'none';
            });
        }
        await loadAppData(); 
        showToast(`Bem-vindo, ${currentUser.name}!`, 'success');
    } else {
        showToast("Senha incorreta", "error");
    }
}

function logout() { location.reload(); }


// --- GESTÃO DE USUÁRIOS ---
function renderSettings() { 
    const list = document.getElementById('user-list-settings'); 
    list.innerHTML = ''; 
    USERS.forEach(u => { 
        list.insertAdjacentHTML('beforeend', `<div class="data-item"><div class="data-info"><h4 style="color:${u.color}">${u.name}</h4><p>${u.roleDesc} (${u.role === 'admin' ? 'Admin' : 'Equipe'})</p></div><button class="btn-danger-outline" onclick="deleteUser(${u.id})">Remover</button></div>`); 
    }); 
}

async function saveUser() { 
    const name = document.getElementById('user-name').value; 
    const pass = document.getElementById('user-pass-new').value; 
    if(!name || !pass) return showToast("Falta nome ou senha", "error"); 
    
    const colors = ['#f472b6', '#22d3ee', '#a78bfa', '#34d399', '#fbbf24']; 
    
    const newUser = { 
        name, 
        role: document.getElementById('user-perm').value, 
        roleDesc: document.getElementById('user-role-desc').value, 
        initials: document.getElementById('user-initials').value.toUpperCase(), 
        color: colors[Math.floor(Math.random()*colors.length)], 
        password: pass 
    }; 
    
    const res = await fetchAPI('/users', 'POST', newUser); 
    if(res) { 
        await loadAppData(); 
        closeModal('modal-user'); 
        showToast("Usuário criado!", "success"); 
    } 
}

async function deleteUser(id) { 
    if(confirm("Remover usuário?")) { 
        await fetchAPI(`/users/${id}`, 'DELETE'); 
        await loadAppData(); 
    } 
}