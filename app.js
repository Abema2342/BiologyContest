// Глобальные переменные
let questions = [];
let currentUser = null;
let currentQIndex = 0;
let userAnswers = {};

// === ЗАГРУЗКА ДАННЫХ ===
async function loadData() {
    try {
        const res = await fetch('tasks/questions.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        questions = data.categories.flatMap(c => c.questions);
        console.log(`Загружено ${questions.length} вопросов`);
    } catch (e) {
        console.error("Ошибка загрузки:", e);
        alert("Не удалось загрузить вопросы. Проверь консоль.");
    }
}

// === АВТОРИЗАЦИЯ ===
async function performLogin() {
    const l = document.getElementById('login-input').value.trim();
    const p = document.getElementById('pass-input').value.trim();
    
    if (!l || !p) {
        alert("Введите логин и пароль");
        return;
    }
    
    try {
        const usersRes = await fetch('profiles/users.json');
        const users = await usersRes.json();
        const user = users.find(u => u.login === l && u.password === p);
        
        if (user) {
            currentUser = user;
            // Прячем форму входа, показываем инфу о пользователе
            document.getElementById('auth-section').style.display = 'none';
            document.getElementById('user-info').style.display = 'block';
            document.getElementById('username-display').innerText = user.name;
            
            // Если админ — показываем ссылку на редактор
            if (user.role === 'admin') {
                document.getElementById('admin-link').style.display = 'block';
            }
            showPage('home');
        } else {
            alert("Неверный логин или пароль");
        }
    } catch (e) {
        console.error(e);
        alert("Ошибка загрузки пользователей");
    }
}

function logout() {
    location.reload();
}

// === НАВИГАЦИЯ ПО СТРАНИЦАМ ===
function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

function goHome() {
    showPage('home');
}

// === ТЕСТ ===
function startTest() {
    if (!currentUser) {
        alert("Сначала войдите в аккаунт!");
        return;
    }
    currentQIndex = 0;
    userAnswers = {};
    renderQ();
    showPage('contest');
}

function renderQ() {
    const q = questions[currentQIndex];
    let html = `<div class="question-block"><h3>${q.text}</h3>`;
    
    if (q.type === 'multiple_choice') {
        html += '<div class="options">';
        q.options.forEach((opt, i) => {
            const checked = userAnswers[q.id] === i ? 'checked' : '';
            html += `<label><input type="radio" name="ans-${q.id}" value="${i}" ${checked} onchange="saveAnswer(${q.id}, ${i})"> ${opt}</label><br>`;
        });
        html += '</div>';
    } 
    else if (q.type === 'text_input') {
        const val = userAnswers[q.id] || '';
        html += `<input type="text" class="text-input" value="${val}" placeholder="Введите ответ..." onchange="saveAnswer(${q.id}, this.value)">`;
    }
    else if (q.type === 'table_fill') {
        html += `<table class="table-fill"><tr>${q.headers.map(h=>`<th>${h}</th>`).join('')}</tr>`;
        q.rows.forEach(r => {
            const val = userAnswers[q.id]?.[r.key] || '';
            html += `<tr><td>${r.label}</td><td><input class="text-input" value="${val}" onchange="saveTableAnswer(${q.id}, '${r.key}', this.value)"></td></tr>`;
        });
        html += `</table>`;
    }
    
    html += '</div>';
    document.getElementById('q-container').innerHTML = html;
    document.getElementById('counter').innerText = `${currentQIndex + 1} / ${questions.length}`;
}

function saveAnswer(qId, val) { userAnswers[qId] = val; }

function saveTableAnswer(qId, key, val) {
    if (!userAnswers[qId]) userAnswers[qId] = {};
    userAnswers[qId][key] = val;
}

function nextQ() { if (currentQIndex < questions.length - 1) { currentQIndex++; renderQ(); } }
function prevQ() { if (currentQIndex > 0) { currentQIndex--; renderQ(); } }

// === ПОДСЧЁТ РЕЗУЛЬТАТА ===
function finishTest() {
    let score = 0;
    let maxScore = 0;
    
    questions.forEach(q => {
        maxScore += q.points;
        const ans = userAnswers[q.id];
        
        if (q.type === 'multiple_choice' && ans === q.correct_index) {
            score += q.points;
        } else if (q.type === 'text_input' && ans && q.accepted_answers?.includes(ans.toLowerCase().trim())) {
            score += q.points;
        } else if (q.type === 'table_fill' && ans) {
            let correctCells = 0;
            q.rows.forEach(r => {
                const userVal = (ans[r.key] || '').toLowerCase().trim();
                if (userVal.includes(r.correct_value.toLowerCase()) || r.correct_value.toLowerCase().includes(userVal)) {
                    correctCells++;
                }
            });
            score += Math.round((correctCells / q.rows.length) * q.points);
        }
    });
    
    document.getElementById('score-display').innerText = `Итог: ${score} из ${maxScore} баллов (${Math.round(score/maxScore*100)}%)`;
    showPage('results');
}

// === АДМИН ПАНЕЛЬ ===
function openEditor() {
    showPage('editor');
    fetch('tasks/questions.json')
        .then(r => r.text())
        .then(t => document.getElementById('editor-area').value = t);
}

async function saveToGithub() {
    // ВСТАВЬ СВОЙ ТОКЕН И РЕПО
    const token = "ghp_ТВОЙ_ТОКЕН";
    const repo = "ТВОЙ_НИК/ТВОЙ_РЕПО";
    const content = document.getElementById('editor-area').value;
    const statusEl = document.getElementById('save-status');
    
    try {
        // Проверяем валидность JSON перед отправкой
        JSON.parse(content);
    } catch (e) {
        statusEl.innerText = "Ошибка: невалидный JSON!";
        statusEl.style.color = "red";
        return;
    }
    
    try {
        const shaRes = await fetch(`https://api.github.com/repos/${repo}/contents/tasks/questions.json`, {
            headers: { Authorization: `token ${token}` }
        });
        const shaData = await shaRes.json();

        const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/tasks/questions.json`, {
            method: 'PUT',
            headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "Update via admin panel",
                content: btoa(unescape(encodeURIComponent(content))),
                sha: shaData.sha
            })
        });
        
        if (putRes.ok) {
            statusEl.innerText = "Сохранено в GitHub!";
            statusEl.style.color = "green";
        } else {
            statusEl.innerText = "Ошибка сохранения";
            statusEl.style.color = "red";
        }
    } catch (e) {
        console.error(e);
        statusEl.innerText = "Ошибка сети";
        statusEl.style.color = "red";
    }
}

// === ИНИЦИАЛИЗАЦИЯ ===
window.onload = () => {
    loadData();
};