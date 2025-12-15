// Arquivo: frontend/js/calendar.js
let calendar = null;

function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'pt-br',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        buttonText: {
            today: 'Hoje',
            month: 'Mês',
            week: 'Semana',
            list: 'Lista'
        },
        height: '100%',
        events: getCalendarEvents(),
        eventClick: function(info) {
            openDetails(info.event.id);
        },
        eventDidMount: function(info) {
             // Tooltip simple
             info.el.title = info.event.title;
        }
    });
    calendar.render();
}

function getCalendarEvents() {
    if (!TASKS) return [];

    return TASKS.filter(t => t.status !== 'archived').map(t => {
        let color = '#3b82f6'; // Default primary
        if (t.status === 'done') color = '#10b981'; // Green
        else if (t.prio === 'Alta') color = '#ef4444'; // Red
        else if (t.prio === 'Baixa') color = '#64748b'; // Gray

        // Se estiver atrasada e não concluída
        if (t.status !== 'done' && t.dueDate < new Date().toISOString().split('T')[0]) {
             color = '#b91c1c'; // Dark Red
        }

        return {
            id: t.id,
            title: t.desc,
            start: t.dueDate,
            color: color,
            allDay: true
            // extendedProps: { ...t }
        };
    });
}

function renderCalendar() {
    // Chamado quando os dados mudam ou quando entra na aba
    if (calendar) {
        calendar.removeAllEvents();
        calendar.addEventSource(getCalendarEvents());
    } else {
        // Se ainda não inicializou (primeira vez na aba)
        initializeCalendar();
    }
}
