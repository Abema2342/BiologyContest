// === КОНСТАНТЫ ===
// ВАЖНО: без слэша на конце! Иначе будет //api/... и ошибка Unknown route
const WORKER_URL = "https://biologycontest.kmaxim242.workers.dev";
const ADMIN_KEY  = "abema2342";

// === ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===
let questions = [];
let currentUser = null;
let currentQIndex = 0;
let userAnswers = {};

// === ТРАНСПОРТ ДО WORKER (все данные идут только сюда) ===
async function apiGet(route) {
    const r = await fetch(`${WORKER_URL}/api/${route}`);
    if (!r.ok) throw new Error(`GET ${route}: ${r.status} ${await r.text()}`);
    return r.text();
}

async function apiPut(route, contentStr) {
    const r = await fetch(`${WORKER_URL}/api/${route}`, {
        method: "PUT",
        headers: { 
            "X-Admin-Key": ADMIN_KEY, 
            "Content-Type": "text/plain;charset=UTF-8" 
        },
        body: contentStr
    });
    const txt = await r.text();
    if (!r.ok) throw new Error(txt);
    return txt;
}

// === ЗАГРУЗКА ДАННЫХ ===
async function loadData() {
    try {
        // Читаем вопросы через Worker, а не напрямую из файла
        const data = JSON.parse(await apiGet("questions"));
        questions = data.categories.flatMap(c => c.questions);
        console.log(`Загружено ${questions.length} вопросов`);
    } catch (e) {
        console.error("Ошибка загрузки вопросов:", e);
        alert("Не удалось загрузить вопросы. Проверь консоль.");
    }
}

// === АВТОРИЗАЦИЯ ===
async function performLogin() {
    const l = document.getElementById("login-input").value.trim();
    const p = document.getElementById("pass-input").value.trim();
    
    if (!l || !p) {
        alert("Введите логин и пароль");
        return;
    }
    
    try {
        // Читаем пользователей через Worker
        const users = JSON.parse(await apiGet("users"));
        const user = users.find(u => u.login === l && u.password === p);
        
        if (user) {
            currentUser = user;
            localStorage.setItem("biology_user", JSON.stringify(user)); // Сохраняем сессию
            updateUIForLoggedInUser();
            showPage("home");
        } else {
            alert("Неверный логин или пароль");
        }
    } catch (e) {
        console.error(e);
        alert("Ошибка загрузки пользователей");
    }
}

function logout() {
    localStorage.removeItem("biology_user");
    location.reload();
}

// === ОБНОВЛЕНИЕ UI ПОД ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ===
function updateUIForLoggedInUser() {
    const authSection = document.getElementById("auth-section");
    const userInfo = document.getElementById("user-info");
    const nameSpan = document.getElementById("username-display");
    const adminLink = document.getElementById("admin-link");
    const accountsLink = document.getElementById("accounts-link");

    if (currentUser) {
        if (authSection) authSection.style.display = "none";
        if (userInfo) userInfo.style.display = "block";
        if (nameSpan) nameSpan.innerText = currentUser.name;
        
        const isAdmin = currentUser.role === "admin";
        if (adminLink) adminLink.style.display = isAdmin ? "block" : "none";
        if (accountsLink) accountsLink.style.display = isAdmin ? "block" : "none";
    } else {
        if (authSection) authSection.style.display = "block";
        if (userInfo) userInfo.style.display = "none";
        if (adminLink) adminLink.style.display = "none";
        if (accountsLink) accountsLink.style.display = "none";
    }
}

// === НАВИГАЦИЯ ПО СТРАНИЦАМ ===
function showPage(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) {
        target.classList.add("active");
    } else {
        console.warn(`Страница "${id}" не найдена в DOM.`);
    }
}

function goHome() {
    showPage("home");
}

// === ТЕСТ ===
function startTest() {
    if (!currentUser) {
        alert("Сначала войдите в аккаунт!");
        return;
    }
    if (!questions.length) {
        alert("Вопросы не загружены.");
        return;
    }
    currentQIndex = 0;
    userAnswers = {};
    renderQ();
    showPage("contest");
}

function renderQ() {
    const q = questions[currentQIndex];
    let html = `<div class="question-block"><h3>${q.text}</h3>`;

    if (q.type === "multiple_choice") {
        html += '<div class="options">';
        q.options.forEach((opt, i) => {
            const checked = userAnswers[q.id] === i ? "checked" : "";
            html += `<label><input type="radio" name="ans-${q.id}" value="${i}" ${checked} onchange="saveAnswer(${q.id}, ${i})"> ${opt}</label><br>`;
        });
        html += "</div>";
    } else if (q.type === "text_input") {
        const val = userAnswers[q.id] || "";
        html += `<input type="text" class="text-input" value="${val}" placeholder="Введите ответ..." onchange="saveAnswer(${q.id}, this.value)">`;
    } else if (q.type === "table_fill") {
        html += `<table class="table-fill"><tr>${q.headers.map(h => `<th>${h}</th>`).join("")}</tr>`;
        q.rows.forEach(r => {
            const val = (userAnswers[q.id] && userAnswers[q.id][r.key]) || "";
            html += `<tr><td>${r.label}</td><td><input class="text-input" value="${val}" onchange="saveTableAnswer(${q.id}, '${r.key}', this.value)"></td></tr>`;
        });
        html += "</table>";
    }

    html += "</div>";
    document.getElementById("q-container").innerHTML = html;
    document.getElementById("counter").innerText = `${currentQIndex + 1} / ${questions.length}`;
}

function saveAnswer(qId, val) {
    userAnswers[qId] = val;
}

function saveTableAnswer(qId, key, val) {
    if (!userAnswers[qId]) userAnswers[qId] = {};
    userAnswers[qId][key] = val;
}

function nextQ() {
    if (currentQIndex < questions.length - 1) {
        currentQIndex++;
        renderQ();
    }
}

function prevQ() {
    if (currentQIndex > 0) {
        currentQIndex--;
        renderQ();
    }
}

// === ПОДСЧЁТ РЕЗУЛЬТАТА ===
function finishTest() {
    let score = 0;
    let maxScore = 0;

    questions.forEach(q => {
        maxScore += q.points;
        const ans = userAnswers[q.id];

        if (q.type === "multiple_choice" && ans === q.correct_index) {
            score += q.points;
        } else if (q.type === "text_input" && ans && q.accepted_answers &&
                   q.accepted_answers.includes(String(ans).toLowerCase().trim())) {
            score += q.points;
        } else if (q.type === "table_fill" && ans) {
            let correctCells = 0;
            q.rows.forEach(r => {
                const userVal = (ans[r.key] || "").toLowerCase().trim();
                const correct = (r.correct_value || "").toLowerCase();
                if (userVal && (userVal.includes(correct) || correct.includes(userVal))) {
                    correctCells++;
                }
            });
            score += Math.round((correctCells / q.rows.length) * q.points);
        }
    });

    const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    document.getElementById("score-display").innerText =
        `Итог: ${score} из ${maxScore} баллов (${percent}%)`;
    showPage("results");
}

// === АДМИН: РЕДАКТОР ВОПРОСОВ ===
function openEditor() {
    showPage("editor");
    apiGet("questions")
        .then(t => { document.getElementById("editor-area").value = t; })
        .catch(e => { document.getElementById("save-status").innerText = "Ошибка загрузки: " + e.message; });
}

async function saveToGithub() {
    const content = document.getElementById("editor-area").value;
    const statusEl = document.getElementById("save-status");
    
    try {
        JSON.parse(content);
    } catch {
        statusEl.innerText = "Ошибка: невалидный JSON";
        statusEl.style.color = "red";
        return;
    }
    
    try {
        await apiPut("questions", content);
        statusEl.innerText = "Сохранено";
        statusEl.style.color = "green";
    } catch (e) {
        statusEl.innerText = "Ошибка: " + e.message;
        statusEl.style.color = "red";
    }
}

// === АДМИН: УПРАВЛЕНИЕ АККАУНТАМИ ===
async function openAccountsManager() {
    showPage("accounts-page");
    let users;
    try {
        users = JSON.parse(await apiGet("users"));
    } catch (e) {
        document.getElementById("accounts-container").innerHTML =
            `<p style="color:red;">Ошибка загрузки пользователей: ${e.message}</p>`;
        return;
    }

    let html = "<h3>Список аккаунтов</h3><table class=\"table-fill\"><tr><th>Логин</th><th>Имя</th><th>Роль</th><th>Действия</th></tr>";
    users.forEach((u, index) => {
        html += `<tr>
            <td>${u.login}</td>
            <td>${u.name}</td>
            <td>${u.role}</td>
            <td><button onclick="deleteAccount(${index})" class="btn-nav" style="background:#d9534f;color:#fff;">Удалить</button></td>
        </tr>`;
    });
    html += "</table><br><hr><h4>Добавить новый аккаунт</h4>";
    html += `
        <input type="text" id="new-login" placeholder="Логин" class="text-input">
        <input type="password" id="new-pass" placeholder="Пароль" class="text-input">
        <input type="text" id="new-name" placeholder="Отображаемое имя" class="text-input">
        <select id="new-role" class="text-input">
            <option value="user">Пользователь</option>
            <option value="admin">Администратор</option>
        </select>
        <button onclick="addAndSaveAccount()" class="btn-primary">Добавить и сохранить</button>
        <p id="acc-status"></p>
    `;
    document.getElementById("accounts-container").innerHTML = html;
}

async function addAndSaveAccount() {
    const login = document.getElementById("new-login").value.trim();
    const pass = document.getElementById("new-pass").value.trim();
    const name = document.getElementById("new-name").value.trim();
    const role = document.getElementById("new-role").value;
    const statusEl = document.getElementById("acc-status");

    if (!login || !pass || !name) {
        statusEl.innerText = "Заполните все поля";
        statusEl.style.color = "red";
        return;
    }

    let users;
    try {
        users = JSON.parse(await apiGet("users"));
    } catch (e) {
        statusEl.innerText = "Ошибка загрузки: " + e.message;
        statusEl.style.color = "red";
        return;
    }

    if (users.some(u => u.login === login)) {
        statusEl.innerText = "Такой логин уже существует";
        statusEl.style.color = "red";
        return;
    }

    users.push({ login, password: pass, name, role });

    try {
        await apiPut("users", JSON.stringify(users, null, 2));
        statusEl.innerText = "Добавлено и сохранено";
        statusEl.style.color = "green";
        openAccountsManager(); // Перерисовываем список
    } catch (e) {
        statusEl.innerText = "Ошибка сохранения: " + e.message;
        statusEl.style.color = "red";
    }
}

async function deleteAccount(index) {
    if (!confirm("Точно удалить этот аккаунт?")) return;

    let users;
    try {
        users = JSON.parse(await apiGet("users"));
    } catch (e) {
        alert("Ошибка загрузки: " + e.message);
        return;
    }

    users.splice(index, 1);

    try {
        await apiPut("users", JSON.stringify(users, null, 2));
        openAccountsManager(); // Перерисовываем список
    } catch (e) {
        alert("Ошибка сохранения: " + e.message);
    }
}

// === ИНИЦИАЛИЗАЦИЯ ===
window.onload = async () => {
    await loadData(); // Сначала грузим вопросы
    
    const savedUser = localStorage.getItem("biology_user");
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
        } catch {
            currentUser = null;
            localStorage.removeItem("biology_user");
        }
    }
    
    updateUIForLoggedInUser(); // Обновляем интерфейс под текущего пользователя
};