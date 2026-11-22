// Глобальные переменные
let questions = [];
let currentUser = null;
let currentQIndex = 0;
let userAnswers = {};
const WORKER_URL = "https://biologycontest.kmaxim242.workers.dev/"; // адрес из шага 2.1
const ADMIN_KEY  = "abema2342"; // шаг 2.2

async function apiGet(route) {
  const r = await fetch(`${WORKER_URL}/api/${route}`);
  if (!r.ok) throw new Error(`GET ${route}: ${r.status} ${await r.text()}`);
  return r.text();
}
async function apiPut(route, contentStr) {
  const r = await fetch(`${WORKER_URL}/api/${route}`, {
    method: "PUT",
    headers: { "X-Admin-Key": ADMIN_KEY, "Content-Type": "text/plain;charset=UTF-8" },
    body: contentStr
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(txt);
  return txt;
}

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
    // Скрываем все элементы с классом .page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // Ищем нужный элемент и проверяем его существование перед добавлением класса
    const target = document.getElementById(id);
    if (target) {
        target.classList.add('active');
    } else {
        console.warn(`Страница "${id}" не найдена в DOM.`);
    }
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
  const content = document.getElementById('editor-area').value;
  const statusEl = document.getElementById('save-status');
  try {
    JSON.parse(content);
  } catch {
    statusEl.innerText = "Ошибка: невалидный JSON";
    statusEl.style.color = "red";
    return;
  }
  try {
    await apiPut('questions', content);
    statusEl.innerText = "Сохранено";
    statusEl.style.color = "green";
  } catch (e) {
    statusEl.innerText = "Ошибка: " + e.message;
    statusEl.style.color = "red";
  }
}

async function saveUsersToGithub(usersArray, statusElement) {
  try {
    await apiPut('users', JSON.stringify(usersArray, null, 2));
    statusElement.innerText = "Изменения сохранены";
    statusElement.style.color = "green";
  } catch (e) {
    statusElement.innerText = "Ошибка: " + e.message;
    statusElement.style.color = "red";
  }
}

// Открытие вкладки Аккаунты
async function openAccountsManager() {
    showPage('accounts-page');
    const res = await fetch('profiles/users.json');
    const users = await res.json();
    
    let html = '<h3>Список аккаунтов</h3><table class="table-fill"><tr><th>Логин</th><th>Имя</th><th>Роль</th><th>Действия</th></tr>';
    
    users.forEach((u, index) => {
        html += `<tr>
            <td>${u.login}</td>
            <td>${u.name}</td>
            <td>${u.role}</td>
            <td><button onclick="deleteAccount(${index})" class="btn-nav" style="background:#d9534f;">Удалить</button></td>
        </tr>`;
    });
    
    html += '</table><br><hr><h4>Добавить новый аккаунт</h4>';
    html += `
        <input type="text" id="new-login" placeholder="Логин" class="text-input">
        <input type="password" id="new-pass" placeholder="Пароль" class="text-input">
        <input type="text" id="new-name" placeholder="Отображаемое имя" class="text-input">
        <select id="new-role" class="text-input">
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
        select>
        <button onclick="addAndSaveAccount()" class="btn-primary">Сохранить в GitHub</button>
        <p id="acc-status"></p>
    `;
    
    document.getElementById('accounts-container').innerHTML = html;
}

// Добавление и сохранение нового пользователя
async function addAndSaveAccount() {
    const login = document.getElementById('new-login').value.trim();
    const pass = document.getElementById('new-pass').value.trim();
    const name = document.getElementById('new-name').value.trim();
    const role = document.getElementById('new-role').value;
    const statusEl = document.getElementById('acc-status');

    if (!login || !pass || !name) {
        statusEl.innerText = "Заполните все поля";
        return;
    }

    // 1. Получаем текущий файл с сервера/GitHub
    const res = await fetch('profiles/users.json');
    let users = await res.json();

    // 2. Проверяем уникальность логина
    if (users.some(u => u.login === login)) {
        statusEl.innerText = "Такой логин уже существует";
        return;
    }

    // 3. Добавляем нового
    users.push({ login, password: pass, name, role });

    // 4. Отправляем обновленный JSON на GitHub
    await saveUsersToGithub(users, statusEl);
}

// Удаление пользователя
async function deleteAccount(index) {
    if(!confirm("Точно удалить этот аккаунт?")) return;
    
    const res = await fetch('profiles/users.json');
    let users = await res.json();
    
    users.splice(index, 1);
    
    const statusEl = document.createElement('p'); // Временный элемент для статуса
    await saveUsersToGithub(users, statusEl);
    
    openAccountsManager(); // Перерисовываем список
}


// При загрузке страницы проверяем сохраненного пользователя
window.onload = async () => {
    await loadData(); // Сначала грузим вопросы
    
    const savedUser = localStorage.getItem('biology_user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        updateUIForLoggedInUser(); // Обновляем интерфейс под залогиненного юзера
    }
};

// Функция обновления UI после входа/выхода
function updateUIForLoggedInUser() {
    if (currentUser) {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('user-info').style.display = 'block';
        document.getElementById('username-display').innerText = currentUser.name;
        
        // Показываем админские ссылки только если роль admin
        if (currentUser.role === 'admin') {
            document.getElementById('admin-link').style.display = 'block';
            document.getElementById('accounts-link').style.display = 'block'; // Новая ссылка для вкладок
        } else {
            document.getElementById('admin-link').style.display = 'none';
            document.getElementById('accounts-link').style.display = 'none';
        }
    } else {
        document.getElementById('auth-section').style.display = 'block';
        document.getElementById('user-info').style.display = 'none';
        document.getElementById('admin-link').style.display = 'none';
        document.getElementById('accounts-link').style.display = 'none';
    }
}

// Модифицируем performLogin, чтобы сохранять данные
async function performLogin() {
    const l = document.getElementById('login-input').value.trim();
    const p = document.getElementById('pass-input').value.trim();
    
    try {
        const usersRes = await fetch('profiles/users.json');
        const users = await usersRes.json();
        const user = users.find(u => u.login === l && u.password === p);
        
        if (user) {
            currentUser = user;
            localStorage.setItem('biology_user', JSON.stringify(user)); // СОХРАНЯЕМ СЕССИЮ
            updateUIForLoggedInUser();
            showPage('home');
        } else {
            alert("Неверный логин или пароль");
        }
    } catch (e) {
        console.error(e);
        alert("Ошибка загрузки пользователей");
    }
}

// Модифицируем logout, чтобы очищать хранилище
function logout() {
    localStorage.removeItem('biology_user');
    location.reload();
}