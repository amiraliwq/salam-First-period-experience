// app.js - نسخه به‌روز شده با امکانات خواسته‌شده
const LS_TEACHERS = "tajrish_teachers_v1";
const LS_CLASSES = "tajrish_classes_v1";
const LS_SESSIONS = "tajrish_sessions_v1";
const LS_ASSIGNMENTS = "tajrish_assignments_v1";
const LS_ACTIVE = "tajrish_active_v1";

const AUTO_SAVE_INTERVAL = 40 * 60 * 1000;
const CLASS_DURATION = 45 * 60 * 1000; // 45 دقیقه

// پیش‌فرض‌ها (در صورت نبودن در localStorage)
const TEACHERS_DEFAULT = {
  "اقابابا": { password: "2323", name: "اقابابا", subject: "شیمی و فیزیک", canManageStudents:false },
  "مشاور":   { password: "3434", name: "مشاور",   subject: "هندسه",           canManageStudents:true },
  "عزیزی":   { password: "1212", name: "عزیزی",   subject: "زیست زمین",      canManageStudents:false },
  "خودسوز":  { password: "4545", name: "خودسوز",  subject: "ریاضی پلاس",     canManageStudents:false },
  "ملکی":    { password: "5656", name: "ملکی",    subject: "حساب",            canManageStudents:false }
};

const CLASSES_DEFAULT = {
  "میرزاخانی 1": ["امیرعلی","امیرحسنی","سارا","رضا","امیررضا بسیجی","اراد آهنگران","رادین شقاقی شهری"],
  "میرزاخانی 2": ["لیلا","مینا","حسین","علی","رییس قاسم","نیکان شیخی 111111111"]
};

// داده‌ها از localStorage بارگذاری می‌شوند یا با پیش‌فرض مقداردهی می‌شوند
let teachers = loadFromLS(LS_TEACHERS, structuredClone(TEACHERS_DEFAULT));
let classes = loadFromLS(LS_CLASSES, structuredClone(CLASSES_DEFAULT));
let sessions = loadFromLS(LS_SESSIONS, []);
let assignments = loadFromLS(LS_ASSIGNMENTS, []);
let activeClasses = loadFromLS(LS_ACTIVE, {}); // نگهداری کدها و expiry برای هر کلاس

// حالت فعلی
let currentTeacher = null;
let currentClass = null;
let autoSaveTimer = null;
let classTimers = {}; // نگهداری timeout ids برای هر کلاس

// المان‌های صفحه
const loginSection = document.getElementById("loginSection");
const classSection = document.getElementById("classSection");
const attendanceSection = document.getElementById("attendanceSection");
const reportSection = document.getElementById("reportSection");
const teacherManageSection = document.getElementById("teacherManageSection");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const classButtons = document.getElementById("classButtons");
const classTitle = document.getElementById("classTitle");
const attendanceTableBody = document.querySelector("#attendanceTable tbody");
const searchStudent = document.getElementById("searchStudent");
const saveSessionBtn = document.getElementById("saveSessionBtn");
const backToClassesBtn = document.getElementById("backToClasses");
const quickQBtn = document.getElementById("quickQBtn");
const reportAllBtn = document.getElementById("reportAllBtn");
const reportContent = document.getElementById("reportContent");
const closeReportBtn = document.getElementById("closeReportBtn");
const loginError = document.getElementById("loginError");
const startClassBtn = document.getElementById("startClassBtn");
const classStatus = document.getElementById("classStatus");
const manageTeachersBtn = document.getElementById("manageTeachersBtn");

// مدیریت دبیران
const teacherListDiv = document.getElementById("teacherList");
const addTeacherBtn = document.getElementById("addTeacherBtn");
const newTeacherName = document.getElementById("newTeacherName");
const newTeacherDisplay = document.getElementById("newTeacherDisplay");
const newTeacherSubject = document.getElementById("newTeacherSubject");
const newTeacherPassword = document.getElementById("newTeacherPassword");
const closeManageBtn = document.getElementById("closeManageBtn");

// رویدادها
loginBtn.addEventListener("click", doLogin);
logoutBtn.addEventListener("click", doLogout);
backToClassesBtn.addEventListener("click", () => showSection("class"));
saveSessionBtn.addEventListener("click", saveSession);
searchStudent.addEventListener("input", filterStudents);
quickQBtn.addEventListener("click", quickQuestion);
reportAllBtn.addEventListener("click", showGlobalReport);
closeReportBtn.addEventListener("click", ()=>showSection("class"));
startClassBtn.addEventListener("click", startClassForCurrent);
manageTeachersBtn.addEventListener("click", openTeacherManage);
addTeacherBtn.addEventListener("click", handleAddTeacher);
closeManageBtn.addEventListener("click", ()=>showSection("class"));

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "q") {
    if (!attendanceSection.classList.contains("hidden")) quickQuestion();
  }
});

// توابع ذخیره/بارگذاری LS
function saveToLS(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }
function loadFromLS(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e){ return fallback; }
}

// اجرا در بارگذاری صفحه: بازیابی تایمرهای فعال
restoreActiveClassTimers();

// ---- ورود و خروج ----
function doLogin() {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value.trim();
  if (!u || !p) { loginError.innerText = "نام کاربری و رمز را وارد کنید"; return; }
  if (!(u in teachers) || teachers[u].password !== p) {
    loginError.innerText = "نام کاربری یا رمز اشتباه است"; return;
  }
  currentTeacher = { ...teachers[u], username: u };
  loginError.innerText = "";
  showSection("class");
  renderClassButtons();
  if (currentTeacher.canManageStudents) {
    reportAllBtn.classList.remove("hidden");
    manageTeachersBtn.classList.remove("hidden");
  } else {
    reportAllBtn.classList.add("hidden");
    manageTeachersBtn.classList.add("hidden");
  }
}

function doLogout() {
  currentTeacher = null;
  currentClass = null;
  clearAutoSave();
  // پاک کردن تایمرهای این جلسه محلی
  showSection("login");
}

// کنترل تِم‌ها
function showSection(name) {
  loginSection.classList.add("hidden");
  classSection.classList.add("hidden");
  attendanceSection.classList.add("hidden");
  reportSection.classList.add("hidden");
  teacherManageSection.classList.add("hidden");
  if (name === "login") loginSection.classList.remove("hidden");
  if (name === "class") classSection.classList.remove("hidden");
  if (name === "attendance") attendanceSection.classList.remove("hidden");
  if (name === "report") reportSection.classList.remove("hidden");
  if (name === "teachermanage") teacherManageSection.classList.remove("hidden");
}

// ---- نمایش کلاس‌ها ----
function renderClassButtons() {
  classButtons.innerHTML = "";
  for (const cls in classes) {
    const btn = document.createElement("button");
    btn.innerText = cls;
    btn.addEventListener("click", () => openClass(cls));
    classButtons.appendChild(btn);
    // اگر کلاس فعال است نشان بده
    if (activeClasses[cls] && new Date(activeClasses[cls].expiry) > new Date()) {
      const b = document.createElement("span"); b.className = "badge"; b.innerText = "کلاس فعال";
      btn.parentNode.insertBefore(b, btn.nextSibling);
    }
  }
  if (currentTeacher && currentTeacher.canManageStudents) {
    const addBtn = document.createElement("button");
    addBtn.innerText = "ایجاد کلاس جدید";
    addBtn.addEventListener("click", () => {
      const name = prompt("نام کلاس جدید:");
      if (!name) return;
      if (classes[name]) return alert("کلاس با این نام وجود دارد");
      classes[name] = [];
      saveToLS(LS_CLASSES, classes);
      renderClassButtons();
    });
    classButtons.appendChild(addBtn);
  }
}

// ---- باز کردن کلاس ----
function openClass(cls) {
  currentClass = cls;
  classTitle.innerText = `کلاس: ${cls} — دبیر: ${currentTeacher.name} — درس: ${currentTeacher.subject}`;
  showSection("attendance");
  renderAttendanceTable();
  ensureAutoSessionForClass(cls);
  startAutoSave();
  updateClassStatusUI();
}

// اگر هنوز برای امروز جلسه‌ای برای این کلاس وجود نداشت، یک جلسه خالی برای هر دانش‌آموز ایجاد می‌کنیم (قبل از شروع کلاس هم قابل ثبت است)
function ensureAutoSessionForClass(cls) {
  const nowISO = new Date().toISOString();
  const today = (new Date()).toISOString().slice(0,10);
  const hasToday = sessions.some(s => s.class === cls && s.datetime.slice(0,10) === today);
  if (!hasToday) {
    const newRows = (classes[cls]||[]).map(student => ({
      datetime: nowISO,
      teacher: currentTeacher.name,
      subject: currentTeacher.subject,
      class: cls,
      student,
      status: "غایب",
      plus: 0,
      minus: 0,
      score: null,
      extra: 0
    }));
    sessions.push(...newRows);
    saveToLS(LS_SESSIONS, sessions);
  }
}

// ---- جدول حضور ----
function renderAttendanceTable() {
  attendanceTableBody.innerHTML = "";
  const students = classes[currentClass] || [];
  const agg = buildAggregate();
  students.forEach(student => {
    const tr = document.createElement("tr");
    const tdName = document.createElement("td"); tdName.innerText = student; tr.appendChild(tdName);

    const tdStatus = document.createElement("td");
    let lastStatus = getLastStatusForStudent(currentClass, student) || "غایب";
    const statusSpan = document.createElement("span"); statusSpan.textContent = lastStatus;
    const btnPresent = document.createElement("button"); btnPresent.type="button"; btnPresent.className="small"; btnPresent.innerText = "حاضر";
    btnPresent.addEventListener("click", ()=>{ statusSpan.innerText = "حاضر"; });
    const btnAbsent = document.createElement("button"); btnAbsent.type="button"; btnAbsent.className="small"; btnAbsent.innerText = "غایب";
    btnAbsent.addEventListener("click", ()=>{ statusSpan.innerText = "غایب"; });
    tdStatus.appendChild(statusSpan); tdStatus.appendChild(document.createTextNode(" "));
    tdStatus.appendChild(btnPresent); tdStatus.appendChild(document.createTextNode(" "));
    tdStatus.appendChild(btnAbsent);
    tr.appendChild(tdStatus);

    const tdPlus = document.createElement("td");
    let plusCount = getEditableValueFromLatestSession(currentClass, student, "plus") || 0;
    const spanPlus = document.createElement("span"); spanPlus.innerText = plusCount;
    const btnPlus = document.createElement("button"); btnPlus.type="button"; btnPlus.className="small"; btnPlus.innerText = "+"; btnPlus.addEventListener("click", ()=>{ plusCount++; spanPlus.innerText = plusCount; });
    tdPlus.appendChild(btnPlus); tdPlus.appendChild(document.createTextNode(" ")); tdPlus.appendChild(spanPlus); tr.appendChild(tdPlus);

    const tdMinus = document.createElement("td");
    let minusCount = getEditableValueFromLatestSession(currentClass, student, "minus") || 0;
    const spanMinus = document.createElement("span"); spanMinus.innerText = minusCount;
    const btnMinus = document.createElement("button"); btnMinus.type="button"; btnMinus.className="small"; btnMinus.innerText = "-"; btnMinus.addEventListener("click", ()=>{ minusCount++; spanMinus.innerText = minusCount; });
    tdMinus.appendChild(btnMinus); tdMinus.appendChild(document.createTextNode(" ")); tdMinus.appendChild(spanMinus); tr.appendChild(tdMinus);

    const tdScore = document.createElement("td");
    const inputScore = document.createElement("input"); inputScore.type = "number"; inputScore.min = 0; inputScore.max = 20; inputScore.style.width="80px";
    const lastScore = getEditableValueFromLatestSession(currentClass, student, "score");
    if (lastScore !== null && lastScore !== undefined) inputScore.value = lastScore;
    tdScore.appendChild(inputScore); tr.appendChild(tdScore);

    const tdExtra = document.createElement("td");
    let extraCount = getEditableValueFromLatestSession(currentClass, student, "extra") || 0;
    const spanExtra = document.createElement("span"); spanExtra.innerText = extraCount;
    const btnExtra = document.createElement("button"); btnExtra.type="button"; btnExtra.className="small"; btnExtra.innerText = "تکلیف +"; btnExtra.addEventListener("click", ()=>{ extraCount++; spanExtra.innerText = extraCount; });
    const btnAddAssignment = document.createElement("button"); btnAddAssignment.type="button"; btnAddAssignment.className="small"; btnAddAssignment.innerText = "افزودن یادداشت تکلیف";
    btnAddAssignment.addEventListener("click", ()=> {
      const text = prompt("متن تکلیف (برای این دانش‌آموز) :");
      if (!text) return;
      const asg = { id: cryptoRandomId(), dateISO: new Date().toISOString(), teacher: currentTeacher.name, teacherUsername: currentTeacher.username, class: currentClass, student, text };
      assignments.push(asg); saveToLS(LS_ASSIGNMENTS, assignments);
      alert("تکلیف ذخیره شد");
    });
    tdExtra.appendChild(btnExtra); tdExtra.appendChild(document.createTextNode(" ")); tdExtra.appendChild(spanExtra); tdExtra.appendChild(document.createTextNode(" ")); tdExtra.appendChild(btnAddAssignment);
    tr.appendChild(tdExtra);

    const tdAgg = document.createElement("td");
    const a = agg[currentClass] && agg[currentClass][student] ? agg[currentClass][student] : { plus:0, minus:0 };
    tdAgg.innerText = `+${a.plus} / -${a.minus}`;
    tr.appendChild(tdAgg);

    const tdAdmin = document.createElement("td");
    tdAdmin.classList.add("admin-col");
    const removeBtn = document.createElement("button"); removeBtn.type="button"; removeBtn.className="small"; removeBtn.innerText = "حذف دانش‌آموز";
    removeBtn.addEventListener("click", ()=> {
      if (!confirm(`آیا از حذف ${student} اطمینان دارید؟`)) return;
      removeStudentFromClass(currentClass, student);
      renderAttendanceTable();
    });
    tdAdmin.appendChild(removeBtn);
    tr.appendChild(tdAdmin);

    attendanceTableBody.appendChild(tr);
  });

  const adminCols = document.querySelectorAll(".admin-col");
  adminCols.forEach(c => {
    if (currentTeacher && currentTeacher.canManageStudents) c.classList.remove("hidden");
    else c.classList.add("hidden");
  });
  renderAddStudentRow();
}

// ردیف افزودن دانش‌آموز جدید (فقط برای دبیران قابل مدیریت)
function renderAddStudentRow() {
  const existing = document.querySelector("#addStudentRow");
  if (existing) existing.remove();
  if (currentTeacher && currentTeacher.canManageStudents) {
    const tr = document.createElement("tr"); tr.id = "addStudentRow";
    const td = document.createElement("td"); td.colSpan = 8;
    const input = document.createElement("input"); input.placeholder = "نام دانش‌آموز جدید..."; input.style.marginLeft="8px";
    const btn = document.createElement("button"); btn.innerText = "افزودن دانش‌آموز"; btn.addEventListener("click", ()=> {
      const name = input.value.trim();
      if (!name) return alert("نام معتبر نیست");
      addStudentToClass(currentClass, name);
      renderAttendanceTable();
    });
    td.appendChild(input); td.appendChild(btn); tr.appendChild(td);
    attendanceTableBody.appendChild(tr);
  }
}

// ---- توابع کمکی برای وضعیت‌ها ----
function getLastStatusForStudent(cls, student) {
  const rows = sessions.filter(s => s.class === cls && s.student === student);
  if (!rows.length) return null;
  rows.sort((a,b) => new Date(b.datetime) - new Date(a.datetime));
  return rows[0].status;
}
function getEditableValueFromLatestSession(cls, student, field) {
  const rows = sessions.filter(s => s.class === cls && s.student === student);
  if (!rows.length) return null;
  rows.sort((a,b) => new Date(b.datetime) - new Date(a.datetime));
  return rows[0][field];
}

function buildAggregate() {
  const agg = {};
  sessions.forEach(s => {
    if (!agg[s.class]) agg[s.class] = {};
    if (!agg[s.class][s.student]) agg[s.class][s.student] = { present:0, absent:0, plus:0, minus:0, scores:[] };
    const node = agg[s.class][s.student];
    if (s.status === "حاضر") node.present++; else node.absent++;
    node.plus += (s.plus||0);
    node.minus += (s.minus||0);
    if (s.score !== null && s.score !== undefined) node.scores.push(s.score);
  });
  return agg;
}

// ---- ذخیره جلسه (ثبت تمامی ردیف‌ها به sessions) ----
function saveSession() {
  const rows = Array.from(attendanceTableBody.querySelectorAll("tr")).filter(r=>r.id !== "addStudentRow");
  if (!rows.length) return;
  const now = new Date().toISOString();
  const newRows = [];
  rows.forEach(r => {
    const student = r.children[0].innerText;
    const status = r.children[1].querySelector("span") ? r.children[1].querySelector("span").innerText.trim() : "غایب";
    const plus = parseInt(r.children[2].querySelector("span").innerText) || 0;
    const minus = parseInt(r.children[3].querySelector("span").innerText) || 0;
    const scoreInput = r.children[4].querySelector("input");
    const score = scoreInput && scoreInput.value !== "" ? parseFloat(scoreInput.value) : null;
    const extra = parseInt(r.children[5].querySelector("span").innerText) || 0;
    newRows.push({ datetime: now, teacher: currentTeacher.name, teacherUsername: currentTeacher.username, subject: currentTeacher.subject, class: currentClass, student, status, plus, minus, score, extra });
  });
  sessions.push(...newRows);
  saveToLS(LS_SESSIONS, sessions);
  alert("جلسه ثبت شد.");
  renderAttendanceTable();
}

// ---- اتوسِیو و تایمر کلاس ----
function startAutoSave() {
  clearAutoSave();
  autoSaveTimer = setInterval(() => {
    saveSession();
  }, AUTO_SAVE_INTERVAL);
}
function clearAutoSave() {
  if (autoSaveTimer) { clearInterval(autoSaveTimer); autoSaveTimer = null; }
}

// ----- سیستم کد کلاس و تایمر 45 دقیقه -----
function startClassForCurrent() {
  if (!currentClass || !currentTeacher) return alert("ابتدا یک کلاس را باز کنید.");
  // اگر قبلاً فعال و منقضی نشده، هشدار بدهیم
  const now = Date.now();
  if (activeClasses[currentClass] && new Date(activeClasses[currentClass].expiry).getTime() > now) {
    alert(`کد کلاس قبلاً ایجاد شده: ${activeClasses[currentClass].code}`);
    return;
  }
  // تولید کد 6 رقمی
  const code = (Math.floor(100000 + Math.random()*900000)).toString();
  const expiry = new Date(Date.now() + CLASS_DURATION).toISOString();
  activeClasses[currentClass] = { code, startedBy: currentTeacher.username, expiry };
  saveToLS(LS_ACTIVE, activeClasses);
  scheduleClassEndNotification(currentClass, CLASS_DURATION);
  updateClassStatusUI();
  alert(`کد کلاس ایجاد شد: ${code}\nکلاس شروع شد و بعد از 45 دقیقه اعلان پایان نمایش داده می‌شود.`);
}

function scheduleClassEndNotification(cls, msFromNow) {
  // پاک کردن تایمر قبلی اگر بود
  if (classTimers[cls]) clearTimeout(classTimers[cls]);
  classTimers[cls] = setTimeout(() => {
    // اعلان پایان کلاس
    const info = activeClasses[cls];
    const by = info ? (teachers[info.startedBy]?teachers[info.startedBy].name:info.startedBy) : "دبیر";
    alert(`کلاس "${cls}" به پایان رسید. (شروع‌شده توسط: ${by})`);
    // پاک کردن وضعیت فعال کلاس
    delete activeClasses[cls];
    saveToLS(LS_ACTIVE, activeClasses);
    updateClassStatusUI();
    renderClassButtons();
  }, msFromNow);
}

// هنگام بارگذاری صفحه، تایمرهای باقی‌مانده را بازیابی کن
function restoreActiveClassTimers() {
  const now = Date.now();
  for (const cls in activeClasses) {
    const expiry = new Date(activeClasses[cls].expiry).getTime();
    if (expiry > now) {
      scheduleClassEndNotification(cls, expiry - now);
    } else {
      // منقضی شده -> پاکش کن
      delete activeClasses[cls];
    }
  }
  saveToLS(LS_ACTIVE, activeClasses);
}

// نمایش وضعیت کلاس در UI
function updateClassStatusUI() {
  if (!currentClass) { classStatus.innerText = ""; return; }
  const info = activeClasses[currentClass];
  if (info) {
    const left = Math.max(0, new Date(info.expiry).getTime() - Date.now());
    const mins = Math.ceil(left / 60000);
    classStatus.innerHTML = `کد کلاس: <span class="code-box">${info.code}</span> — تا پایان: ${mins} دقیقه`;
  } else {
    classStatus.innerText = "کد کلاس ساخته نشده است. برای شروع کلاس دکمه 'شروع کلاس' را بزنید.";
  }
  renderClassButtons();
}

// ---- پرسش سریع ----
function quickQuestion() {
  const name = prompt("نام دانش‌آموز برای پرسش سریع (افزودن + یا ثبت نمره یا -):\nفرمت: نام , عمل (plus/minus/score) , مقدار\nمثال: امیرعلی,plus,1  یا سارا,score,18");
  if (!name) return;
  const parts = name.split(",").map(s=>s.trim());
  if (parts.length < 2) return alert("ورودی نامعتبر");
  const student = parts[0];
  const action = parts[1];
  const val = parts[2] ? parts[2] : "1";
  const rows = Array.from(attendanceTableBody.querySelectorAll("tr")).filter(r=>r.id !== "addStudentRow");
  const r = rows.find(rr => rr.children[0].innerText === student);
  if (!r) return alert("دانش‌آموز یافت نشد");
  if (action === "plus") {
    const span = r.children[2].querySelector("span");
    span.innerText = parseInt(span.innerText || "0") + parseInt(val);
  } else if (action === "minus") {
    const span = r.children[3].querySelector("span");
    span.innerText = parseInt(span.innerText || "0") + parseInt(val);
  } else if (action === "score") {
    const input = r.children[4].querySelector("input");
    input.value = val;
  } else {
    alert("عملیات نامشخص");
  }
}

// ---- فیلتر دانش‌آموز ----
function filterStudents() {
  const term = searchStudent.value.trim();
  const trs = attendanceTableBody.querySelectorAll("tr");
  trs.forEach(tr => {
    if (tr.id === "addStudentRow") return;
    const student = tr.children[0].innerText;
    if (term === "" || student.includes(term)) tr.style.display = "";
    else tr.style.display = "none";
  });
}

// ---- گزارش کلی مشاور (شامل تکالیف همه دبیران) ----
function showGlobalReport() {
  const agg = buildAggregate();
  reportContent.innerHTML = "";
  // جدول حضور/غیاب و نمرات
  for (const cls in agg) {
    const div = document.createElement("div");
    div.innerHTML = `<h3>${cls}</h3>`;
    const tbl = document.createElement("table");
    tbl.innerHTML = `<tr><th>دانش‌آموز</th><th>حاضر</th><th>غایب</th><th>+</th><th>-</th><th>میانگین نمره</th></tr>`;
    for (const student in agg[cls]) {
      const a = agg[cls][student];
      const avg = a.scores.length ? (a.scores.reduce((x,y)=>x+y,0)/a.scores.length).toFixed(2) : "-";
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${student}</td><td>${a.present}</td><td>${a.absent}</td><td>${a.plus}</td><td>${a.minus}</td><td>${avg}</td>`;
      tbl.appendChild(tr);
    }
    div.appendChild(tbl);
    reportContent.appendChild(div);
  }

  // لیست تکالیف گروه‌بندی‌شده بر حسب دبیر
  const assignDiv = document.createElement("div");
  assignDiv.innerHTML = `<h3>تکالیف ثبت‌شده (بر حسب دبیر)</h3>`;
  const byTeacher = {};
  assignments.forEach(a => {
    const who = a.teacher || a.teacherUsername || "نامعلوم";
    if (!byTeacher[who]) byTeacher[who] = [];
    byTeacher[who].push(a);
  });
  for (const t in byTeacher) {
    const d = document.createElement("div");
    d.innerHTML = `<h4>${t}</h4>`;
    const ul = document.createElement("ul");
    byTeacher[t].forEach(item => {
      const li = document.createElement("li");
      li.innerText = `[${new Date(item.dateISO).toLocaleString('fa-IR')}] کلاس: ${item.class} — دانش‌آموز: ${item.student} — ${item.text}`;
      ul.appendChild(li);
    });
    d.appendChild(ul);
    assignDiv.appendChild(d);
  }
  reportContent.appendChild(assignDiv);

  showSection("report");
}

// ---- مدیریت دانش‌آموزان و کلاس ----
function addStudentToClass(cls, student) {
  classes[cls].push(student);
  saveToLS(LS_CLASSES, classes);
}
function removeStudentFromClass(cls, student) {
  classes[cls] = classes[cls].filter(s=>s!==student);
  saveToLS(LS_CLASSES, classes);
}

// ---- مدیریت دبیران توسط مشاور ----
function openTeacherManage() {
  if (!currentTeacher || !currentTeacher.canManageStudents) return alert("فقط مشاور دسترسی دارد.");
  renderTeacherList();
  showSection("teachermanage");
}
function renderTeacherList() {
  teacherListDiv.innerHTML = "<h3>لیست دبیران</h3>";
  const tbl = document.createElement("table");
  tbl.innerHTML = `<tr><th>نام کاربری</th><th>نام نمایشی</th><th>درس</th><th>دسترسی مدیریت</th><th>اقدامات</th></tr>`;
  for (const username in teachers) {
    const t = teachers[username];
    const tr = document.createElement("tr");
    const can = t.canManageStudents ? "بله" : "خیر";
    tr.innerHTML = `<td>${username}</td><td>${t.name}</td><td>${t.subject}</td><td>${can}</td>`;
    const tdAct = document.createElement("td");
    const del = document.createElement("button"); del.type="button"; del.className="small"; del.innerText="حذف";
    del.addEventListener("click", ()=> {
      if (!confirm(`آیا از حذف دبیر ${username} اطمینان دارید؟`)) return;
      delete teachers[username];
      saveToLS(LS_TEACHERS, teachers);
      renderTeacherList();
    });
    tdAct.appendChild(del);
    tr.appendChild(tdAct);
    tbl.appendChild(tr);
  }
  teacherListDiv.appendChild(tbl);
}

function handleAddTeacher() {
  const uname = newTeacherName.value.trim();
  const display = newTeacherDisplay.value.trim() || uname;
  const subj = newTeacherSubject.value.trim() || "نامشخص";
  const pwd = newTeacherPassword.value.trim() || "0000";
  if (!uname) return alert("نام کاربری معتبر وارد کنید");
  if (teachers[uname]) return alert("این نام کاربری موجود است");
  teachers[uname] = { password: pwd, name: display, subject: subj, canManageStudents:false };
  saveToLS(LS_TEACHERS, teachers);
  newTeacherName.value=""; newTeacherDisplay.value=""; newTeacherSubject.value=""; newTeacherPassword.value="";
  renderTeacherList();
  alert("دبیر افزوده شد.");
}

// ---- کمکی: شناسه تصادفی امن ----
function cryptoRandomId() {
  const arr = new Uint32Array(4);
  window.crypto.getRandomValues(arr);
  return Array.from(arr).map(n=>n.toString(16)).join("-");
}

// ---- بازیابی و ذخیره‌ها (ذخیره‌ها انجام شده‌اند در توابع بالا) ----

// در صورت نیاز بعدها: تابع حذف کردن export CSV حذف شد طبق درخواست کاربر

// ---- بازیابی اولیه UI ----
renderClassButtons();

// ---- utility small functions ----
function escapeCsv(v) { return `"${(v||"").replace(/"/g,'""')}"`; }
