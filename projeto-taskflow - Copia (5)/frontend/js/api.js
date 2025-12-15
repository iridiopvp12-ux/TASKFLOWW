// --- FETCH UTILS ---
async function fetchAPI(endpoint, method="GET", body=null) {
    try {
        const options = { 
            method, 
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store' 
        };
        if (body) options.body = JSON.stringify(body);
        
        const res = await fetch(`${API_URL}${endpoint}`, options);
        if (!res.ok) throw new Error("Erro na API");
        return await res.json();
    } catch (error) {
        console.error(error);
        if(method !== 'GET') showToast("Erro de conexão", "error");
        return null;
    }
}

// --- UI HELPERS ---
function showToast(msg, type='normal') { 
    const t=document.createElement('div'); 
    t.className=`toast ${type}`; 
    t.innerHTML=`<span>${type==='success'?'✅':'ℹ️'}</span> ${msg}`; 
    document.getElementById('toast-container').appendChild(t); 
    setTimeout(() => { 
        t.style.opacity='0'; 
        setTimeout(()=>t.remove(),300); 
    }, 3000); 
}

function closeModal(id) { 
    const el=document.getElementById(id); 
    el.classList.remove('open'); 
    setTimeout(()=>el.style.display='none',300); 
}

function openUserModal(){ 
    const m=document.getElementById('modal-user'); 
    m.style.display='flex'; 
    setTimeout(()=>m.classList.add('open'),10); 
}