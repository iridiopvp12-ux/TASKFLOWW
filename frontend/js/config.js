// ===========================================
// 🚨 CONFIGURAÇÃO DE REDE
// ===========================================
// Detecta automaticamente o endereço do servidor baseado na URL atual
const protocol = window.location.protocol;
const host = window.location.hostname;
const portStr = window.location.port ? ":" + window.location.port : "";
const API_URL = `${protocol}//${host}${portStr}`;

// ESTADO GLOBAL DA APLICAÇÃO
let USERS = [];
let COMPANIES = [];
let TASKS = [];
let SECTORS = [];
let currentUser = null;

let pendingLoginUserId = null;
let currentOpenTaskId = null;
let currentEditingCompanyId = null;
let currentEditingTemplateIndex = -1;
let temporarySubtasks = [];

// LISTA DE TAREFAS PADRÃO (SIMULAÇÃO) - Gerenciada no modal de Padrões
let STANDARD_TASKS = [
    { title: "Fechamento Mensal", rec: "monthly", subs: ["Solicitar Extratos", "Conferir Notas", "Gerar Impostos"] }
];
