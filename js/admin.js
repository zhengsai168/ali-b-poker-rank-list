// ==================== 配置 ====================
const CONFIG = {
    owner: 'zhengsai168',
    repo: 'ali-b-poker-rank-list',
    dataPath: 'data/games.json',
    branch: 'main'
};

// 管理员凭证 fallback（SHA-256 哈希，优先从 data/admin-creds.json 加载）
const ADMIN_CREDS = {
    usernameHash: '8530f9755701ea1fd1ae510aa71ecd3d4a18e9996d0e4877d3e92965fb64c955',
    passwordHash: 'a12418eb9cc4a8ab4baec705515fe4b2f49e8479e930a614fac09acf84a543d6'
};

// ==================== 哈希工具 ====================
async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==================== 登录逻辑 ====================
let isAuthenticated = false;
let gameData = { players: [], games: [] };

async function initAdmin() {
    // 检查 session
    const session = sessionStorage.getItem('poker_admin');
    // 设置今天日期
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('gameDate').value = today;

    // 检查已保存的 token
    const token = localStorage.getItem('poker_gh_token');
    if (token) {
        document.getElementById('ghToken').value = token;
        document.getElementById('tokenStatus').style.display = 'inline';
        document.getElementById('tokenStatus').textContent = '已保存';
    }

    // 登录表单事件
    document.getElementById('loginForm').addEventListener('submit', handleLogin);

    // 检查 session（已登录状态恢复）
    if (session === 'true') {
        isAuthenticated = true;
        await showAdminPanel();
    }

    // 添加默认玩家行
    addPlayerRow();
    addPlayerRow();
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    const usernameHash = await sha256(username);
    const passwordHash = await sha256(password);

    // 从配置文件加载凭证
    let creds;
    try {
        const resp = await fetch('data/admin-creds.json?t=' + Date.now());
        creds = await resp.json();
    } catch (e) {
        // fallback 默认凭证
        creds = ADMIN_CREDS;
    }

    if (usernameHash === creds.usernameHash && passwordHash === creds.passwordHash) {
        isAuthenticated = true;
        sessionStorage.setItem('poker_admin', 'true');
        showAdminPanel();
    } else {
        const errEl = document.getElementById('loginError');
        errEl.style.display = 'block';
        setTimeout(() => errEl.style.display = 'none', 3000);
    }
}

function logout() {
    isAuthenticated = false;
    sessionStorage.removeItem('poker_admin');
    document.getElementById('adminPanel').classList.remove('active');
    document.getElementById('loginBox').style.display = 'block';
}

async function showAdminPanel() {
    document.getElementById('loginBox').style.display = 'none';
    document.getElementById('adminPanel').classList.add('active');
    await loadGameData();
    renderExistingGames();
}

// ==================== GitHub Token ====================
function saveToken() {
    const token = document.getElementById('ghToken').value.trim();
    if (!token) return;
    localStorage.setItem('poker_gh_token', token);
    document.getElementById('tokenStatus').style.display = 'inline';
    document.getElementById('tokenStatus').textContent = '已保存';
}

function getToken() {
    return localStorage.getItem('poker_gh_token');
}

// ==================== 数据操作 ====================
async function loadGameData() {
    try {
        const resp = await fetch(`data/games.json?t=${Date.now()}`);
        if (resp.ok) {
            gameData = await resp.json();
        }
    } catch (e) {
        console.warn('Load data failed, using empty data');
        gameData = { players: [], games: [] };
    }
}

// ==================== 玩家输入行 ====================
let playerRowCount = 0;

function addPlayerRow(name = '', score = '') {
    const container = document.getElementById('playerInputs');
    const row = document.createElement('div');
    row.className = 'player-row';
    row.id = `playerRow_${playerRowCount}`;

    // 构建已知玩家的 datalist
    const players = new Set();
    if (gameData.games) {
        gameData.games.forEach(g => Object.keys(g.scores).forEach(p => players.add(p)));
    }
    const listId = `players_${playerRowCount}`;

    row.innerHTML = `
        <input type="text" class="player-name-input" placeholder="玩家名" value="${name}" list="${listId}">
        <datalist id="${listId}">
            ${Array.from(players).map(p => `<option value="${p}">`).join('')}
        </datalist>
        <input type="number" class="player-score-input" placeholder="积分" value="${score}">
        <button class="remove-btn" onclick="removePlayerRow('playerRow_${playerRowCount}')">&times;</button>
    `;
    container.appendChild(row);
    playerRowCount++;
}

function removePlayerRow(rowId) {
    const row = document.getElementById(rowId);
    if (row) row.remove();
}

// ==================== 提交对局 ====================
async function submitGame() {
    const errEl = document.getElementById('submitError');
    const sucEl = document.getElementById('submitSuccess');
    errEl.style.display = 'none';
    sucEl.style.display = 'none';

    const date = document.getElementById('gameDate').value;
    if (!date) {
        showError(errEl, '请选择日期');
        return;
    }

    // 收集玩家数据
    const rows = document.querySelectorAll('.player-row');
    const scores = {};
    let hasError = false;

    rows.forEach(row => {
        const name = row.querySelector('.player-name-input').value.trim();
        const scoreStr = row.querySelector('.player-score-input').value.trim();
        if (!name || scoreStr === '') {
            hasError = true;
            return;
        }
        scores[name] = parseInt(scoreStr, 10);
    });

    if (hasError || Object.keys(scores).length < 2) {
        showError(errEl, '请至少填写 2 名玩家的姓名和积分');
        return;
    }

    // 验证积分总和为 0（德州扑克零和博弈）
    const total = Object.values(scores).reduce((s, v) => s + v, 0);
    if (total !== 0) {
        showError(errEl, `积分总和应为 0，当前总和为 ${total > 0 ? '+' : ''}${total}`);
        return;
    }

    // 构建新对局
    const newGame = {
        id: (gameData.games.length > 0 ? Math.max(...gameData.games.map(g => g.id)) : 0) + 1,
        date: date,
        scores: scores
    };

    gameData.games.push(newGame);

    // 更新玩家列表
    const allPlayers = new Set(gameData.players);
    Object.keys(scores).forEach(p => allPlayers.add(p));
    gameData.players = Array.from(allPlayers);

    // 保存到 GitHub
    const saved = await saveToGitHub();
    if (saved) {
        showSuccess(sucEl, `第 ${newGame.id} 局已保存！`);
        clearInputs();
        renderExistingGames();
    } else {
        // 回滚
        gameData.games.pop();
        showError(errEl, '保存失败，请检查 GitHub Token 是否正确');
    }
}

// ==================== GitHub API ====================
async function saveToGitHub() {
    const token = getToken();
    if (!token) {
        alert('请先配置 GitHub Token');
        return false;
    }

    try {
        // 1. 获取当前文件的 SHA（用于更新）
        const getResp = await fetch(
            `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataPath}?ref=${CONFIG.branch}`,
            { headers: { 'Authorization': `token ${token}` } }
        );

        let sha = null;
        if (getResp.ok) {
            const fileInfo = await getResp.json();
            sha = fileInfo.sha;
        }

        // 2. 写入文件
        const content = btoa(unescape(encodeURIComponent(JSON.stringify(gameData, null, 2))));
        const body = {
            message: `更新积分数据 - 第 ${gameData.games[gameData.games.length - 1].id} 局`,
            content: content,
            branch: CONFIG.branch
        };
        if (sha) body.sha = sha;

        const putResp = await fetch(
            `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.dataPath}`,
            {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body)
            }
        );

        return putResp.ok;
    } catch (e) {
        console.error('GitHub API error:', e);
        return false;
    }
}

async function deleteGameFromGitHub(gameId) {
    if (!confirm(`确定删除第 ${gameId} 局？`)) return;

    gameData.games = gameData.games.filter(g => g.id !== gameId);

    const saved = await saveToGitHub();
    if (saved) {
        renderExistingGames();
    } else {
        // 重新加载
        await loadGameData();
        renderExistingGames();
        alert('删除失败');
    }
}

// ==================== 已有对局渲染 ====================
function renderExistingGames() {
    const container = document.getElementById('gamesList');
    if (!gameData.games || gameData.games.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary);padding:10px 0;">暂无对局数据</p>';
        return;
    }

    const sorted = [...gameData.games].sort((a, b) => b.id - a.id);
    container.innerHTML = sorted.map(game => {
        const scoreStr = Object.entries(game.scores)
            .sort((a, b) => b[1] - a[1])
            .map(([n, s]) => `${n}: ${s > 0 ? '+' : ''}${s}`)
            .join('，');

        return `<div class="mini-game-card">
            <div class="mini-game-info">
                <strong>第 ${game.id} 局</strong> | ${game.date} | ${scoreStr}
            </div>
            <div class="mini-game-actions">
                <button class="btn btn-danger" onclick="deleteGameFromGitHub(${game.id})">删除</button>
            </div>
        </div>`;
    }).join('');
}

// ==================== 工具函数 ====================
function clearInputs() {
    const container = document.getElementById('playerInputs');
    container.innerHTML = '';
    playerRowCount = 0;
    addPlayerRow();
    addPlayerRow();
}

function showError(el, msg) {
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
}

function showSuccess(el, msg) {
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 5000);
}

// ==================== 初始化 ====================
document.addEventListener('DOMContentLoaded', initAdmin);
