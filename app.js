// === КОНСТАНТЫ ===
const WORKER_URL = "https://biologycontest.kmaxim242.workers.dev"; // БЕЗ слэша!
const ADMIN_KEY  = "abema2342";

// === ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===
let questions = [];
let currentUser = null;
let currentQIndex = 0;
let userAnswers = {};

// === ТРАНСПОРТ ДО WORKER ===
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
        const data = JSON.parse(await apiGet("questions"));
        questions = data.categories.flatMap(c => c.questions);
        console.log(`Загружено ${questions.length} вопросов`);
    } catch (e) {
        console.error("Ошибка загрузки:", e);
        alert("Не удалось загрузить вопросы.");
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
        const users = JSON.parse(await apiGet("users"));
        const user = users.find(u => u.login === l && u.password === p);
        
        if (user) {
            currentUser = user;
            localStorage.setItem("biology_user", JSON.stringify(user));
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

// === ОБНОВЛЕНИЕ UI ===
function updateUIForLoggedInUser() {
    const authSection = document.getElementById("auth-section");
    const userInfo = document.getElementById("user-info");
    const nameSpan = document.getElementById("username-display");
    const adminLink = document.getElementById("admin-link");
    const accountsLink = document.getElementById("accounts-link");
    const tasksBtn = document.getElementById("btn-add-question");

    if (currentUser) {
        if (authSection) authSection.style.display = "none";
        if (userInfo) userInfo.style.display = "block";
        if (nameSpan) nameSpan.innerText = currentUser.name;
        
        const isAdmin = currentUser.role === "admin";
        if (adminLink) adminLink.style.display = isAdmin ? "block" : "none";
        if (accountsLink) accountsLink.style.display = isAdmin ? "block" : "none";
        if (tasksBtn) tasksBtn.style.display = isAdmin ? "inline-block" : "none";
    } else {
        if (authSection) authSection.style.display = "block";
        if (userInfo) userInfo.style.display = "none";
        if (adminLink) adminLink.style.display = "none";
        if (accountsLink) accountsLink.style.display = "none";
        if (tasksBtn) tasksBtn.style.display = "none";
    }
}

// === НАВИГАЦИЯ ===
function showPage(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) target.classList.add("active");
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
		html += `<table class="table-fill">`;
		
		// Header
		html += `<thead><tr>${q.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>`;
		
		// Body
		html += `<tbody>`;
		q.rows.forEach((r, rowIndex) => {
			html += `<tr>`;
			r.cells.forEach((cell, colIndex) => {
				const uniqueKey = `${q.id}_r${rowIndex}_c${colIndex}`;
				
				if (cell.is_hint) {
					// Уже заполнено учеником видеть не может менять
					html += `<td style="background:#eef5ff; color:#004085; font-weight:bold;">${cell.value}</td>`;
				} else {
					// Пустое поле для ввода
					const userVal = (userAnswers[q.id] && userAnswers[q.id][uniqueKey]) || "";
					html += `<td><input type="text" class="text-input" value="${userVal}" 
							 onchange="saveTableAnswer('${q.id}', '${uniqueKey}', this.value)" 
							 placeholder="..."></td>`;
				}
			});
			html += `</tr>`;
		});
		html += `</tbody></table>`;
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
			let totalTaskCells = 0; 
			
			q.rows.forEach((r, rowIndex) => {
				r.cells.forEach((cell, colIndex) => {
					// Пропускаем подсказки
					if (cell.is_hint) return; 
					
					totalTaskCells++;
					const uniqueKey = `${q.id}_r${rowIndex}_c${colIndex}`;
					const userVal = (ans[uniqueKey] || "").toLowerCase().trim();
					const correctVal = (cell.value || "").toLowerCase();
					
					if (userVal && (userVal.includes(correctVal) || correctVal.includes(userVal))) {
						correctCells++;
					}
				});
			});
			
			if (totalTaskCells > 0) {
				score += Math.round((correctCells / totalTaskCells) * q.points);
			}
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
        .catch(e => { document.getElementById("save-status").innerText = "Ошибка: " + e.message; });
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
            `<p style="color:red;">Ошибка загрузки: ${e.message}</p>`;
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
        openAccountsManager();
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
        openAccountsManager();
    } catch (e) {
        alert("Ошибка сохранения: " + e.message);
    }
}

// === ВКЛАДКА ЗАДАНИЯ (СПИСОК И ДОБАВЛЕНИЕ) ===
async function openTasksList() {
    showPage('tasks-page');
    
    const btnAdd = document.getElementById('btn-add-question');
    if (currentUser && currentUser.role === 'admin') {
        if (btnAdd) btnAdd.style.display = 'inline-block';
    } else {
        if (btnAdd) btnAdd.style.display = 'none';
    }
    
    const formContainer = document.getElementById('add-form-container');
    if (formContainer) formContainer.style.display = 'none';

    loadAndRenderTasks();
}

async function loadAndRenderTasks() {
    const container = document.getElementById('tasks-list-container');
    try {
        const dataStr = await apiGet('questions');
        const data = JSON.parse(dataStr);
        
        let html = '';
        if (!data.categories || data.categories.length === 0) {
            html = '<p>Пока нет ни одного вопроса.</p>';
        } else {
            const isAdmin = currentUser && currentUser.role === 'admin';

			// ... внутри loadAndRenderTasks ...
			data.categories.forEach((cat, catIndex) => {
				html += `<h4 style="color:#0056b3; margin-top:20px;">${cat.name}</h4>`;
				html += '<ul style="list-style:none; padding-left:0;">';
				
				cat.questions.forEach((q, qIndexInCat) => {
					let typeName = "";
					if (q.type === 'multiple_choice') typeName = "[Выбор]";
					else if (q.type === 'text_input') typeName = "[Текст]";
					else if (q.type === 'table_fill') typeName = "[Таблица]";
					
					// Базовый элемент списка
					let liHtml = `<li style="padding:8px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center;">`;
					
					// Текст вопроса слева
					liHtml += `<div><strong>${typeName}</strong> ${q.text} 
								<span style="color:#777; font-size:12px; margin-left:10px;">(${q.points} балл)</span></div>`;
					
					// Кнопки действий справа (только для админа)
					if (isAdmin) {
						liHtml += `
							<div style="display:flex; gap:5px;">
								<button onclick="editQuestion(${catIndex}, ${qIndexInCat})" 
										class="btn-nav" 
										style="background:#ffc107; color:black; border:none; padding:4px 8px; cursor:pointer; font-size:12px;">
									Изменить
								</button>
								<button onclick="deleteQuestion('${cat.id}', ${qIndexInCat})" 
										class="btn-nav" 
										style="background:#d9534f; color:white; border:none; padding:4px 8px; cursor:pointer; font-size:12px;">
									Удалить
								</button>
							</div>
						`;
					}
					
					liHtml += `</li>`;
					html += liHtml;
				});
				html += '</ul>';
			});
			// ... конец цикла ...
        }
        
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p style="color:red;">Ошибка загрузки списка: ${e.message}</p>`;
    }
}

async function deleteQuestion(categoryId, questionIndex) {
    if (!confirm("Точно удалить этот вопрос?")) return;

    try {
        const currentJsonStr = await apiGet('questions');
        const data = JSON.parse(currentJsonStr);

        const catIndex = data.categories.findIndex(c => c.id === categoryId);
        if (catIndex === -1) {
            alert("Ошибка: категория не найдена.");
            return;
        }

        const category = data.categories[catIndex];

        if (questionIndex < 0 || questionIndex >= category.questions.length) {
            alert("Ошибка: индекс вопроса неверен.");
            return;
        }

        category.questions.splice(questionIndex, 1);

        await apiPut('questions', JSON.stringify(data, null, 2));
        loadAndRenderTasks();
        
    } catch (e) {
        console.error(e);
        alert("Ошибка сохранения изменений: " + e.message);
    }
}

let editingContext = null; // Глобальная переменная для хранения контекста редактирования

async function editQuestion(catIndex, qIndex) {
    try {
        // 1. Загружаем актуальные данные
        const dataStr = await apiGet('questions');
        const data = JSON.parse(dataStr);
        
        const category = data.categories[catIndex];
        const question = category.questions[qIndex];
        
        if (!question) throw new Error("Вопрос не найден");

        // 2. Сохраняем контекст для функции saveNewQuestion
        editingContext = { catIndex, qIndex, originalData: data };

        // 3. Открываем форму
        toggleAddForm(true); // Принудительно открываем
        
        // 4. Заполняем базовые поля
        document.getElementById('task-category').value = category.name;
        document.getElementById('task-type').value = question.type;
        document.getElementById('task-text').value = question.text;
        document.getElementById('task-points').value = question.points;
        
        // Меняем заголовок формы и текст кнопки
        const formTitle = document.querySelector('#add-form-container h4');
        if(formTitle) formTitle.innerText = "Редактирование вопроса";
        
        const saveBtn = document.querySelector('#add-form-container button.btn-primary');
        if(saveBtn) saveBtn.innerText = "Сохранить изменения";

        // 5. Инициализируем динамические поля под тип вопроса
        toggleTaskFields(); 
        
        // 6. Заполняем специфичные поля
        setTimeout(() => fillSpecificFields(question), 100); // Небольшая задержка для рендера DOM

    } catch (e) {
        console.error(e);
        alert("Ошибка загрузки данных для редактирования: " + e.message);
    }
}

function fillSpecificFields(q) {
    if (q.type === 'multiple_choice') {
        const list = document.getElementById('mc-options-list');
        list.innerHTML = ''; // Очищаем дефолтные два варианта
        
        q.options.forEach(opt => {
            addMcOption(opt); // Вызываем нашу хелпер-функцию, но передаем значение
        });
        
        document.getElementById('mc-correct-index').value = q.correct_index;
    } 
    else if (q.type === 'text_input') {
        document.getElementById('ti-accepted').value = q.accepted_answers.join(', ');
    } 
    else if (q.type === 'table_fill') {
        document.getElementById('tf-headers').value = q.headers.join(', ');
        
        const rowsList = document.getElementById('tf-rows-list');
        rowsList.innerHTML = ''; // Очищаем
        
        q.rows.forEach(r => {
            addTfRowWithData(r); // Специальная функция для заполнения строки
        });
    }
}

// Хелперы для заполнения полей данными

function addMcOption(value = "") {
    const list = document.getElementById('mc-options-list');
    const count = list.children.length + 1;
    const div = document.createElement('div');
    div.className = 'mc-option-row';
    div.innerHTML = `
        <input type="text" class="text-input mc-opt-val" value="${value}" placeholder="Вариант ${count}">
        <button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button>
    `;
    list.appendChild(div);
}

function addTfRowWithData(rowData) {
    const list = document.getElementById('tf-rows-list');
    const idx = list.children.length;
    const div = document.createElement('div');
    div.style.marginBottom = '10px';
    div.style.border = '1px solid #eee';
    div.style.padding = '5px';
    
    div.innerHTML = `
        <strong>Строка ${idx + 1}</strong><br>
        <label>Метка:</label>
        <input type="text" class="text-input tf-label" value="${rowData.label || ''}">
        <label>Правильное значение:</label>
        <input type="text" class="text-input tf-value" value="${rowData.correct_value || ''}">
        <label style="display:block; margin-top:5px;">
            <input type="checkbox" class="tf-is-hint" ${rowData.is_hint ? 'checked' : ''}> Это подсказка
        </label>
        <button onclick="this.parentElement.remove()" class="btn-nav" style="color:red; float:right;">Удалить</button>
        <div style="clear:both;"></div>
    `;
    list.appendChild(div);
}

function toggleAddForm(forceOpen = false) {
    const form = document.getElementById('add-form-container');
    
    // Если принудительно открыть или форма скрыта -> показать
    if (forceOpen || form.style.display === 'none') {
        form.style.display = 'block';
        toggleTaskFields(); // Инициализируем пустые поля (если не редактируем)
    } else {
        form.style.display = 'none';
        // При закрытии очищаем контекст, если пользователь передумал
        editingContext = null; 
        resetFormUI();
    }
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
    const headersInput = document.getElementById('tf-headers').value.trim();
    
    if (!headersInput) {
        alert("Сначала заполните заголовки колонок!");
        return;
    }
    
    const cols = headersInput.split(',');
    const idx = list.children.length;
    
    const div = document.createElement('div');
    div.style.marginBottom = '15px';
    div.style.border = '1px solid #ddd';
    div.style.padding = '10px';
    div.style.background = '#fafafa';
    
    let cellsHtml = '';
    cols.forEach((colName, i) => {
        cellsHtml += `
            <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dotted #ccc;">
                <label><b>Колонка ${i+1}: ${colName.trim()}</b></label><br>
                <input type="text" class="text-input tf-cell-val" placeholder="Введите правильный ответ..." style="width:70%; display:inline-block;">
                <label style="display:inline-block; margin-left:10px;">
                    <input type="checkbox" class="tf-cell-hint"> Подсказка (ученик не вводит)
                </label>
            </div>
        `;
    });

    div.innerHTML = `
        <strong>Строка ${idx + 1}</strong>
        ${cellsHtml}
        <button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">Удалить строку</button>
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

    // Собираем объект вопроса (логика та же, что и раньше)
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
                const isHint = el.querySelector('.tf-is-hint').checked;
                
                if (label && val) {
                    questionObj.rows.push({
                        key: `row_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                        label: label,
                        correct_value: val,
                        is_hint: isHint
                    });
                }
            });
        }

        // --- ЛОГИКА СОХРАНЕНИЯ ---
        
        // 1. Получаем свежие данные с сервера
        const currentJsonStr = await apiGet('questions');
        const data = JSON.parse(currentJsonStr);

        if (editingContext) {
            // РЕЖИМ РЕДАКТИРОВАНИЯ
            const catIndex = editingContext.catIndex;
            const qIndex = editingContext.qIndex;
            
            // Проверяем, не изменилась ли категория (название)
            // Если название категории изменилось, нам нужно найти новую категорию или создать её
            let targetCat = data.categories.find(c => c.name.toLowerCase() === category.toLowerCase());
            
            if (!targetCat) {
                // Категории с таким именем больше нет (или было опечатка/изменение имени)
                // Создаем новую
                targetCat = { id: category.toLowerCase().replace(/\s+/g, '_'), name: category, questions: [] };
                data.categories.push(targetCat);
                
                // Перемещаем вопрос в новую категорию, удаляя из старой
                const oldCat = data.categories[catIndex];
                if(oldCat) {
                     oldCat.questions.splice(qIndex, 1); // Удаляем из старой
                }
                targetCat.questions.push(questionObj); // Добавляем в новую
                
            } else {
                // Категория существует. Обновляем вопрос по индексу.
                // ВАЖНО: Индекс мог измениться, если кто-то другой правил файл параллельно.
                // Но для школьного проекта обычно достаточно простого splice/push.
                
                // Находим старый вопрос по ID, чтобы быть уверенным
                const existingQIndex = targetCat.questions.findIndex(q => q.id === editingContext.originalData.categories[catIndex].questions[qIndex].id);
                
                if (existingQIndex !== -1) {
                    targetCat.questions[existingQIndex] = questionObj; // Заменяем
                } else {
                    targetCat.questions.push(questionObj); // Добавляем, если не нашли (странность)
                }
            }

        } else {
            // РЕЖИМ ДОБАВЛЕНИЯ (старая логика)
            let cat = data.categories.find(c => c.name.toLowerCase() === category.toLowerCase());
            if (!cat) {
                cat = { id: category.toLowerCase().replace(/\s+/g, '_'), name: category, questions: [] };
                data.categories.push(cat);
            }
            cat.questions.push(questionObj);
        }

        // 2. Отправляем обновленный JSON на GitHub
        await apiPut('questions', JSON.stringify(data, null, 2));

        statusEl.innerText = editingContext ? "Вопрос успешно обновлен!" : "Вопрос успешно добавлен!";
        statusEl.style.color = "green";
        
        // 3. Сбрасываем контекст и закрываем форму
        setTimeout(() => {
            editingContext = null; // Важно очистить!
            resetFormUI();         // Возвращаем заголовки/кнопки в исходное состояние
            toggleAddForm(false);  // Закрываем форму
            loadAndRenderTasks();  // Обновляем список
        }, 1000);

    } catch (e) {
        console.error(e);
        statusEl.innerText = "Ошибка: " + e.message;
        statusEl.style.color = "red";
    }
}

// Вспомогательная функция для сброса UI формы после редактирования
function resetFormUI() {
    const formTitle = document.querySelector('#add-form-container h4');
    if(formTitle) formTitle.innerText = "Новый вопрос";
    
    const saveBtn = document.querySelector('#add-form-container button.btn-primary');
    if(saveBtn) saveBtn.innerText = "Сохранить вопрос";
}

// === ИНИЦИАЛИЗАЦИЯ ===
window.onload = async () => {
    await loadData();
    
    const savedUser = localStorage.getItem("biology_user");
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
        } catch {
            currentUser = null;
            localStorage.removeItem("biology_user");
        }
    }
    
    updateUIForLoggedInUser();
};