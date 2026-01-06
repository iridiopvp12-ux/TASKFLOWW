// Arquivo: frontend/js/notifications.js

let NOTIFICATIONS = [];
let PREFS = { desktop: false, sound: false };

function loadNotificationPrefs() {
    const s = localStorage.getItem('tf_notif_prefs');
    if (s) {
        PREFS = JSON.parse(s);
    }
    // Update UI if we are on settings page
    const chkDesktop = document.getElementById('cfg-desktop-notif');
    const chkSound = document.getElementById('cfg-sound-notif');
    if (chkDesktop && chkSound) {
        chkDesktop.checked = PREFS.desktop;
        chkSound.checked = PREFS.sound;
    }
}

function saveNotificationPrefs() {
    const chkDesktop = document.getElementById('cfg-desktop-notif');
    const chkSound = document.getElementById('cfg-sound-notif');
    if (!chkDesktop || !chkSound) return;

    PREFS.desktop = chkDesktop.checked;
    PREFS.sound = chkSound.checked;
    localStorage.setItem('tf_notif_prefs', JSON.stringify(PREFS));

    if (PREFS.desktop) {
        Notification.requestPermission();
    }
}

function playNotificationSound() {
    if (!PREFS.sound) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 500;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
    } catch(e) { console.error("Audio error", e); }
}

function triggerDesktopNotification(title, body) {
    if (!PREFS.desktop) return;
    if (Notification.permission === 'granted') {
        new Notification(title, { body: body });
    }
}

async function loadNotifications() {
    if (!currentUser) return;
    const res = await fetchAPI(`/notifications?user_id=${currentUser.id}`);
    if (res) {
        NOTIFICATIONS = res;
        updateNotificationBadge();
        renderNotifications();
    }
}

function updateNotificationBadge() {
    const badge = document.getElementById('notif-badge');
    const unread = NOTIFICATIONS.filter(n => !n.isRead).length;

    if (unread > 0) {
        badge.style.display = 'flex';
        badge.innerText = unread > 9 ? '9+' : unread;
    } else {
        badge.style.display = 'none';
    }
}

function toggleNotifPanel() {
    const panel = document.getElementById('notif-panel');
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        loadNotifications(); // Refresh on open
    } else {
        panel.style.display = 'none';
    }
}

function renderNotifications() {
    const list = document.getElementById('notif-list');
    list.innerHTML = '';

    if (NOTIFICATIONS.length === 0) {
        list.innerHTML = '<div style="color:#64748b; font-size:0.8rem; text-align:center;">Nada por aqui.</div>';
        return;
    }

    NOTIFICATIONS.forEach(n => {
        const bg = n.isRead ? '' : 'background:rgba(59,130,246,0.1);';
        const date = new Date(n.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        list.insertAdjacentHTML('beforeend', `
            <div style="padding:8px; border-radius:4px; font-size:0.85rem; cursor:pointer; ${bg} border-bottom:1px solid var(--border);" onclick="clickNotification(${n.id}, ${n.taskId})">
                <div style="color:white; margin-bottom:2px;">${n.text}</div>
                <div style="color:var(--text-muted); font-size:0.7rem;">${date}</div>
            </div>
        `);
    });
}

async function clickNotification(notifId, taskId) {
    // Mark as read
    await fetchAPI(`/notifications/${notifId}/read`, 'PUT');

    // Update local state
    const n = NOTIFICATIONS.find(x => x.id === notifId);
    if (n) n.isRead = true;
    updateNotificationBadge();
    renderNotifications();

    // Open task
    if (taskId) {
        openDetails(taskId);
        toggleNotifPanel(); // Close panel
    }
}

// Close panel when clicking outside
document.addEventListener('click', (e) => {
    const panel = document.getElementById('notif-panel');
    const bell = document.getElementById('notif-badge').parentElement;
    if (panel.style.display === 'block' && !panel.contains(e.target) && !bell.contains(e.target)) {
        panel.style.display = 'none';
    }
});
