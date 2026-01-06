// ===========================================
// 🚨 CONFIGURAÇÃO DE REDE
// ===========================================
// Mantenha o IP/Porta do seu servidor Python (Backend) aqui!
const API_URL = "http://192.168.2.139:8000"; 

// ESTADO GLOBAL DA APLICAÇÃO
let USERS = [];
let COMPANIES = [];
let TASKS = [];
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