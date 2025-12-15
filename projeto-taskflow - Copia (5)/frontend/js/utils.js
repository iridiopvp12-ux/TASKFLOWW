function getPrioClass(p) { return p==='Alta'?'high':p==='Média'?'med':'low'; }

// ✅ FUNÇÃO ATUALIZADA: Agora inclui a hora, minuto e segundo na formatação
function formatDate(d) { 
    if (!d) return '-';

    try {
        const dateObj = new Date(d);
        if (isNaN(dateObj)) return '-'; 

        // Formatação da Data (DD/MM/AAAA)
        const datePart = dateObj.toLocaleDateString('pt-BR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });

        // Verifica se o timestamp tem parte de hora (necessário para auditoria)
        if (d.includes('T')) {
            // Formatação da Hora (HH:MM)
            const timePart = dateObj.toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit'
            });
            return `${datePart} ${timePart}`;
        }
        
        // Retorna só a data se não houver hora completa (para dueDate)
        return datePart;

    } catch (e) {
        console.error("Erro ao formatar data:", e);
        return d.split('T')[0].split('-').reverse().join('/'); // Fallback
    }
}

// Drag & Drop Handlers
function allowDrop(ev) { 
    ev.preventDefault(); 
    ev.currentTarget.classList.add('drag-over'); 
}
function drag(ev) { 
    ev.dataTransfer.setData("text", ev.target.id); 
}
document.addEventListener('dragleave', e => { 
    if(e.target.classList.contains('task-list')) e.target.classList.remove('drag-over') 
});

// Ação de navegação para o Dashboard
function goToKanban(status) {
    switchView('board');
    const colId = status === 'todo' ? 'col-todo' : status === 'doing' ? 'col-doing' : 'col-done';
    const col = document.getElementById(colId);
    if(col) {
        col.style.borderColor = 'var(--primary)';
        setTimeout(() => col.style.borderColor = 'var(--border)', 1000);
    }
}