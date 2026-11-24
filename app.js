// === КОНСТАНТЫ ===
const WORKER_URL = "https://biologycontest.kmaxim242.workers.dev"; // БЕЗ слэша!
const ADMIN_KEY  = "abema2342";

// === ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===
let allCategories = []; // Полная структура категорий для выбора тем
let questions = [];     // Плоский список вопросов текущего теста
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

// === ИСТОРИЯ ОТВЕТОВ (ГЛОБАЛЬНОЕ ХРАНЕНИЕ) ===
async function loadUserHistory(login) {
    try {
        const res = await fetch(`${WORKER_URL}/api/results/${login}`);
        if (!res.ok) return {}; 
        return JSON.parse(await res.text());
    } catch (e) {
        console.error("Ошибка загрузки истории:", e);
        return {};
    }
}

async function saveUserHistory(login, historyData) {
    try {
        await apiPut(`results/${login}`, JSON.stringify(historyData, null, 2));
    } catch (e) {
        console.error("Ошибка сохранения истории:", e);
    }
}

// === ЗАГРУЗКА ДАННЫХ ===
async function loadData() {
    try {
        const data = JSON.parse(await apiGet("questions"));
        
        // Сохраняем полную структуру категорий
        allCategories = data.categories || [];
        
        // Плоский список вопросов (для старых функций, если они еще используются)
        questions = allCategories.flatMap(c => c.questions);
        
        console.log(`Загружено ${allCategories.length} категорий, всего ${questions.length} вопросов`);
        
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

// === ОБНОВЛЕНИЕ UI ПОД ТЕКУЩЕГО ПОЛЬЗОВАТЕЛЯ ===
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

// === НАВИГАЦИЯ ПО СТРАНИЦАМ ===
function showPage(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) target.classList.add("active");
}

function goHome() {
    showPage("home");
}

// === ЛОГИКА ВЫБОРА ТЕМ И СТАРТА ТЕСТА ===

// Кнопка в меню "Начать тест" -> Показывает экран выбора
function startTest() {
    if (!currentUser) {
        alert("Сначала войдите в аккаунт!");
        return;
    }
    if (!allCategories || allCategories.length === 0) {
        alert("Нет доступных вопросов.");
        return;
    }

    // Переключаемся на страницу теста
    showPage("contest");
    
    // Показываем только экран выбора, скрываем сам тест
    const topicScreen = document.getElementById('topic-selection-screen');
    const testScreen = document.getElementById('test-running-screen');
    
    if (topicScreen) topicScreen.style.display = 'block';
    if (testScreen) testScreen.style.display = 'none';
    
    renderTopicSelection(); // Рисуем чекбоксы
}

// Функция отрисовки чекбоксов тем
function renderTopicSelection() {
    const container = document.getElementById('topics-checkbox-list');
    if (!container) return;

    let html = '';
    allCategories.forEach((cat, index) => {
        html += `
            <label style="display:block; margin:5px 0; cursor:pointer; padding:5px; border-radius:3px; transition:background 0.2s;" onmouseover="this.style.background='#eef'" onmouseout="this.style.background='transparent'">
                <input type="checkbox" class="topic-check" value="${index}" checked> 
                <strong>${cat.name}</strong> (${cat.questions.length} вопр.)
            </label>
        `;
    });
    
    container.innerHTML = html;
}

// Запуск теста по выбранным темам
function startSelectedTest() {
    const checkboxes = document.querySelectorAll('.topic-check:checked');
    if (checkboxes.length === 0) {
        alert("Выберите хотя бы одну тему!");
        return;
    }
    
    // Собираем вопросы из выбранных категорий
    let selectedQuestions = [];
    checkboxes.forEach(cb => {
        const catIndex = parseInt(cb.value);
        const cat = allCategories[catIndex];
        if (cat && cat.questions) {
            selectedQuestions = selectedQuestions.concat(cat.questions);
        }
    });
    
    if (selectedQuestions.length === 0) {
        alert("В выбранных темах нет вопросов.");
        return;
    }
    
    // Подменяем глобальный массив вопросов для текущего теста
    questions = selectedQuestions;
    currentQIndex = 0;
    userAnswers = {}; 
    
    // Переключаем экраны
    document.getElementById('topic-selection-screen').style.display = 'none';
    document.getElementById('test-running-screen').style.display = 'block';
    
    renderQ();
}

// Запуск полного теста (все вопросы подряд)
function startFullTest() {
    // Берем все вопросы из всех категорий
    questions = allCategories.flatMap(c => c.questions);
    currentQIndex = 0;
    userAnswers = {};
    
    // Переключаем экраны
    document.getElementById('topic-selection-screen').style.display = 'none';
    document.getElementById('test-running-screen').style.display = 'block';
    
    renderQ();
}

// === ОТРИСОВКА ВОПРОСА ===
function renderQ() {
    if (!questions || questions.length === 0) return;
    
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
		
		// Шапка таблицы
		html += `<thead><tr>${q.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>`;
		
		// Тело таблицы
		html += `<tbody>`;
		q.rows.forEach((r, rowIndex) => {
			html += `<tr>`;
			r.cells.forEach((cell, colIndex) => {
				const uniqueKey = `${q.id}_r${rowIndex}_c${colIndex}`;
				
				if (cell.is_hint) {
					// Подсказка: показываем текст, поле ввода скрыто
					html += `<td style="background:#eef5ff; color:#004085; font-weight:bold;">${cell.value}</td>`;
				} else {
					// Поле для ввода учеником
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
    
    // Блокировка кнопок навигации
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    if (btnPrev) btnPrev.disabled = currentQIndex === 0;
    if (btnNext) btnNext.disabled = currentQIndex === questions.length - 1;
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
async function finishTest() {
    let score = 0;
    let maxScore = 0;
    
    // 1. Собираем данные для отображения разбора
    const reviewItems = [];

    questions.forEach(q => {
        maxScore += q.points;
        const ans = userAnswers[q.id];
        let isCorrect = false;
        let detailText = "";

        if (q.type === "multiple_choice") {
            isCorrect = (ans === q.correct_index);
            const userOpt = (ans !== undefined && ans !== null) ? q.options[ans] : "(нет ответа)";
            const correctOpt = q.options[q.correct_index];
            detailText = `Ваш ответ: ${userOpt} | Правильный: ${correctOpt}`;
        } 
        else if (q.type === "text_input") {
            if (ans && q.accepted_answers) {
                const normalizedAns = String(ans).toLowerCase().trim();
                isCorrect = q.accepted_answers.some(acc => acc.toLowerCase().trim() === normalizedAns);
            }
            detailText = `Ваш ответ: ${ans || "(пусто)"} | Правильные: ${(q.accepted_answers || []).join(", ")}`;
        } 
		else if (q.type === "table_fill" && ans) {
			let correctCells = 0;
			let totalTaskCells = 0; 
			
			q.rows.forEach((r, rowIndex) => {
				r.cells.forEach((cell, colIndex) => {
					// Пропускаем подсказки — они не влияют на оценку
					if (cell.is_hint) return; 
					
					totalTaskCells++;
					const uniqueKey = `${q.id}_r${rowIndex}_c${colIndex}`;
					const userVal = (ans[uniqueKey] || "").toLowerCase().trim();
					const correctVal = (cell.value || "").toLowerCase();
					
					// Проверка на частичное или полное совпадение
					if (userVal && (userVal.includes(correctVal) || correctVal.includes(userVal))) {
						correctCells++;
					}
				});
			});
			
			// Начисляем баллы пропорционально заполненным ячейкам
			if (totalTaskCells > 0) {
				score += Math.round((correctCells / totalTaskCells) * q.points);
			}
		}

        if (isCorrect) {
            score += q.points;
        }

        // Формируем объект для рендера
        reviewItems.push({
            text: q.text,
            points: q.points,
            isCorrect: isCorrect,
            detail: detailText,
            type: q.type
        });
    });

    // 2. Расчет процентов и вывод итогового счета
    const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    document.getElementById("score-display").innerText =
        `Итог: ${score} из ${maxScore} баллов (${percent}%)`;
    
    // 3. Генерация HTML списка разбора (в стиле вкладки "Все задания")
    const container = document.getElementById('review-list-container');
    if (container) {
        let html = '<ul class="tasks-list">'; 
        
        reviewItems.forEach(item => {
            let typeName = "";
            if (item.type === 'multiple_choice') typeName = "[Выбор]";
            else if (item.type === 'text_input') typeName = "[Текст]";
            else if (item.type === 'table_fill') typeName = "[Таблица]";

            // Определяем класс статуса для цветной полоски слева
            const statusClass = item.isCorrect ? "status-correct" : "status-wrong";
            
            html += `
                <li class="tasks-item ${statusClass}">
                    <div style="flex-grow:1; padding-left: 10px;">
                        <span class="task-type-badge">${typeName}</span> 
                        <strong>${item.text}</strong>
                        <div style="margin-top:5px; font-size:13px; color:#666;">${item.detail}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; padding-right: 10px;">
                        <span class="task-points">${item.points} балл</span>
                        <span style="font-weight:bold; color:${item.isCorrect ? '#28a745' : '#dc3545'}; font-size:18px;">
                            ${item.isCorrect ? '✓' : '✗'}
                        </span>
                    </div>
                </li>
            `;
        });
        
        html += '</ul>';
        container.innerHTML = html;
    }

    // 4. СОХРАНЕНИЕ ИСТОРИИ НА СЕРВЕР (GitHub через Worker)
    if (currentUser) {
        try {
            // Загружаем старую историю пользователя
            let currentHistory = await loadUserHistory(currentUser.login);
            
            // Обновляем ответы в истории новыми данными
            Object.assign(currentHistory, userAnswers);
            
            // Сохраняем обратно
            await saveUserHistory(currentUser.login, currentHistory);
        } catch (e) {
            console.error("Не удалось сохранить историю:", e);
            // Не блокируем показ результатов, если сохранение упало
        }
    }

    // 5. Переключение на страницу результатов
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

    // Загружаем историю перед рендером
    let userHistory = {};
    if (currentUser) {
        userHistory = await loadUserHistory(currentUser.login);
    }
    
    loadAndRenderTasks(userHistory);
}

async function loadAndRenderTasks(userHistory = {}) {
    const container = document.getElementById('tasks-list-container');
    try {
        const dataStr = await apiGet('questions');
        const data = JSON.parse(dataStr);
        
        let html = '';
        if (!data.categories || data.categories.length === 0) {
            html = '<p>Пока нет ни одного вопроса.</p>';
        } else {
            const isAdmin = currentUser && currentUser.role === 'admin';

            data.categories.forEach((cat, catIndex) => {
                html += `<h4 class="task-category-header">${cat.name}</h4>`;
                html += '<ul class="tasks-list">';
                
                cat.questions.forEach((q, qIndexInCat) => {
                    let typeName = "";
                    if (q.type === 'multiple_choice') typeName = "[Выбор]";
                    else if (q.type === 'text_input') typeName = "[Текст]";
                    else if (q.type === 'table_fill') typeName = "[Таблица]";
                    
                    // Проверяем статус ответа из истории
                    let statusClass = "";
                    const savedAns = userHistory[q.id];
                    
                    if (savedAns !== undefined) {
                        // Логика проверки правильности (упрощенная, та же что в finishTest)
                        let isCorrect = false;
                        
                        if (q.type === 'multiple_choice') {
                            isCorrect = (savedAns === q.correct_index);
                        } else if (q.type === 'text_input') {
                            if (q.accepted_answers && Array.isArray(q.accepted_answers)) {
                                const normalizedAns = String(savedAns).toLowerCase().trim();
                                isCorrect = q.accepted_answers.some(acc => acc.toLowerCase().trim() === normalizedAns);
                            }
                        } 
                        // Для table_fill проверка сложнее, здесь ставим просто факт наличия ответа
                        // Можно доработать позже
                        
                        statusClass = isCorrect ? "status-correct" : "status-wrong";
                    }

                    html += `<li class="tasks-item ${statusClass}">`;
                    
                    html += `<div style="flex-grow:1; padding-left: 10px;">
                                <span class="task-type-badge">${typeName}</span> ${q.text} 
                             </div>`;
                    
                    html += `<div style="display:flex; align-items:center; gap:10px; padding-right: 10px;">`;
                    html += `<span class="task-points">${q.points} балл</span>`;
                    
                    if (isAdmin) {
                        html += `<button onclick="editQuestion(${catIndex}, ${qIndexInCat})" 
                                         class="btn-nav" 
                                         style="background:#ffc107; color:black; border:none; padding:4px 8px; cursor:pointer; font-size:12px; border-radius:3px;">
                                     Изменить
                                 </button>`;
                        html += `<button onclick="deleteQuestion('${cat.id}', ${qIndexInCat})" 
                                         class="btn-nav" 
                                         style="background:#d9534f; color:white; border:none; padding:4px 8px; cursor:pointer; font-size:12px; border-radius:3px;">
                                     Удалить
                                 </button>`;
                    }
                    
                    html += `</div></li>`;
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
        
        // Перезагружаем историю и список
        let userHistory = {};
        if (currentUser) {
            userHistory = await loadUserHistory(currentUser.login);
        }
        loadAndRenderTasks(userHistory);
        
    } catch (e) {
        console.error(e);
        alert("Ошибка сохранения изменений: " + e.message);
    }
}

// Функция редактирования вопроса (заглушка, так как полная реализация требует сложной формы)
function editQuestion(catIndex, qIndex) {
    alert("Функция редактирования пока в разработке. Используйте вкладку 'Редактор JSON'.");
}

function toggleAddForm() {
    const form = document.getElementById('add-form-container');
    if (form.style.display === 'none') {
        form.style.display = 'block';
        toggleTaskFields();
    } else {
        form.style.display = 'none';
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
    div.style.marginBottom = '10px';
    div.style.border = '1px solid #eee';
    div.style.padding = '5px';
    
    let cellsHtml = '';
    cols.forEach((colName, i) => {
        cellsHtml += `
            <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px dotted #ccc;">
                <label><b>Колонка ${i+1}: ${colName.trim()}</b></label><br>
                <input type="text" class="text-input tf-cell-val" placeholder="Введите правильный ответ..." style="width:70%; display:inline-block;">
                <label style="display:inline-block; margin-left:10px;">
                    <input type="checkbox" class="tf-cell-hint"> Подсказка?
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
				const cellVals = el.querySelectorAll('.tf-cell-val');
				const cellHints = el.querySelectorAll('.tf-cell-hint');
				
				const rowData = { cells: [] };
				
				for(let i=0; i<cellVals.length; i++) {
					rowData.cells.push({
						value: cellVals[i].value.trim(),
						is_hint: cellHints[i].checked
					});
				}
				
				if(rowData.cells.some(c => c.value !== "" || c.is_hint)) {
					questionObj.rows.push(rowData);
				}
			});
			
			if(questionObj.rows.length === 0) throw new Error("Все строки пустые");
		}

        const currentJsonStr = await apiGet('questions');
        const data = JSON.parse(currentJsonStr);

        let cat = data.categories.find(c => c.name.toLowerCase() === category.toLowerCase());
        if (!cat) {
            cat = { id: category.toLowerCase().replace(/\s+/g, '_'), name: category, questions: [] };
            data.categories.push(cat);
        }

        cat.questions.push(questionObj);

        await apiPut('questions', JSON.stringify(data, null, 2));

        statusEl.innerText = "Вопрос успешно добавлен!";
        statusEl.style.color = "green";
        
        setTimeout(() => {
            toggleAddForm();
            openTasksList(); // Обновляем список с историей
        }, 1000);

    } catch (e) {
        console.error(e);
        statusEl.innerText = "Ошибка: " + e.message;
        statusEl.style.color = "red";
    }
}

// === ИНИЦИАЛИЗАЦИЯ ===
window.onload = async () => {
    await loadData(); 
    
    const savedUser = localStorage.getItem("biology_user");
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            updateUIForLoggedInUser();
        } catch {
            currentUser = null;
            localStorage.removeItem("biology_user");
        }
    }
};