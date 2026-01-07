console.log(">>> MOBILE CONTROLLER v1.0 LOADED <<<");

// --- STATE ---
let CURRENT_TAB = 'todo'; // 'todo', 'doing', 'done'

// --- INIT ---
async function loadInitialData() {
    // Reusing existing auth.js UI logic if possible, but targeting mobile elements
    // The "login-list" ID is shared, so renderLoginList() from auth.js should work if elements exist.

    document.getElementById('loading-txt').style.display = 'block';
    const users = await fetchAPI('/users');
    if (users) {
        USERS = users;
        // We need to slightly adapt renderLoginList because the class names might differ,
        // but let's see if we can reuse the logic from auth.js by just ensuring the container exists.
        renderLoginList();
    }
    document.getElementById('loading-txt').style.display = 'none';

    // Auto-login check
    const savedId = localStorage.getItem('taskflow_user_id');
    if (savedId && users && users.find(u => u.id == savedId)) {
        initLogin(parseInt(savedId));
    }
}

// Override or Adapt loadAppData for mobile
async function loadAppData() {
    const [u, c, t] = await Promise.all([fetchAPI('/users'), fetchAPI('/companies'), fetchAPI('/tasks')]);
    if (u) USERS = u; if (c) COMPANIES = c; if (t) TASKS = t;

    // Load Chat history initially if needed, or wait for switchView
    // For mobile, we load everything to be snappy
    renderAllMobile();
}

function renderAllMobile() {
    renderMobileDashboard();
    renderMobileBoard(); // Renders the current tab
    // Chat is loaded on demand or via socket
}

function switchView(viewName) {
    // Hide all views
    document.querySelectorAll('.mobile-view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');

    // Update Nav
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));
    const navBtn = document.getElementById(`nav-${viewName}`);
    if(navBtn) navBtn.classList.add('active');

    // Header Title Update
    const titles = {
        'dash': 'Dashboard',
        'tasks': 'Minhas Tarefas',
        'chat': 'Chat Interno',
        'settings': 'Configurações'
    };
    document.getElementById('page-title').innerText = titles[viewName] || 'TaskFlow';

    // Logic hooks
    if (viewName === 'chat') initMobileChat();
    if (viewName === 'dash') renderMobileDashboard();
    if (viewName === 'tasks') renderMobileBoard();
}

// --- WEBSOCKET ---
let socket = null;
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${protocol}://${window.location.host}/ws`;

    socket = new WebSocket(wsUrl);

    socket.onopen = () => console.log("🟢 Mobile WS Conectado");

    socket.onmessage = (event) => {
        if (event.data === "update") {
            if (currentUser) loadAppData();
        } else if (event.data.startsWith("chat:")) {
             const payload = JSON.parse(event.data.substring(5));
             handleChatNotification(payload); // We need to implement this for mobile
        }
    };

    socket.onclose = () => setTimeout(connectWebSocket, 3000);
}

// Start
loadInitialData();
connectWebSocket();
