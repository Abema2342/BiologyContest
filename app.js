// === КОНСТАНТЫ ===
const WORKER_URL = "https://biologycontest.kmaxim242.workers.dev";
const ADMIN_KEY  = "abema2342";

// === ГЛОБАЛЬНОЕ СОСТОЯНИЕ ===
let allCategories = [];
let questions = [];
let currentUser = null;
let currentQIndex = 0;
let userAnswers = {};
let editingContext = null;

// === ТРАНСПОРТ ДО WORKER ===
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

async function apiPost(route, bodyObj) {
    const r = await fetch(`${WORKER_URL}/api/${route}`, {
        method: "POST",
        headers: { 
            "X-Admin-Key": ADMIN_KEY, 
            "X-Reviewer": currentUser ? currentUser.login : "unknown",
            "Content-Type": "application/json" 
        },
        body: JSON.stringify(bodyObj)
    });
    if (!r.ok) throw new Error(`POST ${route}: ${r.status} ${await r.text()}`);
    return r.json();
}

// === ИСТОРИЯ ОТВЕТОВ ===
async function loadUserHistory(login) {
    try {
        const res = await fetch(`${WORKER_URL}/api/results/${login}`);
        if (!res.ok) return {};
        return JSON.parse(await res.text());
    } catch (e) { return {}; }
}

async function saveUserHistory(login, historyData) {
    try {
        await apiPut(`results/${login}`, JSON.stringify(historyData, null, 2));
    } catch (e) {
        console.error("Ошибка сохранения истории:", e);
    }
}

// === МОДЕРАЦИЯ (SUBMISSIONS) ===
async function loadSubmissions() {
    try {
        const res = await fetch(`${WORKER_URL}/api/submissions`);
        if (!res.ok) return [];
        return JSON.parse(await res.text());
    } catch (e) { return []; }
}

async function updateSubmissionStatus(submissionId, status) {
    try {
        await apiPost(`submissions/${submissionId}`, { status });
    } catch (e) {
        console.error("Ошибка обновления статуса:", e);
    }
}

async function submitForModeration(question, answer) {
    if (!currentUser) return;
    
    const submission = {
        id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        questionId: question.id,
        questionText: question.text,
        questionType: question.type,
        userId: currentUser.login,
        userName: currentUser.name,
        answer: answer,
        correctAnswer: question.type === 'table_fill' 
            ? question.rows.map(r => r.cells.map(c => c.value).join(' / ')).join('; ')
            : (question.accepted_answers || []).join(', '),
        timestamp: new Date().toISOString(),
        status: "pending"
    };
    
    try {
        const subs = await loadSubmissions();
        subs.push(submission);
        await apiPut('submissions', JSON.stringify(subs, null, 2));
    } catch (e) {
        console.error("Ошибка отправки на модерацию:", e);
    }
}

// === ЗАГРУЗКА ДАННЫХ ===
async function loadData() {
    try {
        const data = JSON.parse(await apiGet("questions"));
        allCategories = data.categories || [];
        questions = allCategories.flatMap(c => c.questions);
    } catch (e) {
        console.error("Ошибка загрузки:", e);
        alert("Не удалось загрузить вопросы.");
    }
}

// === АВТОРИЗАЦИЯ ===
async function performLogin() {
    const l = document.getElementById("login-input").value.trim();
    const p = document.getElementById("pass-input").value.trim();
    if (!l || !p) { alert("Введите логин и пароль"); return; }
    try {
        const users = JSON.parse(await apiGet("users"));
        const user = users.find(u => u.login === l && u.password === p);
        if (user) {
            currentUser = user;
            localStorage.setItem("biology_user", JSON.stringify(user));
            updateUIForLoggedInUser();
            showPage("home");
        } else { alert("Неверный логин или пароль"); }
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
    const moderationLink = document.getElementById("moderation-link");

    if (currentUser) {
        if (authSection) authSection.style.display = "none";
        if (userInfo) userInfo.style.display = "block";
        if (nameSpan) nameSpan.innerText = currentUser.name;
        const isAdmin = currentUser.role === "admin";
        if (adminLink) adminLink.style.display = isAdmin ? "block" : "none";
        if (accountsLink) accountsLink.style.display = isAdmin ? "block" : "none";
        if (tasksBtn) tasksBtn.style.display = isAdmin ? "inline-block" : "none";
        if (moderationLink) moderationLink.style.display = isAdmin ? "block" : "none";
        if (isAdmin) updateModerationBadge();
    } else {
        if (authSection) authSection.style.display = "block";
        if (userInfo) userInfo.style.display = "none";
        if (adminLink) adminLink.style.display = "none";
        if (accountsLink) accountsLink.style.display = "none";
        if (tasksBtn) tasksBtn.style.display = "none";
        if (moderationLink) moderationLink.style.display = "none";
    }
}

// === НАВИГАЦИЯ ===
function showPage(id) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    const target = document.getElementById(id);
    if (target) target.classList.add("active");
}

function goHome() { showPage("home"); }

// === ТЕСТ: ВЫБОР ТЕМ ===
function startTest() {
    if (!currentUser) { alert("Сначала войдите в аккаунт!"); return; }
    if (!allCategories || allCategories.length === 0) { alert("Нет доступных вопросов."); return; }
    showPage("contest");
    const topicScreen = document.getElementById('topic-selection-screen');
    const testScreen = document.getElementById('test-running-screen');
    if (topicScreen) topicScreen.style.display = 'block';
    if (testScreen) testScreen.style.display = 'none';
    renderTopicSelection();
}

function renderTopicSelection() {
    const container = document.getElementById('topics-checkbox-list');
    if (!container) return;
    let html = '';
    allCategories.forEach((cat, index) => {
        html += `
            <label class="topic-check-label">
                <input type="checkbox" class="topic-check" value="${index}" checked> 
                <strong>${cat.name}</strong> (${cat.questions.length} вопр.)
            </label>
        `;
    });
    container.innerHTML = html;
}

function startSelectedTest() {
    const checkboxes = document.querySelectorAll('.topic-check:checked');
    if (checkboxes.length === 0) { alert("Выберите хотя бы одну тему!"); return; }
    let selectedQuestions = [];
    checkboxes.forEach(cb => {
        const cat = allCategories[parseInt(cb.value)];
        if (cat && cat.questions) selectedQuestions = selectedQuestions.concat(cat.questions);
    });
    if (selectedQuestions.length === 0) { alert("В выбранных темах нет вопросов."); return; }
    questions = selectedQuestions;
    currentQIndex = 0;
    userAnswers = {}; 
    document.getElementById('topic-selection-screen').style.display = 'none';
    document.getElementById('test-running-screen').style.display = 'block';
    renderQ();
}

function startFullTest() {
    questions = allCategories.flatMap(c => c.questions);
    currentQIndex = 0;
    userAnswers = {};
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
            html += `<label><input type="radio" name="ans-${q.id}" value="${i}" ${checked} onchange="saveAnswer(${q.id}, ${i})"> ${opt}</label>`;
        });
        html += "</div>";
    } else if (q.type === "text_input") {
        const val = userAnswers[q.id] || "";
        html += `<input type="text" class="text-input" value="${val}" placeholder="Введите ответ..." onchange="saveAnswer(${q.id}, this.value)">`;
    } else if (q.type === "table_fill") {
        html += `<table class="table-fill">`;
        if (q.headers && q.headers.length > 0) {
            html += `<thead><tr>${q.headers.map(h => `<th>${h}</th>`).join("")}</tr></thead>`;
        }
        html += `<tbody>`;
        const isOldFormat = q.rows && q.rows.length > 0 && q.rows[0].label !== undefined && !q.rows[0].cells;
        q.rows.forEach((r, rowIndex) => {
            html += `<tr>`;
            if (isOldFormat) {
                const val = (userAnswers[q.id] && userAnswers[q.id][r.key]) || "";
                html += `<td>${r.label || ""}</td>`;
                html += `<td><input type="text" class="text-input" value="${val}" onchange="saveTableAnswer('${q.id}', '${r.key}', this.value)" placeholder="..."></td>`;
            } else {
                r.cells.forEach((cell, colIndex) => {
                    const uniqueKey = `${q.id}_r${rowIndex}_c${colIndex}`;
                    if (cell.is_hint) {
                        html += `<td class="hint-cell">${cell.value}</td>`;
                    } else {
                        const userVal = (userAnswers[q.id] && userAnswers[q.id][uniqueKey]) || "";
                        html += `<td><input type="text" class="text-input" value="${userVal}" onchange="saveTableAnswer('${q.id}', '${uniqueKey}', this.value)" placeholder="..."></td>`;
                    }
                });
            }
            html += `</tr>`;
        });
        html += `</tbody></table>`;
    }
    html += "</div>";
    document.getElementById("q-container").innerHTML = html;
    document.getElementById("counter").innerText = `${currentQIndex + 1} / ${questions.length}`;
    
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');
    if (btnPrev) btnPrev.disabled = currentQIndex === 0;
    if (btnNext) btnNext.disabled = currentQIndex === questions.length - 1;
}

function saveAnswer(qId, val) { userAnswers[qId] = val; }
function saveTableAnswer(qId, key, val) {
    if (!userAnswers[qId]) userAnswers[qId] = {};
    userAnswers[qId][key] = val;
}
function nextQ() { if (currentQIndex < questions.length - 1) { currentQIndex++; renderQ(); } }
function prevQ() { if (currentQIndex > 0) { currentQIndex--; renderQ(); } }

// === ПОДСЧЁТ РЕЗУЛЬТАТА ===
async function finishTest() {
    let score = 0;
    let maxScore = 0;
    const reviewItems = [];

    for (const q of questions) {
        maxScore += q.points;
        const ans = userAnswers[q.id];
        let isCorrect = false;
        let detailText = "";
        let earnedPoints = 0;

        if (q.type === "multiple_choice") {
            isCorrect = (ans === q.correct_index);
            earnedPoints = isCorrect ? q.points : 0;
            const userOpt = (ans !== undefined && ans !== null) ? q.options[ans] : "(нет ответа)";
            detailText = `Ваш ответ: ${userOpt} | Правильный: ${q.options[q.correct_index]}`;
        } 
        else if (q.type === "text_input") {
            if (ans && q.accepted_answers) {
                const normalizedAns = String(ans).toLowerCase().trim();
                isCorrect = q.accepted_answers.some(acc => acc.toLowerCase().trim() === normalizedAns);
            }
            earnedPoints = isCorrect ? q.points : 0;
            detailText = `Ваш ответ: ${ans || "(пусто)"} | Правильные: ${(q.accepted_answers || []).join(", ")}`;
            
            // Отправляем на модерацию
            if (ans) {
                await submitForModeration(q, ans);
                detailText += " | Ожидает проверки администратором";
            }
        } 
        else if (q.type === "table_fill" && ans) {
            let correctCells = 0;
            let totalTaskCells = 0; 
            
            q.rows.forEach((r, rowIndex) => {
                if (r.cells) {
                    r.cells.forEach((cell, colIndex) => {
                        if (cell.is_hint) return; 
                        totalTaskCells++;
                        const uniqueKey = `${q.id}_r${rowIndex}_c${colIndex}`;
                        const userVal = (ans[uniqueKey] || "").toLowerCase().trim();
                        const correctVal = (cell.value || "").toLowerCase().trim();
                        if (correctVal === "") return;
                        if (userVal && (userVal === correctVal || userVal.includes(correctVal) || correctVal.includes(userVal))) {
                            correctCells++;
                        }
                    });
                }
            });
            
            if (totalTaskCells > 0) {
                earnedPoints = Math.round((correctCells / totalTaskCells) * q.points);
                if (correctCells === totalTaskCells) isCorrect = true;
            }
            detailText = `Верно ячеек: ${correctCells}/${totalTaskCells}`;
            
            // Отправляем на модерацию
            await submitForModeration(q, ans);
            detailText += " | Ожидает проверки";
        }

        score += earnedPoints;

        reviewItems.push({
            text: q.text,
            points: q.points,
            earned: earnedPoints,
            isCorrect: isCorrect,
            detail: detailText,
            type: q.type
        });
    }

    const percent = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    document.getElementById("score-display").innerText = `Итог: ${score} из ${maxScore} баллов (${percent}%)`;
    
    const container = document.getElementById('review-list-container');
    if (container) {
        let html = '<ul class="tasks-list">'; 
        reviewItems.forEach(item => {
            let typeName = item.type === 'multiple_choice' ? "[Выбор]" : item.type === 'text_input' ? "[Текст]" : "[Таблица]";
            const statusClass = item.isCorrect ? "status-correct" : "status-wrong";
            html += `
                <li class="tasks-item ${statusClass}">
                    <div style="flex-grow:1; padding-left: 10px;">
                        <span class="task-type-badge">${typeName}</span> 
                        <strong>${item.text}</strong>
                        <div style="margin-top:5px; font-size:13px; color:var(--text-light);">
                            ${item.detail} <br>
                            <span style="color:var(--accent);">Получено баллов: ${item.earned} из ${item.points}</span>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px; padding-right: 10px;">
                        <span style="font-weight:bold; color:${item.isCorrect ? '#28a745' : '#dc3545'}; font-size:18px;">
                            ${item.isCorrect ? '✓' : '✗'}
                        </span>
                    </div>
                </li>`;
        });
        html += '</ul>';
        container.innerHTML = html;
    }

    if (currentUser) {
        try {
            let currentHistory = await loadUserHistory(currentUser.login);
            Object.assign(currentHistory, userAnswers);
            await saveUserHistory(currentUser.login, currentHistory);
        } catch (e) {
            console.error("Не удалось сохранить историю:", e);
        }
    }
    showPage("results");
}

// === АДМИН: РЕДАКТОР И АККАУНТЫ ===
function openEditor() {
    showPage("editor");
    apiGet("questions").then(t => { document.getElementById("editor-area").value = t; })
        .catch(e => { document.getElementById("save-status").innerText = "Ошибка: " + e.message; });
}

async function saveToGithub() {
    const content = document.getElementById("editor-area").value;
    const statusEl = document.getElementById("save-status");
    try { JSON.parse(content); } catch { statusEl.innerText = "Ошибка: невалидный JSON"; statusEl.style.color = "red"; return; }
    try {
        await apiPut("questions", content);
        statusEl.innerText = "Сохранено"; statusEl.style.color = "green";
    } catch (e) { statusEl.innerText = "Ошибка: " + e.message; statusEl.style.color = "red"; }
}

async function openAccountsManager() {
    showPage("accounts-page");
    let users;
    try { users = JSON.parse(await apiGet("users")); } catch (e) {
        document.getElementById("accounts-container").innerHTML = `<p style="color:red;">Ошибка: ${e.message}</p>`; return;
    }
    let html = "<h3>Список аккаунтов</h3><table class=\"table-fill\"><tr><th>Логин</th><th>Имя</th><th>Роль</th><th>Действия</th></tr>";
    users.forEach((u, index) => {
        html += `<tr><td>${u.login}</td><td>${u.name}</td><td>${u.role}</td><td><button onclick="deleteAccount(${index})" class="btn-nav" style="background:#d9534f;color:#fff;">Удалить</button></td></tr>`;
    });
    html += `</table><br><hr><h4>Добавить новый аккаунт</h4>
        <input type="text" id="new-login" placeholder="Логин" class="text-input">
        <input type="password" id="new-pass" placeholder="Пароль" class="text-input">
        <input type="text" id="new-name" placeholder="Отображаемое имя" class="text-input">
        <select id="new-role" class="text-input"><option value="user">Пользователь</option><option value="admin">Администратор</option></select>
        <button onclick="addAndSaveAccount()" class="btn-primary">Добавить и сохранить</button><p id="acc-status"></p>`;
    document.getElementById("accounts-container").innerHTML = html;
}

async function addAndSaveAccount() {
    const login = document.getElementById("new-login").value.trim();
    const pass = document.getElementById("new-pass").value.trim();
    const name = document.getElementById("new-name").value.trim();
    const role = document.getElementById("new-role").value;
    const statusEl = document.getElementById("acc-status");
    if (!login || !pass || !name) { statusEl.innerText = "Заполните все поля"; statusEl.style.color = "red"; return; }
    let users;
    try { users = JSON.parse(await apiGet("users")); } catch (e) { statusEl.innerText = "Ошибка: " + e.message; statusEl.style.color = "red"; return; }
    if (users.some(u => u.login === login)) { statusEl.innerText = "Такой логин уже существует"; statusEl.style.color = "red"; return; }
    users.push({ login, password: pass, name, role });
    try {
        await apiPut("users", JSON.stringify(users, null, 2));
        statusEl.innerText = "Добавлено и сохранено"; statusEl.style.color = "green";
        openAccountsManager();
    } catch (e) { statusEl.innerText = "Ошибка сохранения: " + e.message; statusEl.style.color = "red"; }
}

async function deleteAccount(index) {
    if (!confirm("Точно удалить этот аккаунт?")) return;
    let users;
    try { users = JSON.parse(await apiGet("users")); } catch (e) { alert("Ошибка: " + e.message); return; }
    users.splice(index, 1);
    try { await apiPut("users", JSON.stringify(users, null, 2)); openAccountsManager(); } catch (e) { alert("Ошибка: " + e.message); }
}

// === ВКЛАДКА ЗАДАНИЯ ===
async function openTasksList() {
    showPage('tasks-page');
    const btnAdd = document.getElementById('btn-add-question');
    if (currentUser && currentUser.role === 'admin') { if (btnAdd) btnAdd.style.display = 'inline-block'; } 
    else { if (btnAdd) btnAdd.style.display = 'none'; }
    const formContainer = document.getElementById('add-form-container');
    if (formContainer) formContainer.style.display = 'none';
    let userHistory = currentUser ? await loadUserHistory(currentUser.login) : {};
    loadAndRenderTasks(userHistory);
}

async function loadAndRenderTasks(userHistory = {}) {
    const container = document.getElementById('tasks-list-container');
    try {
        const data = JSON.parse(await apiGet('questions'));
        let html = '';
        if (!data.categories || data.categories.length === 0) {
            html = '<p>Пока нет ни одного вопроса.</p>';
        } else {
            const isAdmin = currentUser && currentUser.role === 'admin';
            data.categories.forEach((cat, catIndex) => {
                html += `<h4 class="task-category-header">${cat.name}</h4><ul class="tasks-list">`;
                cat.questions.forEach((q, qIndexInCat) => {
                    let typeName = q.type === 'multiple_choice' ? "[Выбор]" : q.type === 'text_input' ? "[Текст]" : "[Таблица]";
                    let statusClass = "";
                    const savedAns = userHistory[q.id];
                    if (savedAns !== undefined) {
                        let isCorrect = false;
                        if (q.type === 'multiple_choice') isCorrect = (savedAns === q.correct_index);
                        else if (q.type === 'text_input' && q.accepted_answers) {
                            isCorrect = q.accepted_answers.some(acc => acc.toLowerCase().trim() === String(savedAns).toLowerCase().trim());
                        } else if (q.type === 'table_fill' && q.rows && q.rows[0] && q.rows[0].cells) {
                            let correctCells = 0, totalCells = 0;
                            q.rows.forEach((r, rowIndex) => {
                                r.cells.forEach((cell, colIndex) => {
                                    if (cell.is_hint) return;
                                    totalCells++;
                                    const uniqueKey = `${q.id}_r${rowIndex}_c${colIndex}`;
                                    const userVal = (savedAns[uniqueKey] || "").toLowerCase().trim();
                                    const correctVal = (cell.value || "").toLowerCase().trim();
                                    if (correctVal === "") return;
                                    if (userVal && (userVal === correctVal || userVal.includes(correctVal) || correctVal.includes(userVal))) correctCells++;
                                });
                            });
                            isCorrect = (totalCells > 0 && correctCells === totalCells);
                        }
                        statusClass = isCorrect ? "status-correct" : "status-wrong";
                    }
                    html += `<li class="tasks-item ${statusClass}">
                        <div style="flex-grow:1; padding-left: 10px;"><span class="task-type-badge">${typeName}</span> ${q.text}</div>
                        <div style="display:flex; align-items:center; gap:10px; padding-right: 10px;">
                            <span class="task-points">${q.points} балл</span>`;
                    if (isAdmin) {
                        html += `<button onclick="editQuestion(${catIndex}, ${qIndexInCat})" class="btn-nav" style="background:#ffc107; color:black; border:none; padding:4px 8px; cursor:pointer; font-size:12px; border-radius:3px;">Изменить</button>
                                 <button onclick="deleteQuestion('${cat.id}', ${qIndexInCat})" class="btn-nav" style="background:#d9534f; color:white; border:none; padding:4px 8px; cursor:pointer; font-size:12px; border-radius:3px;">Удалить</button>`;
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
        const data = JSON.parse(await apiGet('questions'));
        const catIndex = data.categories.findIndex(c => c.id === categoryId);
        if (catIndex === -1) { alert("Категория не найдена."); return; }
        data.categories[catIndex].questions.splice(questionIndex, 1);
        await apiPut('questions', JSON.stringify(data, null, 2));
        let userHistory = currentUser ? await loadUserHistory(currentUser.login) : {};
        loadAndRenderTasks(userHistory);
    } catch (e) { alert("Ошибка: " + e.message); }
}

async function editQuestion(catIndex, qIndex) {
    try {
        const data = JSON.parse(await apiGet('questions'));
        const category = data.categories[catIndex];
        const question = category.questions[qIndex];
        editingContext = { catIndex, qIndex, questionId: question.id };
        document.getElementById('task-category').value = category.name;
        document.getElementById('task-type').value = question.type;
        document.getElementById('task-text').value = question.text;
        document.getElementById('task-points').value = question.points;
        const formTitle = document.querySelector('#add-form-container h4');
        if (formTitle) formTitle.innerText = "Редактирование вопроса";
        const saveBtn = document.querySelector('#add-form-container button.btn-primary');
        if (saveBtn) saveBtn.innerText = "Сохранить изменения";
        const form = document.getElementById('add-form-container');
        form.style.display = 'block';
        toggleTaskFields();
        setTimeout(() => fillSpecificFields(question), 100);
        showPage('tasks-page');
    } catch (e) { alert("Ошибка: " + e.message); }
}

function fillSpecificFields(q) {
    if (q.type === 'multiple_choice') {
        const list = document.getElementById('mc-options-list');
        list.innerHTML = '';
        q.options.forEach(opt => {
            const div = document.createElement('div');
            div.className = 'mc-option-row';
            div.innerHTML = `<input type="text" class="text-input mc-opt-val" value="${opt}" placeholder="Вариант"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button>`;
            list.appendChild(div);
        });
        document.getElementById('mc-correct-index').value = q.correct_index;
    } else if (q.type === 'text_input') {
        document.getElementById('ti-accepted').value = (q.accepted_answers || []).join(', ');
    } else if (q.type === 'table_fill') {
        document.getElementById('tf-headers').value = (q.headers || []).join(', ');
        const rowsList = document.getElementById('tf-rows-list');
        rowsList.innerHTML = '';
        if (q.rows && q.rows[0] && q.rows[0].cells) {
            q.rows.forEach((r, rowIdx) => {
                const div = document.createElement('div');
                div.className = 'tf-row-block';
                let cellsHtml = '';
                r.cells.forEach((cell, i) => {
                    cellsHtml += `<div class="tf-cell-block"><label><b>Колонка ${i+1}</b></label><br><input type="text" class="text-input tf-cell-val" value="${cell.value}" style="width:70%; display:inline-block;"><label style="display:inline-block; margin-left:10px;"><input type="checkbox" class="tf-cell-hint" ${cell.is_hint ? 'checked' : ''}> Подсказка?</label></div>`;
                });
                div.innerHTML = `<strong>Строка ${rowIdx + 1}</strong>${cellsHtml}<button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">Удалить строку</button>`;
                rowsList.appendChild(div);
            });
        } else if (q.rows && q.rows[0] && q.rows[0].label !== undefined) {
            q.rows.forEach(r => {
                const div = document.createElement('div');
                div.className = 'tf-row-block';
                div.innerHTML = `<strong>Строка</strong><br><label>Метка:</label><input type="text" class="text-input tf-label" value="${r.label}"><label>Значение:</label><input type="text" class="text-input tf-value" value="${r.correct_value}"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red; float:right;">Удалить</button><div style="clear:both;"></div>`;
                rowsList.appendChild(div);
            });
        }
    }
}

function toggleAddForm(forceOpen = false) {
    const form = document.getElementById('add-form-container');
    if (forceOpen || form.style.display === 'none') {
        form.style.display = 'block';
        toggleTaskFields();
    } else {
        form.style.display = 'none';
        editingContext = null;
        resetFormUI();
    }
}

function resetFormUI() {
    const formTitle = document.querySelector('#add-form-container h4');
    if (formTitle) formTitle.innerText = "Новый вопрос";
    const saveBtn = document.querySelector('#add-form-container button.btn-primary');
    if (saveBtn) saveBtn.innerText = "Сохранить вопрос";
    document.getElementById('task-category').value = '';
    document.getElementById('task-text').value = '';
    document.getElementById('task-points').value = '1';
    document.getElementById('dynamic-fields-container').innerHTML = '';
    const statusEl = document.getElementById('task-status');
    if (statusEl) statusEl.innerText = '';
}

function toggleTaskFields() {
    const type = document.getElementById('task-type').value;
    const container = document.getElementById('dynamic-fields-container');
    let html = '';
    if (type === 'multiple_choice') {
        html = `<h4>Варианты ответов</h4><div id="mc-options-list">
            <div class="mc-option-row"><input type="text" class="text-input mc-opt-val" placeholder="Вариант 1"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button></div>
            <div class="mc-option-row"><input type="text" class="text-input mc-opt-val" placeholder="Вариант 2"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button></div>
        </div><button onclick="addMcOption()" class="btn-nav">+ Добавить вариант</button><br><br>
        <label>Индекс правильного ответа (начинается с 0):</label><input type="number" id="mc-correct-index" value="0" min="0" class="text-input" style="width:80px;">`;
    } else if (type === 'text_input') {
        html = `<h4>Проверка ответа</h4><label>Разрешённые ответы (через запятую):</label><input type="text" id="ti-accepted" placeholder="ответ1, ответ2" class="text-input">`;
    } else if (type === 'table_fill') {
        html = `<h4>Структура таблицы</h4><label>Заголовки колонок (через запятую):</label><input type="text" id="tf-headers" placeholder="Колонка 1, Колонка 2" class="text-input"><div id="tf-rows-list"></div><button onclick="addTfRow()" class="btn-nav">+ Добавить строку данных</button>`;
    }
    container.innerHTML = html;
}

function addMcOption() {
    const list = document.getElementById('mc-options-list');
    const div = document.createElement('div');
    div.className = 'mc-option-row';
    div.innerHTML = `<input type="text" class="text-input mc-opt-val" placeholder="Вариант ${list.children.length + 1}"><button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">-</button>`;
    list.appendChild(div);
}

function addTfRow() {
    const list = document.getElementById('tf-rows-list');
    const headersInput = document.getElementById('tf-headers').value.trim();
    if (!headersInput) { alert("Сначала заполните заголовки колонок!"); return; }
    const cols = headersInput.split(',');
    const div = document.createElement('div');
    div.className = 'tf-row-block';
    let cellsHtml = '';
    cols.forEach((colName, i) => {
        cellsHtml += `<div class="tf-cell-block"><label><b>Колонка ${i+1}: ${colName.trim()}</b></label><br><input type="text" class="text-input tf-cell-val" placeholder="Введите правильный ответ..." style="width:70%; display:inline-block;"><label style="display:inline-block; margin-left:10px;"><input type="checkbox" class="tf-cell-hint"> Подсказка?</label></div>`;
    });
    div.innerHTML = `<strong>Строка ${list.children.length + 1}</strong>${cellsHtml}<button onclick="this.parentElement.remove()" class="btn-nav" style="color:red;">Удалить строку</button>`;
    list.appendChild(div);
}

async function saveNewQuestion() {
    const category = document.getElementById('task-category').value.trim();
    const type = document.getElementById('task-type').value;
    const text = document.getElementById('task-text').value.trim();
    const points = parseInt(document.getElementById('task-points').value) || 1;
    const statusEl = document.getElementById('task-status');
    if (!category || !text) { statusEl.innerText = "Ошибка: заполните тему и текст"; statusEl.style.color = "red"; return; }
    let questionObj = { id: Date.now(), type, text, points };
    try {
        if (type === 'multiple_choice') {
            const opts = Array.from(document.querySelectorAll('.mc-opt-val')).map(i => i.value.trim()).filter(v => v);
            const correctIdx = parseInt(document.getElementById('mc-correct-index').value);
            if (opts.length < 2) throw new Error("Нужно минимум 2 варианта");
            if (isNaN(correctIdx) || correctIdx < 0 || correctIdx >= opts.length) throw new Error(`Неверный индекс (от 0 до ${opts.length - 1})`);
            questionObj.options = opts; questionObj.correct_index = correctIdx;
        } else if (type === 'text_input') {
            const accStr = document.getElementById('ti-accepted').value.trim();
            if (!accStr) throw new Error("Укажите правильный ответ");
            questionObj.accepted_answers = accStr.split(',').map(s => s.trim().toLowerCase());
        } else if (type === 'table_fill') {
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
                    rowData.cells.push({ value: cellVals[i].value.trim(), is_hint: cellHints[i].checked });
                }
                if(rowData.cells.some(c => c.value !== "" || c.is_hint)) questionObj.rows.push(rowData);
            });
            if(questionObj.rows.length === 0) throw new Error("Все строки пустые");
        }
        const data = JSON.parse(await apiGet('questions'));
        if (editingContext) {
            const oldCat = data.categories[editingContext.catIndex];
            const oldQuestion = oldCat ? oldCat.questions[editingContext.qIndex] : null;
            let targetCat = data.categories.find(c => c.name.toLowerCase() === category.toLowerCase());
            if (!targetCat) { targetCat = { id: category.toLowerCase().replace(/\s+/g, '_'), name: category, questions: [] }; data.categories.push(targetCat); }
            if (oldCat && oldQuestion) {
                const idxInOld = oldCat.questions.findIndex(q => q.id === editingContext.questionId);
                if (idxInOld !== -1) oldCat.questions.splice(idxInOld, 1);
            }
            if (oldQuestion) questionObj.id = oldQuestion.id;
            targetCat.questions.push(questionObj);
        } else {
            let cat = data.categories.find(c => c.name.toLowerCase() === category.toLowerCase());
            if (!cat) { cat = { id: category.toLowerCase().replace(/\s+/g, '_'), name: category, questions: [] }; data.categories.push(cat); }
            cat.questions.push(questionObj);
        }
        await apiPut('questions', JSON.stringify(data, null, 2));
        statusEl.innerText = editingContext ? "Вопрос обновлён!" : "Вопрос добавлен!";
        statusEl.style.color = "green";
        setTimeout(() => { editingContext = null; resetFormUI(); toggleAddForm(false); openTasksList(); }, 1000);
    } catch (e) {
        console.error(e);
        statusEl.innerText = "Ошибка: " + e.message;
        statusEl.style.color = "red";
    }
}

// === МОДЕРАЦИЯ: ВКЛАДКА АДМИНА ===
let currentModerationFilter = 'pending';

async function openModeration() {
    if (!currentUser || currentUser.role !== 'admin') {
        alert("Доступ только для администраторов");
        return;
    }
    showPage('moderation-page');
    await renderModeration();
}

async function renderModeration() {
    const container = document.getElementById('moderation-container');
    const subs = await loadSubmissions();
    
    const filtered = currentModerationFilter === 'all' 
        ? subs 
        : subs.filter(s => s.status === currentModerationFilter);
    
    if (filtered.length === 0) {
        container.innerHTML = '<p>Нет ответов для отображения.</p>';
        return;
    }
    
    filtered.sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return new Date(b.timestamp) - new Date(a.timestamp);
    });
    
    let html = '';
    filtered.forEach(sub => {
        const statusLabel = sub.status === 'pending' ? '⏳ Ожидает' 
            : sub.status === 'approved' ? '✓ Принят' : '✗ Отклонён';
        
        html += `
            <div class="moderation-card status-${sub.status}">
                <div class="moderation-header">
                    <span><strong>${sub.userName}</strong> (${sub.userId})</span>
                    <span>${new Date(sub.timestamp).toLocaleString('ru-RU')} | ${statusLabel}</span>
                </div>
                <div class="moderation-question">
                    [${sub.questionType === 'table_fill' ? 'Таблица' : 'Текст'}] ${sub.questionText}
                </div>
                <div style="font-size:12px; color:var(--text-light); margin-bottom:5px;">Ответ ученика:</div>
                <div class="moderation-answer">${formatAnswer(sub.answer, sub.questionType)}</div>
                <div style="font-size:12px; color:var(--text-light); margin-bottom:5px;">Эталон:</div>
                <div class="moderation-answer" style="background:var(--bg-status-correct);">${sub.correctAnswer}</div>
                ${sub.status === 'pending' ? `
                    <div class="moderation-actions">
                        <button onclick="handleModeration('${sub.id}', 'approved')" class="btn-approve">✓ Принять</button>
                        <button onclick="handleModeration('${sub.id}', 'rejected')" class="btn-reject">✗ Отклонить</button>
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

function formatAnswer(answer, type) {
    if (type === 'table_fill' && typeof answer === 'object') {
        return Object.entries(answer).map(([k, v]) => `${k}: ${v}`).join('<br>');
    }
    return String(answer);
}

function filterModeration(filter) {
    currentModerationFilter = filter;
    renderModeration();
}

async function handleModeration(submissionId, status) {
    await updateSubmissionStatus(submissionId, status);
    await renderModeration();
    updateModerationBadge();
}

async function updateModerationBadge() {
    if (!currentUser || currentUser.role !== 'admin') return;
    
    const subs = await loadSubmissions();
    const pendingCount = subs.filter(s => s.status === 'pending').length;
    
    const badge = document.getElementById('moderation-badge');
    const link = document.getElementById('moderation-link');
    
    if (link) link.style.display = 'block';
    
    if (badge) {
        if (pendingCount > 0) {
            badge.innerText = pendingCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// === ПЕРЕКЛЮЧЕНИЕ ТЕМЫ ===
function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('biology_theme', isDark ? 'dark' : 'light');
    updateThemeButton(isDark);
}

function updateThemeButton(isDark) {
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerText = isDark ? '☀️ Светлая тема' : '🌙 Тёмная тема';
}

function applySavedTheme() {
    const saved = localStorage.getItem('biology_theme');
    if (saved === 'dark') { document.body.classList.add('dark-theme'); updateThemeButton(true); } 
    else { updateThemeButton(false); }
}

// === ИНИЦИАЛИЗАЦИЯ ===
window.onload = async () => {
    applySavedTheme();
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