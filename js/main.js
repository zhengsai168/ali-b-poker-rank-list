// ==================== 配置 ====================
const CONFIG = {
    owner: 'zhengsai168',
    repo: 'ali-b-poker-rank-list',
    dataPath: 'data/games.json',
    branch: 'main'
};

// ==================== 数据加载 ====================
async function loadData() {
    try {
        // 优先从 GitHub raw 加载（部署后使用），本地开发时 fallback 到相对路径
        const resp = await fetch(`data/games.json?t=${Date.now()}`);
        if (!resp.ok) throw new Error('Failed to load');
        return await resp.json();
    } catch (e) {
        console.warn('Load data failed:', e);
        return { players: [], games: [] };
    }
}

// ==================== 工具函数 ====================
function scoreClass(score) {
    if (score > 0) return 'score-positive';
    if (score < 0) return 'score-negative';
    return 'score-zero';
}

function formatScore(score) {
    return score > 0 ? `+${score}` : `${score}`;
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ==================== 统计计算 ====================
function computeStats(data) {
    const { games } = data;
    if (!games || games.length === 0) return null;

    // 收集所有玩家
    const playerSet = new Set();
    games.forEach(g => Object.keys(g.scores).forEach(p => playerSet.add(p)));
    const allPlayers = Array.from(playerSet);

    // 基础统计
    const stats = {};
    allPlayers.forEach(p => {
        stats[p] = {
            name: p,
            totalScore: 0,
            gamesPlayed: 0,
            wins: 0,
            maxScore: -Infinity,
            minScore: Infinity,
            maxStreak: 0,
            currentStreak: 0,
            scores: [],
            avgScore: 0
        };
    });

    // 按日期排序
    const sortedGames = [...games].sort((a, b) => new Date(a.date) - new Date(b.date));

    sortedGames.forEach(game => {
        Object.entries(game.scores).forEach(([player, score]) => {
            const s = stats[player];
            s.totalScore += score;
            s.gamesPlayed++;
            if (score > 0) {
                s.wins++;
                s.currentStreak++;
                if (s.currentStreak > s.maxStreak) s.maxStreak = s.currentStreak;
            } else {
                s.currentStreak = 0;
            }
            if (score > s.maxScore) s.maxScore = score;
            if (score < s.minScore) s.minScore = score;
            s.scores.push({ date: game.date, score, cumulative: s.totalScore, gameId: game.id });
        });
    });

    allPlayers.forEach(p => {
        stats[p].avgScore = stats[p].gamesPlayed > 0
            ? Math.round(stats[p].totalScore / stats[p].gamesPlayed * 10) / 10
            : 0;
        stats[p].winRate = stats[p].gamesPlayed > 0
            ? Math.round(stats[p].wins / stats[p].gamesPlayed * 100)
            : 0;
    });

    // 排名（按总积分降序）
    const ranked = Object.values(stats).sort((a, b) => b.totalScore - a.totalScore);

    return { ranked, sortedGames, stats };
}

// ==================== 排行榜渲染 ====================
function renderLeaderboard(data) {
    const result = computeStats(data);
    const tbody = document.querySelector('#rankTable tbody');
    const totalGamesEl = document.getElementById('totalGames');

    if (!result || result.ranked.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="icon">♠</div><p>暂无对局数据</p></div></td></tr>';
        totalGamesEl.textContent = '';
        return;
    }

    totalGamesEl.textContent = `共 ${result.sortedGames.length} 场对局`;

    tbody.innerHTML = result.ranked.map((p, i) => {
        const rank = i + 1;
        let rankBadge;
        if (rank <= 3) {
            rankBadge = `<span class="rank-badge top-${rank}">${rank}</span>`;
        } else {
            rankBadge = `<span>${rank}</span>`;
        }
        return `<tr>
            <td>${rankBadge}</td>
            <td class="player-name">${p.name}</td>
            <td class="${scoreClass(p.totalScore)}">${formatScore(p.totalScore)}</td>
            <td>${p.gamesPlayed}</td>
            <td>${p.winRate}%</td>
            <td class="${p.maxScore === -Infinity ? '' : scoreClass(p.maxScore)}">${p.maxScore === -Infinity ? '-' : formatScore(p.maxScore)}</td>
            <td class="${p.minScore === Infinity ? '' : scoreClass(p.minScore)}">${p.minScore === Infinity ? '-' : formatScore(p.minScore)}</td>
        </tr>`;
    }).join('');
}

// ==================== 历史对局渲染 ====================
function renderHistory(data) {
    const container = document.getElementById('historyList');
    const { games } = data;

    if (!games || games.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="icon">♦</div><p>暂无对局记录</p></div>';
        return;
    }

    // 按日期倒序
    const sorted = [...games].sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = sorted.map(game => {
        const scores = Object.entries(game.scores).sort((a, b) => b[1] - a[1]);
        return `<div class="game-card">
            <div class="game-card-header">
                <span class="game-id">第 ${game.id} 局</span>
                <span class="game-date">${formatDate(game.date)}</span>
            </div>
            <div class="game-scores">
                ${scores.map(([name, score]) => `
                    <div class="game-score-item">
                        <span class="name">${name}</span>
                        <span class="score ${scoreClass(score)}">${formatScore(score)}</span>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }).join('');
}

// ==================== 统计页面渲染 ====================
let trendChartInstance = null;

function renderStats(data) {
    const result = computeStats(data);

    if (!result) {
        document.getElementById('streakStats').innerHTML = '<p class="empty-state">暂无数据</p>';
        document.getElementById('extremeStats').innerHTML = '';
        document.getElementById('avgStats').innerHTML = '';
        return;
    }

    const { ranked, stats } = result;

    // 连胜纪录
    const streakRanked = [...ranked].sort((a, b) => b.maxStreak - a.maxStreak).slice(0, 5);
    document.getElementById('streakStats').innerHTML = streakRanked.map(p =>
        `<div class="stat-item">
            <span class="stat-label">${p.name}</span>
            <span class="stat-value">${p.maxStreak} 连胜</span>
        </div>`
    ).join('');

    // 单局之最
    const allScores = [];
    data.games.forEach(g => {
        Object.entries(g.scores).forEach(([name, score]) => {
            allScores.push({ name, score, date: g.date, gameId: g.id });
        });
    });
    const highest = [...allScores].sort((a, b) => b.score - a.score).slice(0, 3);
    const lowest = [...allScores].sort((a, b) => a.score - b.score).slice(0, 3);

    document.getElementById('extremeStats').innerHTML =
        '<div style="margin-bottom:10px;color:var(--green);font-size:0.85rem;">最高单局</div>' +
        highest.map(s =>
            `<div class="stat-item">
                <span class="stat-label">${s.name} (第${s.gameId}局)</span>
                <span class="stat-value score-positive">${formatScore(s.score)}</span>
            </div>`
        ).join('') +
        '<div style="margin:10px 0;color:var(--red);font-size:0.85rem;">最低单局</div>' +
        lowest.map(s =>
            `<div class="stat-item">
                <span class="stat-label">${s.name} (第${s.gameId}局)</span>
                <span class="stat-value score-negative">${formatScore(s.score)}</span>
            </div>`
        ).join('');

    // 场均积分
    const avgRanked = [...ranked].sort((a, b) => b.avgScore - a.avgScore);
    document.getElementById('avgStats').innerHTML = avgRanked.map(p =>
        `<div class="stat-item">
            <span class="stat-label">${p.name}</span>
            <span class="stat-value ${scoreClass(p.avgScore)}">${p.avgScore > 0 ? '+' : ''}${p.avgScore}</span>
        </div>`
    ).join('');

    // 趋势图
    renderTrendChart(result);
}

function renderTrendChart(result) {
    const ctx = document.getElementById('trendChart');
    if (!ctx) return;

    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    const colors = ['#e94560', '#4ecdc4', '#ffd700', '#a855f7', '#3b82f6', '#f97316', '#ec4899', '#14b8a6'];
    const players = result.ranked.slice(0, 8); // 最多8个

    const datasets = players.map((p, i) => {
        const cumScores = [];
        let cum = 0;
        const sortedGames = [...result.sortedGames];
        sortedGames.forEach(game => {
            if (game.scores[p.name] !== undefined) {
                cum += game.scores[p.name];
            }
            cumScores.push(cum);
        });

        return {
            label: p.name,
            data: cumScores,
            borderColor: colors[i % colors.length],
            backgroundColor: 'transparent',
            tension: 0.3,
            pointRadius: 3,
            borderWidth: 2
        };
    });

    const labels = result.sortedGames.map(g => `第${g.id}局`);

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#a0a0a0', padding: 16 }
                }
            },
            scales: {
                x: {
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                },
                y: {
                    ticks: { color: '#a0a0a0' },
                    grid: { color: 'rgba(255,255,255,0.05)' }
                }
            }
        }
    });
}

// ==================== 导航切换 ====================
function initNav() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.view).classList.add('active');
        });
    });
}

// ==================== 初始化 ====================
async function init() {
    initNav();
    const data = await loadData();
    renderLeaderboard(data);
    renderHistory(data);
    renderStats(data);
}

document.addEventListener('DOMContentLoaded', init);
