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
    const authSection = document.getElementById('auth-section');
    const userInfo = document.getElementById('user-info');
    const nameSpan = document.getElementById('username-display');
    const adminLink = document.getElementById('admin-link');
    const accountsLink = document.getElementById('accounts-link');
    const tasksLink = document.getElementById('tasks-link'); // Новая переменная

    if (currentUser) {
        if (authSection) authSection.style.display = 'none';
        if (userInfo) userInfo.style.display = 'block';
        if (nameSpan) nameSpan.innerText = currentUser.name;
        
        const isAdmin = currentUser.role === 'admin';
        
        if (adminLink) adminLink.style.display = isAdmin ? 'block' : 'none';
        if (accountsLink) accountsLink.style.display = isAdmin ? 'block' : 'none';
        if (tasksLink) tasksLink.style.display = isAdmin ? 'block' : 'none'; // Показываем новую кнопку
        
    } else {
        if (authSection) authSection.style.display = 'block';
        if (userInfo) userInfo.style.display = 'none';
        if (adminLink) adminLink.style.display = 'none';
        if (accountsLink) accountsLink.style.display = 'none';
        if (tasksLink) tasksLink.style.display = 'none'; // Скрываем при выходе
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

// === ЛОГИКА НОВЫХ ЗАДАНИЙ ===

function openTasksManager() {
    showPage('tasks-page');
    toggleTaskFields(); // Инициализируем поля по умолчанию
}

function toggleTaskFields() {
    const type = document.getElementById('task-type').value;
    const container = document.getElementById('dynamic-fields-container');
    let html = '';

    if (type === 'multiple_choice') {
        html = `
            <h4>Варианты ответов</h4>
            <div id="mc-options-list">
                <div class="mc-option-row"><input type="text" class="text-input mc-opt-val" placeholder="Вариант 1"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button></div>
                <div class="mc-option-row"><input type="text" class="text-input mc-opt-val" placeholder="Вариант 2"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button></div>
            </div>
            <button onclick="addMcOption()" class="btn-nav">+ Добавить вариант</button>
            <br><br>
            <label>Индекс правильного ответа (начинается с 0):</label>
            <input type="number" id="mc-correct-index" value="0" min="0" class="text-input" style="width:80px;">
        `;
    } 
    else if (type === 'text_input') {
        html = `
            <h4>Проверка ответа</h4>
            <label>Разрешённые ответы (через запятую):</label>
            <input type="text" id="ti-accepted" placeholder="ответ1, ответ2" class="text-input">
            <small style="color:#666;">Регистр игнорируется.</small>
        `;
    } 
    else if (type === 'table_fill') {
        html = `
            <h4>Структура таблицы</h4>
            <label>Заголовки колонок (через запятую):</label>
            <input type="text" id="tf-headers" placeholder="Колонка 1, Колонка 2" class="text-input">
            
            <div id="tf-rows-list">
                <!-- Строки добавляются кнопкой -->
            </div>
            <button onclick="addTfRow()" class="btn-nav">+ Добавить строку данных</button>
        `;
    }

    container.innerHTML = html;
}

function addMcOption() {
    const list = document.getElementById('mc-options-list');
    const count = list.children.length + 1;
    const div = document.createElement('div');
    div.className = 'mc-option-row';
    div.innerHTML = `<input type="text" class="text-input mc-opt-val" placeholder="Вариант ${count}"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button>`;
    list.appendChild(div);
}

function addTfRow() {
    const list = document.getElementById('tf-rows-list');
    const idx = list.children.length;
    const div = document.createElement('div');
    div.style.marginBottom = '10px';
    div.style.border = '1px solid #eee';
    div.style.padding = '5px';
    div.innerHTML = `
        <strong>Строка ${idx + 1}</strong><br>
        <label>Метка (видимая часть):</label>
        <input type="text" class="text-input tf-label" placeholder="Напр.: Мышечная ткань">
        <label>Правильное значение (для проверки):</label>
        <input type="text" class="text-input tf-value" placeholder="Напр.: Сокращение">
        <button onclick="this.parentElement.remove()" class="btn-nav" style="color:red; float:right;">Удалить</button>
        <div style="clear:both;"></div>
    `;
    list.appendChild(div);
}

async function saveNewQuestion() {
    const category = document.getElementById('task-category').value.trim();
    const type = document.getElementById('task-type').value;
    const text = document.getElementById('task-text').value.trim();
    const points = parseInt(document.getElementById('task-points').value) || 1;
    const statusEl = document.getElementById('task-status');

    if (!category || !text) {
        statusEl.innerText = "Ошибка: заполните тему и текст";
        statusEl.style.color = "red";
        return;
    }

    let questionObj = {
        id: Date.now(),
        type: type,
        text: text,
        points: points
    };

    try {
        // Формируем данные специфичные для типа
        if (type === 'multiple_choice') {
            const opts = Array.from(document.querySelectorAll('.mc-opt-val')).map(i => i.value.trim()).filter(v => v);
            const correctIdx = parseInt(document.getElementById('mc-correct-index').value);
            
            if (opts.length < 2) throw new Error("Нужно минимум 2 варианта");
            if (isNaN(correctIdx) || correctIdx < 0 || correctIdx >= opts.length) throw new Error(`Неверный индекс (от 0 до ${opts.length - 1})`);
            
            questionObj.options = opts;
            questionObj.correct_index = correctIdx;
        } 
        else if (type === 'text_input') {
            const accStr = document.getElementById('ti-accepted').value.trim();
            if (!accStr) throw new Error("Укажите правильный ответ");
            questionObj.accepted_answers = accStr.split(',').map(s => s.trim().toLowerCase());
        } 
        else if (type === 'table_fill') {
            const headersStr = document.getElementById('tf-headers').value.trim();
            if (!headersStr) throw new Error("Укажите заголовки");
            questionObj.headers = headersStr.split(',').map(h => h.trim());
            
            const rowEls = document.querySelectorAll('#tf-rows-list > div');
            if (rowEls.length === 0) throw new Error("Добавьте хотя бы одну строку");

            questionObj.rows = [];
            rowEls.forEach(el => {
                const label = el.querySelector('.tf-label').value.trim();
                const val = el.querySelector('.tf-value').value.trim();
                if (label && val) {
                    questionObj.rows.push({
                        key: `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        label: label,
                        correct_value: val
                    });
                }
            });
        }

        // Загружаем текущий JSON вопросов через Worker
        const currentJsonStr = await apiGet('questions');
        const data = JSON.parse(currentJsonStr);

        // Находим или создаем категорию
        let cat = data.categories.find(c => c.name.toLowerCase() === category.toLowerCase());
        if (!cat) {
            cat = {
                id: category.toLowerCase().replace(/\s+/g, '_'),
                name: category,
                questions: []
            };
            data.categories.push(cat);
        }

        // Добавляем вопрос
        cat.questions.push(questionObj);

        // Сохраняем обратно
        await apiPut('questions', JSON.stringify(data, null, 2));

        statusEl.innerText = "Вопрос успешно добавлен!";
        statusEl.style.color = "green";
        
        // Очищаем форму
        document.getElementById('task-text').value = "";
        document.getElementById('dynamic-fields-container').innerHTML = "";
        toggleTaskFields(); 

    } catch (e) {
        console.error(e);
        statusEl.innerText = "Ошибка: " + e.message;
        statusEl.style.color = "red";
    }
}

// === ОТКРЫТИЕ СПИСКА ЗАДАНИЙ ===
async function openTasksList() {
    showPage('tasks-page');
    
    // Показываем кнопку "Добавить", если пользователь админ
    const btnAdd = document.getElementById('btn-add-question');
    if (currentUser && currentUser.role === 'admin') {
        if (btnAdd) btnAdd.style.display = 'inline-block';
    } else {
        if (btnAdd) btnAdd.style.display = 'none';
    }
    
    // Скрываем форму при открытии страницы
    const formContainer = document.getElementById('add-form-container');
    if (formContainer) formContainer.style.display = 'none';

    loadAndRenderTasks();
}

// Загрузка данных и вывод списка
async function loadAndRenderTasks() {
    const container = document.getElementById('tasks-list-container');
    try {
        // Читаем вопросы через Worker
        const dataStr = await apiGet('questions');
        const data = JSON.parse(dataStr);
        
        let html = '';
        
        if (!data.categories || data.categories.length === 0) {
            html = '<p>Пока нет ни одного вопроса.</p>';
        } else {
            data.categories.forEach(cat => {
                html += `<h4 style="color:#0056b3; margin-top:20px;">${cat.name}</h4>`;
                html += '<ul style="list-style:none; padding-left:0;">';
                
                cat.questions.forEach(q => {
                    let typeName = "";
                    if (q.type === 'multiple_choice') typeName = "[Выбор]";
                    else if (q.type === 'text_input') typeName = "[Текст]";
                    else if (q.type === 'table_fill') typeName = "[Таблица]";
                    
                    html += `<li style="padding:8px; border-bottom:1px solid #eee;">
                                <strong>${typeName}</strong> ${q.text} 
                                <span style="float:right; color:#777; font-size:12px;">(${q.points} балл)</span>
                             </li>`;
                });
                html += '</ul>';
            });
        }
        
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p style="color:red;">Ошибка загрузки списка: ${e.message}</p>`;
    }
}

// Показать/скрыть форму добавления
function toggleAddForm() {
    const form = document.getElementById('add-form-container');
    if (form.style.display === 'none') {
        form.style.display = 'block';
        toggleTaskFields(); // Инициализируем поля формы
    } else {
        form.style.display = 'none';
    }
}

// --- НИЖЕ КОПИРУЕМ ЛОГИКУ СОЗДАНИЯ ВОПРОСА ИЗ ПРЕДЫДУЩЕЙ ИНСТРУКЦИИ ---
// Эти функции уже были написаны ранее, просто убедись, что они есть в файле.
// Если их нет — скопируй блок с toggleTaskFields, addMcOption, addTfRow, saveNewQuestion
// из моего предыдущего сообщения.

function toggleTaskFields() {
    const type = document.getElementById('task-type').value;
    const container = document.getElementById('dynamic-fields-container');
    let html = '';

    if (type === 'multiple_choice') {
        html = `
            <h4>Варианты ответов</h4>
            <div id="mc-options-list">
                <div class="mc-option-row"><input type="text" class="text-input mc-opt-val" placeholder="Вариант 1"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button></div>
                <div class="mc-option-row"><input type="text" class="text-input mc-opt-val" placeholder="Вариант 2"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button></div>
            </div>
            <button onclick="addMcOption()" class="btn-nav">+ Добавить вариант</button>
            <br><br>
            <label>Индекс правильного ответа (начинается с 0):</label>
            <input type="number" id="mc-correct-index" value="0" min="0" class="text-input" style="width:80px;">
        `;
    } 
    else if (type === 'text_input') {
        html = `
            <h4>Проверка ответа</h4>
            <label>Разрешённые ответы (через запятую):</label>
            <input type="text" id="ti-accepted" placeholder="ответ1, ответ2" class="text-input">
        `;
    } 
    else if (type === 'table_fill') {
        html = `
            <h4>Структура таблицы</h4>
            <label>Заголовки колонок (через запятую):</label>
            <input type="text" id="tf-headers" placeholder="Колонка 1, Колонка 2" class="text-input">
            <div id="tf-rows-list"></div>
            <button onclick="addTfRow()" class="btn-nav">+ Добавить строку данных</button>
        `;
    }
    container.innerHTML = html;
}

function addMcOption() {
    const list = document.getElementById('mc-options-list');
    const count = list.children.length + 1;
    const div = document.createElement('div');
    div.className = 'mc-option-row';
    div.innerHTML = `<input type="text" class="text-input mc-opt-val" placeholder="Вариант ${count}"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button>`;
    list.appendChild(div);
}

function addTfRow() {
    const list = document.getElementById('tf-rows-list');
    const idx = list.children.length;
    const div = document.createElement('div');
    div.style.marginBottom = '10px';
    div.style.border = '1px solid #eee';
    div.style.padding = '5px';
    div.innerHTML = `
        <strong>Строка ${idx + 1}</strong><br>
        <label>Метка:</label>
        <input type="text" class="text-input tf-label" placeholder="Напр.: Мышечная ткань">
        <label>Правильное значение:</label>
        <input type="text" class="text-input tf-value" placeholder="Напр.: Сокращение">
        <button onclick="this.parentElement.remove()" class="btn-nav" style="color:red; float:right;">Удалить</button>
        <div style="clear:both;"></div>
    `;
    list.appendChild(div);
}

async function saveNewQuestion() {
    const category = document.getElementById('task-category').value.trim();
    const type = document.getElementById('task-type').value;
    const text = document.getElementById('task-text').value.trim();
    const points = parseInt(document.getElementById('task-points').value) || 1;
    const statusEl = document.getElementById('task-status');

    if (!category || !text) {
        statusEl.innerText = "Ошибка: заполните тему и текст";
        statusEl.style.color = "red";
        return;
    }

    let questionObj = { id: Date.now(), type: type, text: text, points: points };

    try {
        if (type === 'multiple_choice') {
            const opts = Array.from(document.querySelectorAll('.mc-opt-val')).map(i => i.value.trim()).filter(v => v);
            const correctIdx = parseInt(document.getElementById('mc-correct-index').value);
            if (opts.length < 2) throw new Error("Нужно минимум 2 варианта");
            if (isNaN(correctIdx) || correctIdx < 0 || correctIdx >= opts.length) throw new Error(`Неверный индекс (от 0 до ${opts.length - 1})`);
            questionObj.options = opts;
            questionObj.correct_index = correctIdx;
        } 
        else if (type === 'text_input') {
            const accStr = document.getElementById('ti-accepted').value.trim();
            if (!accStr) throw new Error("Укажите правильный ответ");
            questionObj.accepted_answers = accStr.split(',').map(s => s.trim().toLowerCase());
        } 
        else if (type === 'table_fill') {
            const headersStr = document.getElementById('tf-headers').value.trim();
            if (!headersStr) throw new Error("Укажите заголовки");
            questionObj.headers = headersStr.split(',').map(h => h.trim());
            
            const rowEls = document.querySelectorAll('#tf-rows-list > div');
            if (rowEls.length === 0) throw new Error("Добавьте хотя бы одну строку");

            questionObj.rows = [];
            rowEls.forEach(el => {
                const label = el.querySelector('.tf-label').value.trim();
                const val = el.querySelector('.tf-value').value.trim();
                if (label && val) {
                    questionObj.rows.push({
                        key: `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        label: label,
                        correct_value: val
                    });
                }
            });
        }

        // Загружаем текущий JSON
        const currentJsonStr = await apiGet('questions');
        const data = JSON.parse(currentJsonStr);

        // Находим или создаем категорию
        let cat = data.categories.find(c => c.name.toLowerCase() === category.toLowerCase());
        if (!cat) {
            cat = { id: category.toLowerCase().replace(/\s+/g, '_'), name: category, questions: [] };
            data.categories.push(cat);
        }

        cat.questions.push(questionObj);

        // Сохраняем обратно
        await apiPut('questions', JSON.stringify(data, null, 2));

        statusEl.innerText = "Вопрос успешно добавлен!";
        statusEl.style.color = "green";
        
        setTimeout(() => {
            toggleAddForm(); // Закрываем форму
            loadAndRenderTasks(); // Обновляем список
        }, 1000);

    } catch (e) {
        console.error(e);
        statusEl.innerText = "Ошибка: " + e.message;
        statusEl.style.color = "red";
    }
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

// === ОТКРЫТИЕ ВКЛАДКИ ЗАДАНИЙ ===
function openTasksManager() {
    showPage('tasks-page');
    toggleTaskFields(); // Инициализируем динамические поля при открытии
}

// === ПЕРЕКЛЮЧЕНИЕ ПОЛЕЙ В ЗАВИСИМОСТИ ОТ ТИПА ===
function toggleTaskFields() {
    const type = document.getElementById('task-type').value;
    const container = document.getElementById('dynamic-fields-container');
    let html = '';

    if (type === 'multiple_choice') {
        html = `
            <h4>Варианты ответов</h4>
            <div id="mc-options-list">
                <div class="mc-option-row"><input type="text" class="text-input mc-opt-val" placeholder="Вариант 1"><button onclick="removeMcOption(this)" class="btn-nav" style="color:red;">-</button></div>
                <div class="mc-option-row"><input type="text" class="text-input mc-opt-val" placeholder="Вариант 2"><button onclick="removeMcOption(this)" class="btn-nav" style="color:red;">-</button></div>
            </div>
            <button onclick="addMcOption()" class="btn-nav">+ Добавить вариант</button>
            <br><br>
            <label>Правильный ответ (номер варианта, начиная с 0):</label>
            <input type="number" id="mc-correct-index" value="0" min="0" class="text-input" style="width:80px;">
        `;
    } 
    else if (type === 'text_input') {
        html = `
            <h4>Проверка ответа</h4>
            <label>Разрешённые варианты правильного ответа (через запятую):</label>
            <input type="text" id="ti-accepted" placeholder="ответ1, ответ2, Ответ1" class="text-input">
            <small style="color:#666;">Регистр игнорируется при проверке.</small>
        `;
    } 
    else if (type === 'table_fill') {
        html = `
            <h4>Структура таблицы</h4>
            <label>Заголовки колонок (через запятую):</label>
            <input type="text" id="tf-headers" placeholder="Столбец 1, Столбец 2" class="text-input">
            
            <div id="tf-rows-list">
                <!-- Строки добавляются кнопкой ниже -->
            </div>
            <button onclick="addTfRow()" class="btn-nav">+ Добавить строку данных</button>
        `;
    }

    container.innerHTML = html;
}

// --- Хелперы для Multiple Choice ---
function addMcOption() {
    const list = document.getElementById('mc-options-list');
    const count = list.children.length + 1;
    const div = document.createElement('div');
    div.className = 'mc-option-row';
    div.innerHTML = `<input type="text" class="text-input mc-opt-val" placeholder="Вариант ${count}"><button onclick="removeMcOption(this)" class="btn-nav" style="color:red;">-</button>`;
    list.appendChild(div);
}

function removeMcOption(btn) {
    btn.parentElement.remove();
}

// --- Хелперы для Table Fill ---
function addTfRow() {
    const list = document.getElementById('tf-rows-list');
    const idx = list.children.length;
    const div = document.createElement('div');
    div.style.marginBottom = '10px';
    div.style.border = '1px solid #eee';
    div.style.padding = '5px';
    div.innerHTML = `
        <strong>Строка ${idx + 1}</strong><br>
        <label>Метка (то, что видит ученик):</label>
        <input type="text" class="text-input tf-label" placeholder="Напр.: Мышечная ткань">
        <label>Правильное значение (для проверки):</label>
        <input type="text" class="text-input tf-value" placeholder="Напр.: Сокращение">
        <button onclick="this.parentElement.remove()" class="btn-nav" style="color:red; float:right;">Удалить строку</button>
        <div style="clear:both;"></div>
    `;
    list.appendChild(div);
}

// === СОХРАНЕНИЕ НОВОГО ВОПРОСА ===
async function saveNewQuestion() {
    const category = document.getElementById('task-category').value.trim();
    const type = document.getElementById('task-type').value;
    const text = document.getElementById('task-text').value.trim();
    const points = parseInt(document.getElementById('task-points').value) || 1;
    const statusEl = document.getElementById('task-status');

    if (!category || !text) {
        statusEl.innerText = "Ошибка: заполните тему и текст вопроса";
        statusEl.style.color = "red";
        return;
    }

    // Формируем объект вопроса в зависимости от типа
    let questionObj = {
        id: Date.now(), // Уникальный ID на основе времени
        type: type,
        text: text,
        points: points
    };

    try {
        if (type === 'multiple_choice') {
            const optionsInputs = document.querySelectorAll('.mc-opt-val');
            const correctIdxInput = document.getElementById('mc-correct-index');
            
            const options = Array.from(optionsInputs).map(inp => inp.value.trim()).filter(v => v !== "");
            const correctIndex = parseInt(correctIdxInput.value);

            if (options.length < 2) throw new Error("Нужно минимум 2 варианта ответа");
            if (isNaN(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
                throw new Error(`Неверный индекс правильного ответа (должен быть от 0 до ${options.length - 1})`);
            }

            questionObj.options = options;
            questionObj.correct_index = correctIndex;
        } 
        else if (type === 'text_input') {
            const acceptedStr = document.getElementById('ti-accepted').value.trim();
            if (!acceptedStr) throw new Error("Укажите хотя бы один правильный ответ");
            
            // Разбиваем по запятой, убираем пробелы, приводим к нижнему регистру для хранения эталонов
            questionObj.accepted_answers = acceptedStr.split(',').map(s => s.trim().toLowerCase());
        } 
        else if (type === 'table_fill') {
            const headersStr = document.getElementById('tf-headers').value.trim();
            if (!headersStr) throw new Error("Укажите заголовки колонок");
            
            questionObj.headers = headersStr.split(',').map(h => h.trim());
            
            const rowElements = document.querySelectorAll('#tf-rows-list > div');
            if (rowElements.length === 0) throw new Error("Добавьте хотя бы одну строку данных");

            questionObj.rows = [];
            rowElements.forEach(el => {
                const label = el.querySelector('.tf-label').value.trim();
                const value = el.querySelector('.tf-value').value.trim();
                if (label && value) {
                    questionObj.rows.push({
                        key: `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, // Генерируем уникальный ключ ячейки
                        label: label,
                        correct_value: value
                    });
                }
            });

            if (questionObj.rows.length === 0) throw new Error("Все строки пустые или некорректные");
        }

        // 1. Загружаем текущий questions.json
        const currentJsonStr = await apiGet('questions');
        const data = JSON.parse(currentJsonStr);

        // 2. Находим категорию или создаём новую
        let cat = data.categories.find(c => c.name.toLowerCase() === category.toLowerCase());
        if (!cat) {
            cat = {
                id: category.toLowerCase().replace(/\s+/g, '_'),
                name: category,
                questions: []
            };
            data.categories.push(cat);
        }

        // 3. Добавляем вопрос
        cat.questions.push(questionObj);

        // 4. Сохраняем обратно
        await apiPut('questions', JSON.stringify(data, null, 2));

        statusEl.innerText = "Вопрос успешно добавлен!";
        statusEl.style.color = "green";
        
        // Очищаем форму частично
        document.getElementById('task-text').value = "";
        document.getElementById('dynamic-fields-container').innerHTML = "";
        toggleTaskFields(); 

    } catch (e) {
        console.error(e);
        statusEl.innerText = "Ошибка: " + e.message;
        statusEl.style.color = "red";
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