const SUPABASE_URL = "https://qzcapeempzzdhicsweqz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_nXxnpG6C_RO9mVqcYEt1mg_Z9Z-dpDr";
const SUPABASE_TABLE = "work_tasks";
const LEGACY_STORAGE_KEY = "work-app-state";
const PENDING_STORAGE_KEY = "work-app-pending-state";
const APP_VERSION = "1";
const APP_VERSION_KEY = "work-app-version";
const DOUBLE_TAP_DELAY_MS = 280;
const PRIORITIES = {
  high: {
    label: "Високий",
    className: "priority-high",
  },
  medium: {
    label: "Середній",
    className: "priority-medium",
  },
  low: {
    label: "Лоу",
    className: "priority-low",
  },
};
const PRIORITY_ORDER = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};
const PRIORITY_GROUPS = [
  {
    key: "high",
    label: "Високий пріоритет",
    dotClass: "priority-high",
    description: "Найважливіші задачі, які потребують негайної уваги",
    badge: "Терміново",
    icon: "up",
  },
  {
    key: "medium",
    label: "Середній пріоритет",
    dotClass: "priority-medium",
    description: "Важливі задачі, які варто виконати найближчим часом",
    badge: "Важливо",
    icon: "minus",
  },
  {
    key: "low",
    label: "Низький пріоритет",
    dotClass: "priority-low",
    description: "Задачі без терміновості, які можна виконати пізніше",
    badge: "Можна зачекати",
    icon: "down",
  },
  {
    key: "none",
    label: "Без пріоритету",
    dotClass: "priority-none",
    description: "Задачі без встановленого пріоритету",
    badge: "Без пріоритету",
    icon: "equals",
  },
];

const PRIORITY_GROUP_ICONS = {
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M18 13l-6 6-6-6"/></svg>',
  equals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 9h14"/><path d="M5 15h14"/></svg>',
};
const collapsedPriorityGroups = new Set();

const POMODORO_WORK_SECONDS = 45 * 60;
const POMODORO_BREAK_SECONDS = 15 * 60;
const pomodoroState = {
  mode: "work", // "work" | "break"
  remaining: POMODORO_WORK_SECONDS,
  running: false,
  intervalId: null,
};

function formatPomodoroTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const seconds = Math.floor(safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function renderPomodoro() {
  if (!els.pomodoroTime) return;
  els.pomodoroTime.textContent = formatPomodoroTime(pomodoroState.remaining);
  if (els.pomodoroMode) els.pomodoroMode.textContent = pomodoroState.mode === "work" ? "Робота" : "Перерва";
  els.pomodoroWidget?.classList.toggle("on-break", pomodoroState.mode === "break");
  if (els.pomodoroStartButton) els.pomodoroStartButton.disabled = pomodoroState.running;
  if (els.pomodoroStopButton) els.pomodoroStopButton.disabled = !pomodoroState.running;
}

// "Time's up" sound for the Pomodoro timer — plays the user-provided mp3.
const pomodoroAudioElement = new Audio("sounds/pomodoro.mp3");
pomodoroAudioElement.preload = "auto";

function playPomodoroChime() {
  try {
    pomodoroAudioElement.currentTime = 0;
    pomodoroAudioElement.play().catch((error) => {
      console.warn("Не вдалося відтворити звук таймера:", error);
    });
  } catch (error) {
    // Sound is a nice-to-have; never let it break the timer itself.
  }
}

function pomodoroTick() {
  pomodoroState.remaining -= 1;
  if (pomodoroState.remaining <= 0) {
    playPomodoroChime();
    if (pomodoroState.mode === "work") {
      // Work session finished — roll straight into the 15-minute break.
      pomodoroState.mode = "break";
      pomodoroState.remaining = POMODORO_BREAK_SECONDS;
    } else {
      // Break finished — stop and reset back to a fresh work session.
      pomodoroState.mode = "work";
      pomodoroState.remaining = POMODORO_WORK_SECONDS;
      stopPomodoro();
    }
  }
  renderPomodoro();
  savePomodoroState();
}

function startPomodoro() {
  if (pomodoroState.running) return;
  pomodoroState.running = true;
  pomodoroState.intervalId = window.setInterval(pomodoroTick, 1000);
  renderPomodoro();
  savePomodoroState();
}

function stopPomodoro() {
  pomodoroState.running = false;
  if (pomodoroState.intervalId) window.clearInterval(pomodoroState.intervalId);
  pomodoroState.intervalId = null;
  renderPomodoro();
  savePomodoroState();
}

function resetPomodoro() {
  stopPomodoro();
  pomodoroState.mode = "work";
  pomodoroState.remaining = POMODORO_WORK_SECONDS;
  renderPomodoro();
  savePomodoroState();
}

// --- Persisting the Pomodoro timer across page reloads --------------------
// We never trust the ticking "remaining" value across a reload (the JS
// interval is destroyed the moment the page unloads). Instead we store the
// wall-clock timestamp the current segment ends at, then recompute
// "remaining" from real elapsed time whenever the app (re)starts — that way
// refreshing the page, closing the tab, or the phone screen locking doesn't
// reset or desync the countdown.
const POMODORO_STORAGE_KEY = "pomodoroState:v1";

function savePomodoroState() {
  try {
    localStorage.setItem(POMODORO_STORAGE_KEY, JSON.stringify({
      mode: pomodoroState.mode,
      running: pomodoroState.running,
      remaining: pomodoroState.remaining,
      endAt: pomodoroState.running ? Date.now() + pomodoroState.remaining * 1000 : null,
    }));
  } catch (error) {
    // Storage may be unavailable (e.g. private browsing) — the timer still
    // works for the current tab session, it just won't survive a reload.
  }
}

function loadPomodoroState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(POMODORO_STORAGE_KEY));
  } catch (error) {
    saved = null;
  }
  if (!saved) return;

  pomodoroState.mode = saved.mode === "break" ? "break" : "work";

  if (saved.running && saved.endAt) {
    const remainingNow = Math.round((saved.endAt - Date.now()) / 1000);
    if (remainingNow > 0) {
      // Still mid-segment — resume the countdown from real elapsed time
      // instead of restarting it from the full duration.
      pomodoroState.remaining = remainingNow;
      pomodoroState.running = true;
      pomodoroState.intervalId = window.setInterval(pomodoroTick, 1000);
    } else {
      // The segment finished while the page was closed/reloaded — land on
      // "time's up" for it rather than silently resetting to a full timer.
      pomodoroState.remaining = 0;
      pomodoroState.running = false;
    }
  } else {
    pomodoroState.remaining = Number.isFinite(saved.remaining) ? saved.remaining : POMODORO_WORK_SECONDS;
    pomodoroState.running = false;
  }
}

const els = {
  addButton: document.querySelector("#addButton"),
  closeTaskModalButton: document.querySelector("#closeTaskModalButton"),
  micButton: document.querySelector("#micButton"),
  navMicButton: document.querySelector("#navMicButton"),
  submitTaskButton: document.querySelector("#submitTaskButton"),
  taskInput: document.querySelector("#taskInput"),
  taskReminder: document.querySelector("#taskReminder"),
  newReminderEnabled: document.querySelector("#newReminderEnabled"),
  newReminderDay: document.querySelector("#newReminderDay"),
  newReminderMonth: document.querySelector("#newReminderMonth"),
  newReminderYear: document.querySelector("#newReminderYear"),
  newReminderHour: document.querySelector("#newReminderHour"),
  newReminderMinute: document.querySelector("#newReminderMinute"),
  taskRepeat: document.querySelector("#taskRepeat"),
  taskModal: document.querySelector("#taskModal"),
  taskList: document.querySelector("#taskList"),
  taskSearch: document.querySelector("#taskSearch"),
  taskFilterTabs: document.querySelectorAll("[data-task-filter]"),
  taskFilterCounts: document.querySelectorAll("[data-task-filter-count]"),
  mandatoryFilterTabs: document.querySelectorAll("[data-mandatory-filter]"),
  mandatoryFilterCounts: document.querySelectorAll("[data-mandatory-filter-count]"),
  pomodoroWidget: document.querySelector("#pomodoroWidget"),
  pomodoroMode: document.querySelector("#pomodoroMode"),
  pomodoroTime: document.querySelector("#pomodoroTime"),
  pomodoroStartButton: document.querySelector("#pomodoroStartButton"),
  pomodoroStopButton: document.querySelector("#pomodoroStopButton"),
  pomodoroResetButton: document.querySelector("#pomodoroResetButton"),
  notifPermissionButton: document.querySelector("#notifPermissionButton"),
  appShell: document.querySelector(".app-shell"),
  tasksPanel: document.querySelector("#tasksPanel"),
  tasksTab: document.querySelector("#tasksTab"),
  tasksNav: document.querySelector("#tasksNav"),
  archivePanel: document.querySelector("#archivePanel"),
  archiveList: document.querySelector("#archiveList"),
  archiveNav: document.querySelector("#archiveNav"),
  calendarPanel: document.querySelector("#calendarPanel"),
  calendarNav: document.querySelector("#calendarNav"),
  calendarGrid: document.querySelector("#calendarGrid"),
  calendarTitle: document.querySelector("#calendarTitle"),
  calendarPrevious: document.querySelector("#calendarPrevious"),
  calendarNext: document.querySelector("#calendarNext"),
  trashList: document.querySelector("#trashList"),
  trashPanel: document.querySelector("#trashPanel"),
  trashTab: document.querySelector("#trashTab"),
  voiceStatus: document.querySelector("#voiceStatus"),
  accessScreen: document.querySelector("#accessScreen"),
  accessForm: document.querySelector("#accessForm"),
  accessEmail: document.querySelector("#accessEmail"),
  accessPassword: document.querySelector("#accessPassword"),
  accessError: document.querySelector("#accessError"),
  logoutButton: document.querySelector("#logoutButton"),
  themeToggleButton: document.querySelector("#themeToggleButton"),
  dailyLogWidget: document.querySelector("#dailyLogWidget"),
  dailyLogList: document.querySelector("#dailyLogList"),
  dailyLogEmpty: document.querySelector("#dailyLogEmpty"),
  dailyLogInputRow: document.querySelector("#dailyLogInputRow"),
  dailyLogInput: document.querySelector("#dailyLogInput"),
  dailyLogAddButton: document.querySelector("#dailyLogAddButton"),
  dailyLogMicButton: document.querySelector("#dailyLogMicButton"),
  dailyLogStatus: document.querySelector("#dailyLogStatus"),
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let supabaseClient = null;
let recognition = null;
let shouldAutoAddVoiceResult = false;
let dragState = null;
let navMicTapTimer = null;
let priorityPickerTaskId = null;
let activeTaskFilter = "all";
let taskSearchQuery = "";
let activeMandatoryFilter = "one-time";
let taskFilterSwipe = null;
let mandatoryFilterSwipe = null;
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let syncedTaskIds = new Set();
let appDataReady = false;
const earlyRecurringCompletionIds = new Set();
let earlyRecurringTapState = null;
const state = {
  tasks: [],
  trash: [],
};

// --- "Що робив сьогодні?" daily log widget --------------------------------
// A lightweight, purely local (localStorage) list of things done today.
// Entries are tagged with the date they were added on; only today's entries
// are shown, so the list naturally starts empty again the next day.
const DAILY_LOG_STORAGE_KEY = "dailyLogState:v1";
let dailyLogEntries = [];
let dailyLogRecognition = null;
let dailyLogListening = false;

function todayDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function loadDailyLog() {
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_LOG_STORAGE_KEY));
    dailyLogEntries = Array.isArray(saved) ? saved : [];
  } catch (error) {
    dailyLogEntries = [];
  }
}

function saveDailyLog() {
  try {
    localStorage.setItem(DAILY_LOG_STORAGE_KEY, JSON.stringify(dailyLogEntries));
  } catch (error) {
    // Storage may be unavailable (e.g. private browsing) — the list still
    // works for the current tab session, it just won't survive a reload.
  }
}

function renderDailyLog() {
  if (!els.dailyLogList) return;
  const today = todayDateKey();
  const todaysEntries = dailyLogEntries.filter((entry) => entry.date === today);

  els.dailyLogList.replaceChildren(
    ...todaysEntries.map((entry) => {
      const item = document.createElement("li");
      item.className = "daily-log-item";

      const text = document.createElement("span");
      text.className = "daily-log-item-text";
      text.textContent = entry.text;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "daily-log-item-remove";
      removeButton.setAttribute("aria-label", "Видалити запис");
      removeButton.textContent = "×";
      removeButton.addEventListener("click", () => removeDailyLogEntry(entry.id));

      item.append(text, removeButton);
      return item;
    }),
  );

  if (els.dailyLogEmpty) els.dailyLogEmpty.hidden = todaysEntries.length > 0;
}

function capitalizeFirstLetter(text) {
  return text.length ? text[0].toLocaleUpperCase("uk-UA") + text.slice(1) : text;
}

function addDailyLogEntry(rawText) {
  const text = capitalizeFirstLetter(String(rawText || "").trim());
  if (!text) return;
  dailyLogEntries.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, text, date: todayDateKey() });
  saveDailyLog();
  renderDailyLog();
}

function removeDailyLogEntry(id) {
  dailyLogEntries = dailyLogEntries.filter((entry) => entry.id !== id);
  saveDailyLog();
  renderDailyLog();
}

function openDailyLogInput() {
  if (!els.dailyLogInputRow) return;
  els.dailyLogInputRow.hidden = false;
  els.dailyLogInput.value = "";
  els.dailyLogInput.focus();
}

function closeDailyLogInput() {
  if (!els.dailyLogInputRow) return;
  els.dailyLogInputRow.hidden = true;
  els.dailyLogInput.value = "";
}

function submitDailyLogInput() {
  const value = els.dailyLogInput.value.trim();
  if (!value) {
    closeDailyLogInput();
    return;
  }
  addDailyLogEntry(value);
  closeDailyLogInput();
}

// Voice dictation for the daily log runs "continuously": each pause in
// speech finalizes one result, which becomes its own list entry, so saying
// "Чистив нц" ... pause ... "Писав репорт" adds two separate items in one
// mic session. Tap the mic again to stop listening.
function setupDailyLogSpeechRecognition() {
  if (!els.dailyLogMicButton) return;
  if (!SpeechRecognition) {
    els.dailyLogMicButton.disabled = true;
    return;
  }

  dailyLogRecognition = new SpeechRecognition();
  dailyLogRecognition.lang = "uk-UA";
  dailyLogRecognition.continuous = true;
  dailyLogRecognition.interimResults = false;
  dailyLogRecognition.maxAlternatives = 1;

  dailyLogRecognition.addEventListener("start", () => {
    dailyLogListening = true;
    els.dailyLogMicButton.classList.add("listening");
    if (els.dailyLogStatus) els.dailyLogStatus.textContent = "Слухаю... Кажіть по одній справі за раз.";
    playMicStartSound();
  });

  dailyLogRecognition.addEventListener("result", (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (!result.isFinal) continue;
      const transcript = result[0].transcript.trim();
      if (transcript) addDailyLogEntry(transcript);
    }
  });

  dailyLogRecognition.addEventListener("error", (event) => {
    if (event.error === "no-speech") return;
    dailyLogListening = false;
    els.dailyLogMicButton.classList.remove("listening");
    if (els.dailyLogStatus) els.dailyLogStatus.textContent = "Не вдалося розпізнати голос. Спробуйте ще раз.";
  });

  dailyLogRecognition.addEventListener("end", () => {
    if (dailyLogListening) {
      // Some browsers auto-stop after each pause even with continuous=true —
      // restart transparently so it truly feels like one ongoing session.
      try {
        dailyLogRecognition.start();
        return;
      } catch (error) {
        // Fall through to a full stop below.
      }
    }
    dailyLogListening = false;
    els.dailyLogMicButton.classList.remove("listening");
    playMicStopSound();
    if (els.dailyLogStatus) els.dailyLogStatus.textContent = "";
  });
}

function toggleDailyLogVoiceInput() {
  if (!dailyLogRecognition) return;
  if (dailyLogListening) {
    dailyLogListening = false;
    dailyLogRecognition.stop();
    return;
  }
  try {
    dailyLogRecognition.start();
  } catch (error) {
    // Already starting/running — ignore.
  }
}

function fillReminderSelect(select, values, selected) {
  select.replaceChildren(...values.map(([value, text]) => new Option(text, value, value === selected, value === selected)));
}

function setupNewReminderPicker() {
  const now = new Date(Date.now() + 3600000);
  fillReminderSelect(els.newReminderDay, Array.from({ length: 31 }, (_, i) => {
    const value = String(i + 1).padStart(2, "0"); return [value, value];
  }), String(now.getDate()).padStart(2, "0"));
  fillReminderSelect(els.newReminderMonth, ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"].map((text, i) => [String(i), text]), String(now.getMonth()));
  fillReminderSelect(els.newReminderYear, Array.from({ length: 6 }, (_, i) => {
    const year = String(now.getFullYear() + i); return [year, year];
  }), String(now.getFullYear()));
  fillReminderSelect(els.newReminderHour, Array.from({ length: 24 }, (_, i) => { const v = String(i).padStart(2, "0"); return [v, v]; }), String(now.getHours()).padStart(2, "0"));
  fillReminderSelect(els.newReminderMinute, Array.from({ length: 12 }, (_, i) => { const v = String(i * 5).padStart(2, "0"); return [v, v]; }), String(Math.round(now.getMinutes() / 5) * 5 % 60).padStart(2, "0"));
}

function getNewReminderValue() {
  return new Date(Number(els.newReminderYear.value), Number(els.newReminderMonth.value), Number(els.newReminderDay.value), Number(els.newReminderHour.value), Number(els.newReminderMinute.value)).toISOString();
}

function updateNewReminderVisibility() {
  els.taskReminder.hidden = !els.newReminderEnabled.checked;
  if (!els.newReminderEnabled.checked) els.taskRepeat.value = "none";
}

function ensureAppVersion() {
  const savedVersion = localStorage.getItem(APP_VERSION_KEY);
  const currentUrl = new URL(window.location.href);
  const currentVersionParam = currentUrl.searchParams.get("appv");

  if (savedVersion !== APP_VERSION && currentVersionParam !== APP_VERSION) {
    localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
    currentUrl.searchParams.set("appv", APP_VERSION);
    window.location.replace(currentUrl.toString());
    return false;
  }

  localStorage.setItem(APP_VERSION_KEY, APP_VERSION);
  return true;
}

async function openApp() {
  if (appDataReady) return;
  if (!ensureAppVersion()) return;
  await initDatabase();
  appDataReady = true;
  document.body.classList.remove("access-locked");
  document.body.classList.remove("auth-pending");
  els.accessScreen.hidden = true;
  requestReminderNotificationPermission();
  await processNativeNotificationAction();
}

function showAccessScreen() {
  appDataReady = false;
  document.body.classList.add("access-locked");
  document.body.classList.remove("auth-pending");
  els.accessScreen.hidden = false;
}

async function setupAccessGate() {
  if (!window.supabase) {
    showAccessScreen();
    els.accessError.textContent = "Не вдалося завантажити модуль входу. Перевірте інтернет.";
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) await openApp(); else showAccessScreen();
  } catch (error) {
    console.error("Failed to restore the Supabase session:", error);
    showAccessScreen();
    els.accessError.textContent = "Не вдалося перевірити вхід. Спробуйте ще раз.";
  }

  els.accessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = els.accessEmail.value.trim();
    const password = els.accessPassword.value;
    if (!email || !password) {
      els.accessError.textContent = "Введіть email і пароль.";
      return;
    }
    els.accessError.textContent = "";
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) els.accessError.textContent = "Не вдалося увійти: " + error.message;
  });
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    if (session) await openApp(); else showAccessScreen();
  });
  els.accessEmail.focus();
}

function normalizeState(value) {
  return {
    tasks: Array.isArray(value?.tasks) ? value.tasks.map(normalizeTask) : [],
    trash: Array.isArray(value?.trash) ? value.trash.map(normalizeTask) : [],
  };
}

function normalizeTask(task) {
  const priority = task?.priority === "priority-high" ? "high"
    : task?.priority === "priority-medium" ? "medium"
      : task?.priority === "priority-low" ? "low" : task?.priority;
  return {
    ...task,
    category: task?.category === "bookmarks" ? "bookmarks" : null,
    priority: isUrgentTaskTitle(task?.title || "") ? "high" : (hasPriority(priority) ? priority : null),
  };
}

function hasPriority(priority) {
  return Object.prototype.hasOwnProperty.call(PRIORITIES, priority);
}

function getPriorityRank(task) {
  return hasPriority(task?.priority) ? PRIORITY_ORDER[task.priority] : PRIORITY_ORDER.none;
}

function getReminderTime(task) {
  return task?.reminderAt && !task.done ? new Date(task.reminderAt).getTime() : null;
}

function sortTasksByPriority(tasks) {
  return tasks
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const reminderA = getReminderTime(a.task);
      const reminderB = getReminderTime(b.task);
      return (
        Number(getTaskCategory(a.task) !== "bookmarks") - Number(getTaskCategory(b.task) !== "bookmarks")
        || getPriorityRank(a.task) - getPriorityRank(b.task)
        || Number(reminderB !== null) - Number(reminderA !== null)
        || (reminderA !== null && reminderB !== null ? reminderA - reminderB : 0)
        || a.index - b.index
      );
    })
    .map(({ task }) => task);
}

function sortActiveTasks() {
  state.tasks = sortTasksByPriority(state.tasks);
}

function getTaskCategory(task) {
  if (task.category === "bookmarks") return "bookmarks";
  const title = task.title.toLocaleLowerCase("uk-UA");
  const matches = [
    ["bookmarks", title.indexOf("заклад")],
    ["buy", title.indexOf("купит")],
    ["laptops", title.indexOf("ноутбук")],
  ].filter(([, index]) => index !== -1);

  if (matches.length) {
    matches.sort(([, firstIndex], [, secondIndex]) => firstIndex - secondIndex);
    return matches[0][0];
  }

  return null;
}

function getFilteredTasks() {
  return state.tasks.filter((task) => {
    const category = getTaskCategory(task);
    const matchesFilter = activeTaskFilter === "all" || category === activeTaskFilter;
    const matchesSearch = !taskSearchQuery || task.title.toLocaleLowerCase("uk-UA").includes(taskSearchQuery);
    return matchesFilter && matchesSearch;
  });
}

function getMandatoryTasks() {
  if (activeMandatoryFilter === "daily") {
    // Keep today's completed occurrences below the tasks that still need attention,
    // then show each group in the actual reminder-time order.
    return state.tasks
      .filter((task) => task.recurrence === "daily")
      .sort((first, second) => (
        Number(isRecurringTaskCompletedToday(first)) - Number(isRecurringTaskCompletedToday(second))
        || new Date(first.reminderAt).getTime() - new Date(second.reminderAt).getTime()
      ));
  }

  if (activeMandatoryFilter === "other") {
    return state.tasks
      .filter((task) => Boolean(task.recurrence) && task.recurrence !== "daily")
      .sort((first, second) => new Date(first.reminderAt).getTime() - new Date(second.reminderAt).getTime());
  }

  // Reminder tasks must be listed by their scheduled time, not by the order
  // in which they were created or by their priority.
  return state.tasks
    .filter((task) => Boolean(task.reminderAt) && !task.recurrence && !task.done)
    .sort((first, second) => new Date(first.reminderAt).getTime() - new Date(second.reminderAt).getTime());
}

function applyState(nextState) {
  const normalized = normalizeState(nextState);
  state.tasks = sortTasksByPriority(normalized.tasks);
  state.trash = normalized.trash;
}

function readLegacyState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)));
  } catch {
    return { tasks: [], trash: [] };
  }
}

function readPendingState() {
  try {
    return normalizeState(JSON.parse(localStorage.getItem(PENDING_STORAGE_KEY)));
  } catch {
    return { tasks: [], trash: [] };
  }
}

function hasTasks(value) {
  return value.tasks.length > 0 || value.trash.length > 0;
}

function getStateSnapshot() {
  sortActiveTasks();
  return {
    tasks: state.tasks,
    trash: state.trash,
  };
}

function toDatabaseTask(task, isDeleted) {
  return {
    id: task.id,
    value: task.title,
    done: Boolean(task.done),
    priority: task.priority || null,
    category: task.category || null,
    created_at: new Date(task.createdAt || Date.now()).toISOString(),
    reminder_at: task.reminderAt || null,
    recurrence: task.recurrence || null,
    last_completed_at: task.lastCompletedAt ? new Date(task.lastCompletedAt).toISOString() : null,
    deleted_at: isDeleted ? new Date(task.deletedAt || Date.now()).toISOString() : null,
  };
}

function fromDatabaseTask(row) {
  return normalizeTask({
    id: row.id,
    title: row.value,
    done: row.done,
    priority: row.priority,
    category: row.category,
    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    reminderAt: row.reminder_at,
    recurrence: row.recurrence,
    lastCompletedAt: row.last_completed_at ? new Date(row.last_completed_at).getTime() : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at).getTime() : null,
  });
}

function setSyncStatus() {
  // Sync messages stay silent in the UI.
}

async function getSupabaseHeaders(extra = {}) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) throw new Error("Потрібно увійти в акаунт.");
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
    ...extra,
  };
}

async function parseSupabaseError(response) {
  try {
    const body = await response.json();
    return body.message || body.error || response.statusText;
  } catch {
    return response.statusText;
  }
}

async function saveState() {
  localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(getStateSnapshot()));
  setSyncStatus("Зберігаю...", "neutral");

  if (!supabaseClient) {
    console.error("Supabase client is not ready.");
    setSyncStatus("Не підключено до бази. Збережено тимчасово.", "error");
    return false;
  }

  const snapshot = getStateSnapshot();
  const rows = [
    ...snapshot.tasks.map((task) => toDatabaseTask(task, false)),
    ...snapshot.trash.map((task) => toDatabaseTask(task, true)),
  ];
  const currentIds = new Set(rows.map((task) => task.id));

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=id`, {
      method: "POST",
      headers: await getSupabaseHeaders({
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      }),
      body: JSON.stringify(rows),
    });

    if (!response.ok) throw new Error(await parseSupabaseError(response));

    const removedIds = [...syncedTaskIds].filter((id) => !currentIds.has(id));
    if (removedIds.length) {
      const deleteResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=in.(${removedIds.join(",")})`,
        { method: "DELETE", headers: await getSupabaseHeaders() },
      );
      if (!deleteResponse.ok) throw new Error(await parseSupabaseError(deleteResponse));
    }

    syncedTaskIds = currentIds;
  } catch (error) {
    console.error("Failed to save tasks to Supabase:", error);
    setSyncStatus("Не збережено в базу: немає з'єднання", "error");
    return false;
  }

  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(PENDING_STORAGE_KEY);
  setSyncStatus("Збережено в базу", "success");
  return true;
}

async function loadState() {
  if (!supabaseClient) return;
  setSyncStatus("Читаю базу...", "neutral");

  const legacyState = readLegacyState();
  const pendingState = readPendingState();
  let rows = null;
  let recoveredPending = false;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=*&order=created_at.asc`,
      {
        headers: await getSupabaseHeaders(),
      },
    );
    if (!response.ok) throw new Error(await parseSupabaseError(response));
    rows = await response.json();

    // Completed one-off tasks that are still "active" (not yet archived) are
    // not kept as history in the shared table. Archived ones (deleted_at set,
    // i.e. already moved to state.trash) must be left alone, or the archive
    // would get wiped on every reload.
    const completedOneOffIds = rows
      .filter((row) => row.done && !row.recurrence && !row.deleted_at)
      .map((row) => row.id);
    if (completedOneOffIds.length) {
      const deleteResponse = await fetch(
        `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=in.(${completedOneOffIds.join(",")})`,
        { method: "DELETE", headers: await getSupabaseHeaders() },
      );
      if (!deleteResponse.ok) throw new Error(await parseSupabaseError(deleteResponse));
      rows = rows.filter((row) => !completedOneOffIds.includes(row.id));
    }
  } catch (error) {
    console.error("Failed to load tasks from Supabase:", error);
    setSyncStatus("Не прочитано з бази", "error");
    if (hasTasks(pendingState)) applyState(pendingState);
    else if (hasTasks(legacyState)) applyState(legacyState);
    render();
    return;
  }

  // The shared database is the source of truth. A stale offline copy from a
  // different browser must never overwrite the current shared task list. Keep
  // only records missing from the database when a previous save was rejected
  // (for example, by an outdated database constraint).
  if (rows.length) {
    const databaseState = {
      tasks: rows.filter((row) => !row.deleted_at).map(fromDatabaseTask),
      trash: rows.filter((row) => row.deleted_at).map(fromDatabaseTask),
    };
    if (hasTasks(pendingState)) {
      const storedIds = new Set([...databaseState.tasks, ...databaseState.trash].map((task) => task.id));
      const missingTasks = pendingState.tasks.filter((task) => !storedIds.has(task.id));
      const missingTrash = pendingState.trash.filter((task) => !storedIds.has(task.id));
      recoveredPending = missingTasks.length > 0 || missingTrash.length > 0;
      databaseState.tasks.push(...missingTasks);
      databaseState.trash.push(...missingTrash);
    }
    applyState(databaseState);
    syncedTaskIds = new Set(rows.map((row) => row.id));
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    localStorage.removeItem(PENDING_STORAGE_KEY);
  } else if (hasTasks(legacyState)) {
    applyState(legacyState);
    setSyncStatus("Локальні задачі готові до збереження", "neutral");
  } else if (hasTasks(pendingState)) {
    applyState(pendingState);
    setSyncStatus("Локальні задачі готові до збереження", "neutral");
  } else {
    applyState({ tasks: [], trash: [] });
    setSyncStatus("База підключена", "success");
  }

  render();
  if (recoveredPending) await saveState();
  if (!hasTasks(readPendingState())) setSyncStatus("База підключена", "success");
}

async function initDatabase() {
  await loadState();
}

function formatDate(value) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTaskTitle(title) {
  const cleanTitle = title.trim();
  if (!cleanTitle) return "";

  return cleanTitle.charAt(0).toLocaleUpperCase("uk-UA") + cleanTitle.slice(1);
}

function parseTaskCategory(title) {
  const bookmarkCommand = /(?:^|\s)закладк[аи](?=\s|$)/iu;
  if (!bookmarkCommand.test(title)) return { title, category: null };

  const cleanTitle = title.replace(bookmarkCommand, " ").replace(/\s+/g, " ").trim();
  return { title: cleanTitle, category: "bookmarks" };
}

function isUrgentTaskTitle(title) {
  return title.toLocaleLowerCase("uk-UA").includes("терміново");
}

function createTask(title) {
  const parsedCategory = parseTaskCategory(title);
  const formattedTitle = formatTaskTitle(parsedCategory.title);
  return {
    id: crypto.randomUUID(),
    title: formattedTitle,
    done: false,
    createdAt: Date.now(),
    priority: isUrgentTaskTitle(formattedTitle) ? "high" : null,
    category: parsedCategory.category,
    reminderAt: null,
    recurrence: null,
  };
}

// Lets a dictated task like "Купити квитки пріоритет високий" (or
// "високий пріоритет купити квитки") set the priority automatically,
// instead of the words just staying in the task title.
function parseVoicePriority(text) {
  const priorityWords = {
    "високий": "high", "високим": "high", "високого": "high",
    "середній": "medium", "середнім": "medium", "середнього": "medium",
    "низький": "low", "низьким": "low", "низького": "low",
  };
  const wordPattern = Object.keys(priorityWords).join("|");
  const forwardMatch = text.match(new RegExp(`(?:^|\\s)(?:з\\s+)?пріоритет(?:ом|у)?\\s+(${wordPattern})(?=\\s|$)`, "i"));
  const backwardMatch = !forwardMatch
    ? text.match(new RegExp(`(?:^|\\s)(${wordPattern})\\s+пріоритет(?:ом|у)?(?=\\s|$)`, "i"))
    : null;
  const match = forwardMatch || backwardMatch;
  if (!match) return { title: text, priority: null };

  const priority = priorityWords[match[1].toLocaleLowerCase("uk-UA")];
  const title = text.replace(match[0], " ").replace(/\s+/g, " ").trim();
  return { title: title || text, priority };
}

function parseVoiceReminder(text) {
  const months = {
    січня: 0, лютого: 1, березня: 2, квітня: 3, травня: 4, червня: 5,
    липня: 6, серпня: 7, вересня: 8, жовтня: 9, листопада: 10, грудня: 11,
  };
  const now = new Date();
  const weekdays = {
    понеділок: 1, понеділка: 1,
    вівторок: 2, вівторка: 2,
    середа: 3, середу: 3,
    четвер: 4, четверга: 4,
    "п’ятниця": 5, "п'ятниця": 5, пятниця: 5, "п’ятницю": 5, "п'ятницю": 5, пятницю: 5,
    субота: 6, суботу: 6,
    неділя: 0, неділю: 0,
  };
  const weekdayMatch = text.match(/(?:^|\s)(понеділок|понеділка|вівторок|вівторка|середа|середу|четвер|четверга|п[’']?ятниця|п[’']?ятницю|субота|суботу|неділя|неділю)(?=\s|$)(?:\s*(?:о|в))?\s*(\d{1,2})(?:\s*[:.,]\s*(\d{1,2}))?(?:\s*(?:та\s+)?год(?:ина|ині|ин)?\.?)?/i);
  if (weekdayMatch) {
    const targetDay = weekdays[weekdayMatch[1].toLocaleLowerCase("uk-UA")];
    const reminderDate = new Date(now);
    let daysUntil = (targetDay - now.getDay() + 7) % 7;
    if (daysUntil === 0) daysUntil = 7;
    reminderDate.setDate(reminderDate.getDate() + daysUntil);
    reminderDate.setHours(Number(weekdayMatch[2]), Number(weekdayMatch[3] || 0), 0, 0);

    const title = text.replace(weekdayMatch[0], " ").replace(/^\s*(?:на|для)\s+/i, "").replace(/\s+/g, " ").trim();
    return { title: title || text, reminderAt: reminderDate.toISOString() };
  }
  const relativeMatch = text.match(/(?:^|\s)(сьогодні|завтра)(?=\s|$)(?:\s*(?:о|в))?\s*(\d{1,2})?(?:\s*[:.,]\s*(\d{1,2}))?/i);
  if (relativeMatch) {
    const reminderDate = new Date(now);
    if (relativeMatch[1].toLocaleLowerCase("uk-UA") === "завтра") {
      reminderDate.setDate(reminderDate.getDate() + 1);
    }

    const hasTime = relativeMatch[2] !== undefined;
    const roundedMinutes = Math.ceil((now.getMinutes() + 1) / 5) * 5;
    const hour = hasTime ? Number(relativeMatch[2]) : now.getHours() + Math.floor(roundedMinutes / 60);
    const minute = hasTime ? Number(relativeMatch[3] || 0) : roundedMinutes % 60;
    reminderDate.setHours(hour, minute, 0, 0);

    const title = text.replace(relativeMatch[0], " ").replace(/^\s*(?:на|для)\s+/i, "").replace(/\s+/g, " ").trim();
    return { title: title || text, reminderAt: reminderDate.toISOString() };
  }

  const match = text.match(/(?:на\s+)?(\d{1,2})\s+(січня|лютого|березня|квітня|травня|червня|липня|серпня|жовтня|листопада|грудня)(?:\s+(\d{4}))?\s*(?:о|в)\s*(\d{1,2})(?:\s*[:.,]\s*(\d{1,2}))?/i);
  if (!match) return { title: text, reminderAt: null };

  const year = Number(match[3] || now.getFullYear());
  const hour = Number(match[4]);
  const minute = Number(match[5] || 0);
  const reminderDate = new Date(year, months[match[2].toLocaleLowerCase("uk-UA")], Number(match[1]), hour, minute);
  if (!match[3] && reminderDate.getTime() < Date.now()) reminderDate.setFullYear(year + 1);
  const title = text.replace(match[0], " ").replace(/\s+/g, " ").trim();
  return { title: title || text, reminderAt: reminderDate.toISOString() };
}

function scheduleNativeReminder(task) {
  if (!task.reminderAt || !window.AndroidNotifications?.schedule) return;
  window.AndroidNotifications.schedule(String(task.id), task.title, new Date(task.reminderAt).getTime());
}

function cancelNativeReminder(taskId) {
  window.AndroidNotifications?.cancel?.(String(taskId));
}

function rescheduleNativeReminders() {
  state.tasks.forEach((task) => scheduleNativeReminder(task));
}

// --- In-app reminder alerts (sound + browser notification) ---------------
// The native Android wrapper (window.AndroidNotifications) already schedules
// system-level notifications with sound, so this fallback only runs when the
// app is used as a regular web page / installed PWA without that bridge.
const REMINDER_ALERT_INTERVAL_MS = 20000;
const firedReminderKeys = new Set();
let reminderAudioContext = null;
// Task-deadline notification sound — plays the user-provided mp3.
const reminderAudioElement = new Audio("sounds/reminder.mp3");
reminderAudioElement.preload = "auto";

function unlockReminderAudio() {
  if (window.AndroidNotifications || reminderAudioContext) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  reminderAudioContext = new AudioContextClass();
  if (reminderAudioContext.state === "suspended") reminderAudioContext.resume().catch(() => {});
}

// Mobile browsers only allow <audio> playback to start programmatically
// after a real user gesture has "unlocked" it at least once — play+pause
// silently on the first tap so later automatic play() calls succeed.
function unlockMp3Audio() {
  [reminderAudioElement, pomodoroAudioElement].forEach((audio) => {
    audio.play().then(() => {
      audio.pause();
      audio.currentTime = 0;
    }).catch(() => {});
  });
}

function playReminderSound() {
  if (window.AndroidNotifications) return;
  try {
    reminderAudioElement.currentTime = 0;
    reminderAudioElement.play().catch((error) => {
      console.warn("Не вдалося відтворити звук нагадування:", error);
    });
  } catch (error) {
    console.warn("Не вдалося відтворити звук нагадування:", error);
  }
}

function requestReminderNotificationPermission() {
  if (window.AndroidNotifications || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    // Browsers increasingly refuse to show the permission prompt at all
    // when it isn't triggered by a direct user click (it just silently
    // stays "default" forever) — this automatic attempt on login covers
    // browsers that still allow it, and updateNotifPermissionButton()
    // below shows a real "Увімкнути сповіщення" button as a fallback for
    // the ones that don't, so task-time notifications aren't silently lost.
    Notification.requestPermission().finally(updateNotifPermissionButton).catch(() => {});
  }
  updateNotifPermissionButton();
}

// Reflects (and lets the user fix) the actual browser notification
// permission — a task reminder can only ever show a system notification if
// this is "granted". If the permission was never actually granted (e.g. the
// automatic prompt above got silently ignored by the browser, or the user
// dismissed it once), reminders will fire internally but no notification
// will ever appear, which is exactly the "missing notification" symptom.
function updateNotifPermissionButton() {
  const button = els.notifPermissionButton;
  if (!button) return;
  if (window.AndroidNotifications || !("Notification" in window)) {
    button.hidden = true;
    return;
  }
  button.hidden = false;
  const permission = Notification.permission;
  if (permission === "granted") {
    button.textContent = "🔔 Сповіщення увімкнено";
    button.disabled = true;
  } else if (permission === "denied") {
    button.textContent = "🔕 Сповіщення заблоковано — дозвольте в налаштуваннях сайту в браузері";
    button.disabled = true;
  } else {
    button.textContent = "🔔 Увімкнути сповіщення";
    button.disabled = false;
  }
}

els.notifPermissionButton?.addEventListener("click", () => {
  if (!("Notification" in window)) return;
  Notification.requestPermission().finally(updateNotifPermissionButton).catch(() => {});
});

function highlightReminderTaskInView(taskId) {
  const item = els.taskList?.querySelector(`.task-item[data-task-id="${CSS.escape(String(taskId))}"]`)
    || els.archiveList?.querySelector(`.task-item[data-task-id="${CSS.escape(String(taskId))}"]`);
  if (!item) return;
  item.scrollIntoView({ behavior: "smooth", block: "center" });
  item.classList.add("notification-target");
  window.setTimeout(() => item.classList.remove("notification-target"), 3000);
}

function showReminderBrowserNotification(task) {
  if (window.AndroidNotifications || !("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const notification = new Notification("Нагадування", {
      body: task.title,
      tag: `reminder-${task.id}`,
      icon: "icon-192.png",
    });
    notification.onclick = () => {
      window.focus();
      highlightReminderTaskInView(task.id);
      notification.close();
    };
  } catch (error) {
    console.warn("Не вдалося показати сповіщення нагадування:", error);
  }
}

function fireReminderAlert(task) {
  playReminderSound();
  showReminderBrowserNotification(task);
  highlightReminderTaskInView(task.id);
}

// --- Microphone start/stop sound cues --------------------------------------
function playTone(frequencies, { duration = 0.14, gap = 0.02, gainPeak = 0.28 } = {}) {
  if (window.AndroidNotifications) return;
  try {
    unlockReminderAudio();
    const ctx = reminderAudioContext;
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    frequencies.forEach((frequency, index) => {
      const offset = index * (duration + gap);
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(gainPeak, now + offset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(now + offset);
      oscillator.stop(now + offset + duration);
    });
  } catch (error) {
    console.warn("Не вдалося відтворити звук мікрофона:", error);
  }
}

function playMicStartSound() {
  playTone([660, 990]);
}

function playMicStopSound() {
  playTone([880, 587]);
}

function checkDueReminders() {
  if (!appDataReady || window.AndroidNotifications) return;
  const now = Date.now();
  state.tasks.forEach((task) => {
    if (!task.reminderAt || task.done) return;
    const dueTime = new Date(task.reminderAt).getTime();
    if (Number.isNaN(dueTime) || dueTime > now) return;
    const key = `${task.id}:${task.reminderAt}`;
    if (firedReminderKeys.has(key)) return;
    firedReminderKeys.add(key);
    fireReminderAlert(task);
  });
}

// The Android home-screen widget cannot access WebView storage directly.
// Keep it supplied with the current active task list whenever the UI changes.
function syncAndroidWidget() {
  try {
    window.AndroidWidget?.sync?.(JSON.stringify(state.tasks.map((task) => ({
      id: String(task.id),
      title: task.title,
      category: task.category,
      // Send a numeric timestamp so the native widget is independent of the
      // date string format returned by Supabase.
      reminderAt: task.reminderAt ? new Date(task.reminderAt).getTime() : null,
      recurrence: task.recurrence,
      done: Boolean(task.done),
    }))));
  } catch (_) {}
}

async function addTask() {
  const title = els.taskInput.value.trim();
  if (!title) {
    els.taskInput.focus();
    return;
  }

  const priorityParsed = parseVoicePriority(title);
  const parsedTitle = parseVoiceReminder(priorityParsed.title);
  const task = createTask(parsedTitle.title);
  if (!task.title) {
    els.taskInput.focus();
    return;
  }
  if (priorityParsed.priority) task.priority = priorityParsed.priority;
  task.reminderAt = parsedTitle.reminderAt || (els.newReminderEnabled.checked ? getNewReminderValue() : null);
  task.recurrence = task.reminderAt && els.taskRepeat.value !== "none"
    ? expandRecurrence(els.taskRepeat.value, new Date(task.reminderAt)) : null;
  state.tasks.push(task);
  scheduleNativeReminder(task);
  els.taskInput.value = "";
  els.newReminderEnabled.checked = false;
  updateNewReminderVisibility();
  els.taskRepeat.value = "none";
  closeTaskModal();
  render();
  await saveState();
}

function showVoiceToast(message, tone = "neutral") {
  document.querySelector(".voice-toast")?.remove();
  const toast = document.createElement("div");
  toast.className = `voice-toast voice-toast-${tone}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  document.body.append(toast);
  window.requestAnimationFrame(() => toast.classList.add("visible"));
  window.setTimeout(() => {
    toast.classList.remove("visible");
    window.setTimeout(() => toast.remove(), 220);
  }, 3200);
}

// Voice quick-add can fire while the "Нове завдання" modal (and its
// voiceStatus text) is closed, and while a category filter or search query
// is active — in both cases the new task would silently end up invisible.
// Bring it into view instead of leaving the user guessing.
function revealAddedTask(task) {
  if (els.tasksPanel?.hidden) switchTab("tasks");
  if (taskSearchQuery) {
    taskSearchQuery = "";
    if (els.taskSearch) els.taskSearch.value = "";
  }
  const category = getTaskCategory(task) || "all";
  if (activeTaskFilter !== "all" && activeTaskFilter !== category) setTaskFilter("all");
  render();
  highlightReminderTaskInView(task.id);
}

async function addTaskFromTitle(title) {
  const cleanTitle = title.trim();
  if (!cleanTitle) return false;

  const priorityParsed = parseVoicePriority(cleanTitle);
  const parsed = parseVoiceReminder(priorityParsed.title);
  const task = createTask(parsed.title);
  if (!task.title) return false;
  task.reminderAt = parsed.reminderAt;
  if (priorityParsed.priority) task.priority = priorityParsed.priority;
  state.tasks.push(task);
  scheduleNativeReminder(task);
  revealAddedTask(task);
  showVoiceToast(`Додано: ${task.title}`, "success");
  return await saveState();
}

function openConfirmDialog(message, onConfirm) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop confirm-dialog-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", "Підтвердження дії");

  const card = document.createElement("section");
  card.className = "composer modal-card confirm-dialog-card";
  const heading = document.createElement("div");
  heading.className = "modal-heading";
  heading.innerHTML = "<h2>Підтвердження</h2>";
  const closeButton = document.createElement("button");
  closeButton.className = "modal-close-button";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Скасувати");
  heading.append(closeButton);

  const text = document.createElement("p");
  text.className = "confirm-dialog-message";
  text.textContent = message;

  const actions = document.createElement("div");
  actions.className = "confirm-dialog-actions";
  const noButton = document.createElement("button");
  noButton.type = "button";
  noButton.className = "text-button confirm-dialog-no";
  noButton.textContent = "Ні";
  const yesButton = document.createElement("button");
  yesButton.type = "button";
  yesButton.className = "modal-submit-button confirm-dialog-yes";
  yesButton.textContent = "Так";
  actions.append(noButton, yesButton);

  const close = () => backdrop.remove();
  closeButton.addEventListener("click", close);
  noButton.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  yesButton.addEventListener("click", async () => {
    close();
    await onConfirm();
  });

  card.append(heading, text, actions);
  backdrop.append(card);
  document.body.append(backdrop);
  window.requestAnimationFrame(() => backdrop.classList.add("open"));
}

function openTaskTitleEditor(task) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop title-editor-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", "Редагувати назву задачі");

  const card = document.createElement("section");
  card.className = "composer modal-card";
  const heading = document.createElement("div");
  heading.className = "modal-heading";
  heading.innerHTML = "<h2>Редагувати задачу</h2>";
  const closeButton = document.createElement("button");
  closeButton.className = "modal-close-button";
  closeButton.type = "button";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Скасувати");
  heading.append(closeButton);

  const label = document.createElement("label");
  label.className = "input-label";
  label.textContent = "Назва задачі";
  const input = document.createElement("input");
  input.type = "text";
  input.value = task.title;
  input.maxLength = 160;
  label.append(input);

  const priorityLabel = document.createElement("label");
  priorityLabel.className = "input-label priority-editor-label";
  priorityLabel.textContent = "Пріоритет";
  const prioritySelect = document.createElement("select");
  prioritySelect.className = "priority-editor-select";
  prioritySelect.setAttribute("aria-label", "Пріоритет задачі");
  prioritySelect.append(
    new Option("Без пріоритету", ""),
    ...Object.entries(PRIORITIES).map(([priority, details]) => new Option(details.label, priority)),
  );
  prioritySelect.value = hasPriority(task.priority) ? task.priority : "";
  priorityLabel.append(prioritySelect);

  const saveButton = document.createElement("button");
  saveButton.className = "modal-submit-button";
  saveButton.type = "button";
  saveButton.textContent = "Зберегти";
  const close = () => backdrop.remove();
  closeButton.addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  const save = async () => {
    const title = formatTaskTitle(input.value);
    if (!title) {
      input.focus();
      return;
    }
    task.title = title;
    task.priority = hasPriority(prioritySelect.value) ? prioritySelect.value : null;
    if (isUrgentTaskTitle(title)) task.priority = "high";
    close();
    render();
    await saveState();
  };
  saveButton.addEventListener("click", save);
  input.addEventListener("keydown", (event) => { if (event.key === "Enter") save(); });
  card.append(heading, label, priorityLabel, saveButton);
  backdrop.append(card);
  document.body.append(backdrop);
  window.requestAnimationFrame(() => {
    backdrop.classList.add("open");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

function openTaskModal() {
  els.taskModal.hidden = false;
  window.requestAnimationFrame(() => {
    els.taskModal.classList.add("open");
    els.taskInput.focus();
  });
}

function startVoiceInput({ autoAdd = false } = {}) {
  if (window.AndroidSpeech?.start) {
    shouldAutoAddVoiceResult = autoAdd;
    els.voiceStatus.textContent = "Слухаю...";
    playMicStartSound();
    window.AndroidSpeech.start();
    return;
  }
  if (!recognition) {
    els.voiceStatus.textContent = "Голосове введення недоступне в цьому браузері.";
    return;
  }

  shouldAutoAddVoiceResult = autoAdd;

  try {
    recognition.start();
  } catch {
    els.voiceStatus.textContent = "Мікрофон уже слухає.";
  }
}

window.onAndroidSpeechResult = async (text) => {
  playMicStopSound();
  const transcript = String(text || "").trim();
  if (shouldAutoAddVoiceResult) {
    shouldAutoAddVoiceResult = false;
    if (!transcript) {
      showVoiceToast("Не почув тексту. Спробуйте ще раз.", "error");
      return;
    }
    await addTaskFromTitle(transcript);
    return;
  }
  if (!transcript) return;
  els.taskInput.value = transcript;
  els.taskInput.focus();
  els.voiceStatus.textContent = "Готово.";
};

window.onAndroidSpeechError = (message) => {
  playMicStopSound();
  if (shouldAutoAddVoiceResult) {
    shouldAutoAddVoiceResult = false;
    showVoiceToast(message || "Не вдалося розпізнати голос.", "error");
    return;
  }
  shouldAutoAddVoiceResult = false;
  els.voiceStatus.textContent = message || "Не вдалося розпізнати голос.";
};

function addVoiceTask() {
  startVoiceInput({ autoAdd: true });
}

function handleNavMicTap(event) {
  event.preventDefault();

  if (navMicTapTimer) {
    window.clearTimeout(navMicTapTimer);
    navMicTapTimer = null;
    openTaskModal();
    return;
  }

  navMicTapTimer = window.setTimeout(() => {
    navMicTapTimer = null;
    addVoiceTask();
  }, DOUBLE_TAP_DELAY_MS);
}

function closeTaskModal() {
  els.taskModal.classList.remove("open");
  els.taskModal.hidden = true;
  els.voiceStatus.textContent = "";
}

const UKRAINIAN_MONTHS_GENITIVE = [
  "січня", "лютого", "березня", "квітня", "травня", "червня",
  "липня", "серпня", "вересня", "жовтня", "листопада", "грудня",
];

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function expandRecurrence(recurrence, date) {
  if (recurrence === "weekly-date") return `weekly-${date.getDay()}`;
  if (recurrence === "monthly-date") return `monthly-day-${date.getDate()}`;
  if (recurrence === "yearly-date") return `yearly-${date.getMonth() + 1}-${date.getDate()}`;
  return recurrence;
}

function normalizeRecurrenceForDate(recurrence, date) {
  if (recurrence === "weekly-monday") return "weekly-1";
  if (recurrence === "monthly-20") return "monthly-day-20";
  return expandRecurrence(recurrence, date);
}

function getRecurrenceOptions(date) {
  const weekday = new Intl.DateTimeFormat("uk-UA", { weekday: "long" }).format(date);
  const dateLabel = `${date.getDate()} ${UKRAINIAN_MONTHS_GENITIVE[date.getMonth()]}`;
  return [
    ["none", "Не повторювати"],
    ["daily", "Щодня"],
    [`weekly-${date.getDay()}`, `Щотижня в ${weekday}`],
    [`monthly-day-${date.getDate()}`, `Щомісяця ${date.getDate()} числа`],
    ["monthly-last-day", "Щомісяця в останній день"],
    [`yearly-${date.getMonth() + 1}-${date.getDate()}`, `Щороку ${dateLabel}`],
  ];
}

function getNextReminderAt(task) {
  const now = new Date();
  const next = new Date(task.reminderAt || now);

  if (task.recurrence === "daily") {
    do next.setDate(next.getDate() + 1); while (next <= now);
  } else if (/^weekly-\d$/.test(task.recurrence || "") || task.recurrence === "weekly-monday") {
    const weekday = task.recurrence === "weekly-monday" ? 1 : Number(task.recurrence.slice(-1));
    do next.setDate(next.getDate() + 1); while (next.getDay() !== weekday || next <= now);
  } else if (/^monthly-day-\d{1,2}$/.test(task.recurrence || "") || task.recurrence === "monthly-20") {
    const day = task.recurrence === "monthly-20" ? 20 : Number(task.recurrence.replace("monthly-day-", ""));
    do {
      next.setMonth(next.getMonth() + 1, 1);
      next.setDate(Math.min(day, daysInMonth(next.getFullYear(), next.getMonth())));
    } while (next <= now);
  } else if (task.recurrence === "monthly-last-day") {
    do {
      next.setMonth(next.getMonth() + 1, 1);
      next.setDate(daysInMonth(next.getFullYear(), next.getMonth()));
    } while (next <= now);
  } else if (/^yearly-\d{1,2}-\d{1,2}$/.test(task.recurrence || "")) {
    const [, month, day] = task.recurrence.match(/^yearly-(\d{1,2})-(\d{1,2})$/).map(Number);
    do {
      next.setFullYear(next.getFullYear() + 1, month - 1, 1);
      next.setDate(Math.min(day, daysInMonth(next.getFullYear(), month - 1)));
    } while (next <= now);
  } else {
    return null;
  }

  return next.toISOString();
}

function isSameCalendarDay(first, second = new Date()) {
  return first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate();
}

function isRecurringTaskCompletedToday(task) {
  return Boolean(task.recurrence && task.lastCompletedAt
    && isSameCalendarDay(new Date(task.lastCompletedAt)));
}

function isRecurringTaskReadyToComplete(task) {
  return Boolean(task.recurrence && (
    earlyRecurringCompletionIds.has(String(task.id))
    || (task.reminderAt && new Date(task.reminderAt).getTime() <= Date.now())
  ));
}

function registerEarlyRecurringTap(task) {
  const now = Date.now();
  const id = String(task.id);
  const isSameSequence = earlyRecurringTapState?.id === id
    && now - earlyRecurringTapState.lastTapAt <= 900;
  const taps = isSameSequence ? earlyRecurringTapState.taps + 1 : 1;
  earlyRecurringTapState = { id, taps, lastTapAt: now };

  if (taps < 3) return false;
  earlyRecurringCompletionIds.add(id);
  earlyRecurringTapState = null;
  return true;
}

async function moveToTrash(id, { openTrash = true } = {}) {
  const index = state.tasks.findIndex((task) => task.id === id);
  if (index === -1) return;
  cancelNativeReminder(id);

  const [task] = state.tasks.splice(index, 1);
  state.trash.unshift({ ...task, deletedAt: Date.now() });
  render();
  if (openTrash) switchTab("trash");
  await saveState();
}

function closePriorityPicker() {
  const backdrop = document.querySelector(".priority-picker-backdrop");
  if (backdrop) backdrop.remove();
  priorityPickerTaskId = null;
}

async function setTaskPriority(id, priority) {
  const task = state.tasks.find((item) => item.id === id) || state.trash.find((item) => item.id === id);
  if (!task || (priority !== null && !hasPriority(priority))) return;

  task.priority = priority;
  closePriorityPicker();
  sortActiveTasks();
  render();
  await saveState();
}

function openPriorityPicker(task, anchor, showReminder = false) {
  closePriorityPicker();
  priorityPickerTaskId = task.id;

  const picker = document.createElement("div");
  picker.className = "priority-picker";
  if (showReminder) picker.classList.add("reminder-dialog");
  picker.setAttribute("role", "menu");

  const closePickerButton = document.createElement("button");
  closePickerButton.className = "picker-close-button";
  closePickerButton.type = "button";
  closePickerButton.setAttribute("aria-label", "Закрити меню");
  closePickerButton.textContent = "×";
  closePickerButton.addEventListener("click", (event) => {
    event.stopPropagation();
    closePriorityPicker();
  });
  picker.append(closePickerButton);

  if (!showReminder) Object.entries(PRIORITIES).forEach(([priority, details]) => {
    const button = document.createElement("button");
    button.className = `priority-option ${details.className}`;
    button.type = "button";
    button.setAttribute("role", "menuitemradio");
    button.setAttribute("aria-checked", String(task.priority === priority));
    button.innerHTML = `<span class="priority-dot" aria-hidden="true"></span><span>${details.label}</span>`;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setTaskPriority(task.id, priority);
    });
    picker.append(button);
  });

  if (!showReminder) {
    const clearPriorityButton = document.createElement("button");
    clearPriorityButton.className = "priority-option priority-clear";
    clearPriorityButton.type = "button";
    clearPriorityButton.setAttribute("role", "menuitemradio");
    clearPriorityButton.setAttribute("aria-checked", String(!task.priority));
    clearPriorityButton.innerHTML = '<span class="priority-clear-icon" aria-hidden="true">—</span><span>Без пріоритету</span>';
    clearPriorityButton.addEventListener("click", (event) => {
      event.stopPropagation();
      setTaskPriority(task.id, null);
    });
    picker.append(clearPriorityButton);
  }

  if (showReminder) {
  const currentReminder = task.reminderAt ? new Date(task.reminderAt) : new Date(Date.now() + 3600000);
  const pickerFields = document.createElement("div");
  pickerFields.className = "reminder-picker-fields";
  const makeSelect = (label, values, selected) => {
    const wrapper = document.createElement("label");
    wrapper.className = "reminder-field";
    wrapper.innerHTML = `<span>${label}</span>`;
    const select = document.createElement("select");
    values.forEach(([value, text]) => {
      const option = new Option(text, value, value === selected, value === selected);
      select.append(option);
    });
    wrapper.append(select);
    pickerFields.append(wrapper);
    return select;
  };
  const days = Array.from({ length: 31 }, (_, index) => {
    const value = String(index + 1).padStart(2, "0");
    return [value, value];
  });
  const months = ["Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"]
    .map((text, index) => [String(index), text]);
  const years = Array.from({ length: 7 }, (_, index) => {
    const year = String(new Date().getFullYear() - 1 + index); return [year, year];
  });
  const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
  const minutes = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));
  const daySelect = makeSelect("День", days, String(currentReminder.getDate()).padStart(2, "0"));
  const monthSelect = makeSelect("Місяць", months, String(currentReminder.getMonth()));
  const yearSelect = makeSelect("Рік", years, String(currentReminder.getFullYear()));
  const hourSelect = makeSelect("Година", hours.map((value) => [value, value]), String(currentReminder.getHours()).padStart(2, "0"));
  const minuteSelect = makeSelect("Хвилини", minutes.map((value) => [value, value]), String(Math.round(currentReminder.getMinutes() / 5) * 5 % 60).padStart(2, "0"));
  const recurrenceSelect = makeSelect(
    "Повторювати",
    getRecurrenceOptions(currentReminder),
    normalizeRecurrenceForDate(task.recurrence || "none", currentReminder),
  );
  recurrenceSelect.closest(".reminder-field")?.classList.add("reminder-recurrence-field");
  const updateRecurrenceOptions = () => {
    const selectedDate = new Date(Number(yearSelect.value), Number(monthSelect.value), Number(daySelect.value));
    const previousValue = recurrenceSelect.value;
    const nextValue = /^weekly-\d$/.test(previousValue) ? `weekly-${selectedDate.getDay()}`
      : /^monthly-day-\d{1,2}$/.test(previousValue) ? `monthly-day-${selectedDate.getDate()}`
        : /^yearly-\d{1,2}-\d{1,2}$/.test(previousValue)
          ? `yearly-${selectedDate.getMonth() + 1}-${selectedDate.getDate()}` : previousValue;
    recurrenceSelect.replaceChildren(...getRecurrenceOptions(selectedDate).map(([value, text]) => (
      new Option(text, value, value === nextValue, value === nextValue)
    )));
  };
  [daySelect, monthSelect, yearSelect].forEach((select) => {
    select.addEventListener("change", updateRecurrenceOptions);
  });

  const reminderActions = document.createElement("div");
  reminderActions.className = "reminder-picker-actions";
  const saveReminderButton = document.createElement("button");
  saveReminderButton.className = "priority-option reminder-action reminder-save-action";
  saveReminderButton.type = "button";
  saveReminderButton.textContent = "Зберегти дату";
  saveReminderButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    const selectedDate = new Date(Number(yearSelect.value), Number(monthSelect.value), Number(daySelect.value), Number(hourSelect.value), Number(minuteSelect.value));
    task.reminderAt = selectedDate.toISOString();
    task.recurrence = recurrenceSelect.value === "none" ? null : recurrenceSelect.value;
    cancelNativeReminder(task.id);
    scheduleNativeReminder(task);
    closePriorityPicker();
    sortActiveTasks();
    render();
    await saveState();
  });
  const removeReminderButton = document.createElement("button");
  removeReminderButton.className = "priority-option reminder-action reminder-remove-action";
  removeReminderButton.type = "button";
  removeReminderButton.textContent = "Прибрати нагадування";
  removeReminderButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    task.reminderAt = null;
    task.recurrence = null;
    task.lastCompletedAt = null;
    cancelNativeReminder(task.id);
    closePriorityPicker();
    sortActiveTasks();
    render();
    await saveState();
  });
  const deleteTaskButton = document.createElement("button");
  deleteTaskButton.className = "priority-option reminder-action reminder-delete-action";
  deleteTaskButton.type = "button";
  deleteTaskButton.textContent = "Видалити задачу";
  deleteTaskButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    closePriorityPicker();
    await deleteTaskPermanently(task.id);
  });
  reminderActions.append(saveReminderButton, removeReminderButton, deleteTaskButton);
  picker.append(pickerFields, reminderActions);
  }

  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop priority-picker-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closePriorityPicker();
  });

  picker.classList.add("modal-card");
  backdrop.append(picker);
  document.body.append(backdrop);
  window.requestAnimationFrame(() => backdrop.classList.add("open"));
}

async function deleteTaskPermanently(id) {
  cancelNativeReminder(id);
  state.tasks = state.tasks.filter((task) => task.id !== id);
  state.trash = state.trash.filter((task) => task.id !== id);
  render();
  await saveState();
}

async function removeForever(id) {
  await deleteTaskPermanently(id);
}

async function completeTask(id, { force = false } = {}) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;

  if (task.recurrence && !force && !isRecurringTaskReadyToComplete(task)) return;
  earlyRecurringCompletionIds.delete(String(id));
  const nextReminderAt = getNextReminderAt(task);
  if (nextReminderAt) {
    if (isRecurringTaskCompletedToday(task)) return;
    cancelNativeReminder(id);
    task.reminderAt = nextReminderAt;
    task.done = false;
    task.lastCompletedAt = Date.now();
    scheduleNativeReminder(task);
    render();
    await saveState();
    return;
  }

  // Keep completed one-time tasks in the archive instead of deleting them.
  cancelNativeReminder(id);
  state.tasks = state.tasks.filter((item) => item.id !== id);
  state.trash.unshift({ ...task, done: true, deletedAt: Date.now() });
  render();
  await saveState();
}

async function snoozeTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task || !task.reminderAt) return false;

  // Snoozing is relative to the moment the notification action is tapped, so
  // an overdue reminder is still useful instead of remaining in the past.
  cancelNativeReminder(id);
  task.reminderAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  task.done = false;
  scheduleNativeReminder(task);
  render();
  await saveState();
  return true;
}

function moveTaskToIndex(id, nextIndex) {
  const currentIndex = state.tasks.findIndex((task) => task.id === id);
  if (currentIndex === -1 || currentIndex === nextIndex) return false;

  const [task] = state.tasks.splice(currentIndex, 1);
  state.tasks.splice(nextIndex, 0, task);
  return true;
}

function getTaskDragIndex(pointerY, draggingItem) {
  const scope = draggingItem?.parentElement || els.taskList;
  const items = [...scope.querySelectorAll(".task-item:not(.dragging)")];
  return items.reduce((index, item) => {
    const rect = item.getBoundingClientRect();
    return pointerY > rect.top + rect.height / 2 ? index + 1 : index;
  }, 0);
}

function syncDraggedTaskPosition(pointerY) {
  if (!dragState?.active) return;

  const scope = dragState.item.parentElement || els.taskList;
  const nextIndex = getTaskDragIndex(pointerY, dragState.item);
  if (!moveTaskToIndex(dragState.id, nextIndex)) return;

  const siblings = [...scope.querySelectorAll(".task-item:not(.dragging)")];
  scope.insertBefore(dragState.item, siblings[nextIndex] || null);
  dragState.moved = true;
}

function startTaskDrag(item) {
  if (!dragState || dragState.active) return;

  dragState.active = true;
  dragState.moved = false;
  item.classList.remove("pressing");
  item.classList.add("dragging");
  document.body.classList.add("is-reordering");
}

function cancelPendingTaskDrag() {
  if (!dragState || dragState.active) return;

  clearTimeout(dragState.timer);
  dragState.item.classList.remove("pressing");
  dragState = null;
}

async function finishTaskDrag() {
  if (!dragState) return;

  clearTimeout(dragState.timer);
  const { item, moved, active } = dragState;
  item.classList.remove("pressing", "dragging", "swiping");
  document.body.classList.remove("is-reordering");
  dragState = null;

  if (active && moved) {
    sortActiveTasks();
    render();
    await saveState();
  }
}

function setupTaskReorder(item, task, mode) {
  if (mode !== "tasks") return;

  item.dataset.taskId = task.id;
  item.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button") || event.target.closest("a")) return;

    dragState = {
      active: false,
      id: task.id,
      item,
      moved: false,
      menuOpened: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      timer: window.setTimeout(() => {
        if (!dragState || dragState.item !== item || dragState.active) return;
        dragState.menuOpened = true;
        item.classList.remove("pressing");
        openPriorityPicker(task, item, true);
      }, 560),
    };

    item.classList.add("pressing");
    item.setPointerCapture(event.pointerId);
  });

  item.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.item !== item || dragState.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - dragState.startX;
    const moveX = Math.abs(deltaX);
    const moveY = Math.abs(event.clientY - dragState.startY);
    if (!dragState.active && (moveX > 8 || moveY > 8)) {
      clearTimeout(dragState.timer);
      item.classList.remove("pressing");
      item.classList.toggle("swiping", moveX > 44 && moveY < 34);
      return;
    }

    if (!dragState.active) return;

    event.preventDefault();
    if (event.clientY < 90) window.scrollBy({ top: -12, behavior: "auto" });
    if (event.clientY > window.innerHeight - 120) window.scrollBy({ top: 12, behavior: "auto" });
    syncDraggedTaskPosition(event.clientY);
  });

  item.addEventListener("pointerup", (event) => {
    if (!dragState || dragState.item !== item || dragState.pointerId !== event.pointerId) return;
    const isHorizontalSwipe = Math.abs(event.clientX - dragState.startX) > 64 && Math.abs(event.clientY - dragState.startY) < 34;
    if (isHorizontalSwipe && !dragState.active) {
      clearTimeout(dragState.timer);
      item.classList.remove("pressing", "swiping");
      dragState = null;
      // Horizontal gestures are reserved for moving between task screens.
      // Do not open the editor when the finger finishes a swipe on a card.
      event.preventDefault();
      return;
    }
    finishTaskDrag();
  });

  item.addEventListener("pointercancel", (event) => {
    if (!dragState || dragState.item !== item || dragState.pointerId !== event.pointerId) return;
    finishTaskDrag();
  });
}

const TASK_TEXT_URL_PATTERN = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

// Renders `text` into `container`, turning any URLs into links that open in
// a new tab and are styled differently from the surrounding task text.
function renderTaskTextWithLinks(container, text) {
  container.textContent = "";
  if (!text) return;

  TASK_TEXT_URL_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match;
  while ((match = TASK_TEXT_URL_PATTERN.exec(text))) {
    if (match.index > lastIndex) {
      container.append(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    let url = match[0];
    // Trailing punctuation right after a URL usually belongs to the
    // sentence, not the link itself (e.g. "перейди на sait.com."), so peel
    // it back off before building the href.
    let trailing = "";
    while (url && /[).,!?;:]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }

    const link = document.createElement("a");
    link.className = "task-title-link";
    link.href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    link.textContent = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    // Prevent the click from also being counted by the task item's own
    // click handler (double/triple click) or starting a drag.
    link.addEventListener("click", (event) => event.stopPropagation());
    link.addEventListener("pointerdown", (event) => event.stopPropagation());
    container.append(link);

    if (trailing) container.append(document.createTextNode(trailing));
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    container.append(document.createTextNode(text.slice(lastIndex)));
  }
}

function makeTaskItem(task, mode) {
  const item = document.createElement("li");
  const category = getTaskCategory(task) || "all";
  const completedToday = isRecurringTaskCompletedToday(task);
  const notReadyYet = Boolean(task.recurrence && !completedToday && !isRecurringTaskReadyToComplete(task));
  const isOverdue = Boolean(task.reminderAt) && !task.done && !completedToday && !notReadyYet
    && mode !== "trash" && mode !== "archive"
    && new Date(task.reminderAt).getTime() < Date.now();
  item.className = `task-item${task.done ? " done" : ""}${isOverdue ? " overdue" : ""}`;

  const checkButton = document.createElement("button");
  checkButton.className = `check-button${completedToday ? " completed-today" : ""}${notReadyYet ? " not-ready-yet" : ""}`;
  checkButton.type = "button";
  checkButton.textContent = task.done || completedToday ? "✓" : "";
  checkButton.setAttribute("aria-label", completedToday ? "Виконано сьогодні" : notReadyYet ? `Доступно після ${formatDate(task.reminderAt)}` : task.done ? "Позначити активним" : "Позначити виконаним");
  checkButton.setAttribute("aria-pressed", String(task.done || completedToday));
  if (completedToday) checkButton.title = "Виконано сьогодні";
  if (notReadyYet) checkButton.title = `Можна відмітити після ${formatDate(task.reminderAt)}`;
  checkButton.disabled = mode === "trash" || mode === "archive";
  checkButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (completedToday) return;
    if (notReadyYet) {
      if (registerEarlyRecurringTap(task)) render();
      return;
    }
    completeTask(task.id);
  });

  const text = document.createElement("div");
  text.className = "task-text";
  const titleRow = document.createElement("div");
  titleRow.className = "task-title-row";
  const priority = hasPriority(task.priority) ? PRIORITIES[task.priority] : null;
  const priorityDot = document.createElement("span");
  priorityDot.className = `priority-dot task-priority-dot${priority ? ` ${priority.className}` : ""}`;
  priorityDot.title = priority ? priority.label : "Без пріоритету";
  priorityDot.setAttribute("aria-label", priority ? `Пріоритет: ${priority.label}` : "Без пріоритету");
  const title = document.createElement("div");
  title.className = "task-title";
  renderTaskTextWithLinks(title, task.title);
  titleRow.append(priorityDot, title);
  const meta = document.createElement("span");
  meta.className = "task-meta";
  let reminderMeta = null;
  if (task.reminderAt && mode !== "trash") {
    // Reminder badge lives on the right side of the row (with the priority
    // dot / clock / menu), not stacked under the title, so every row keeps
    // a single, consistent height.
    meta.classList.add("task-reminder-meta");
    if (isOverdue) meta.classList.add("overdue");
    meta.textContent = completedToday
      ? `Виконано сьогодні · Наступне ${formatDate(task.reminderAt)}`
      : isOverdue
        ? `Протерміновано · ${formatDate(task.reminderAt)}`
        : `Нагадати ${formatDate(task.reminderAt)}`;
    reminderMeta = meta;
    text.classList.add("no-meta");
    text.append(titleRow);
  } else if (mode === "trash" || mode === "archive") {
    meta.textContent = `${mode === "archive" ? "В архіві" : "Видалено"} ${formatDate(task.deletedAt)}`;
    text.append(titleRow, meta);
  } else {
    text.classList.add("no-meta");
    text.append(titleRow);
  }

  const actions = document.createElement("div");
  actions.className = "item-actions";

  if (mode === "trash" || mode === "archive") {
    const deleteButton = document.createElement("button");
    deleteButton.className = "mini-button danger";
    deleteButton.type = "button";
    deleteButton.textContent = "×";
    deleteButton.title = "Видалити назавжди";
    deleteButton.setAttribute("aria-label", "Видалити назавжди");
    deleteButton.addEventListener("click", () => {
      openConfirmDialog("Ти дійсно хочеш видалити цю задачу?", () => removeForever(task.id));
    });
    actions.append(deleteButton);
  } else {    const priorityButtonDetails = hasPriority(task.priority) ? PRIORITIES[task.priority] : null;
    const priorityButton = document.createElement("button");
    priorityButton.className = `task-priority-button${priorityButtonDetails ? ` ${priorityButtonDetails.className}` : ""}`;
    priorityButton.type = "button";
    priorityButton.innerHTML = `<span class="task-priority-circle" aria-hidden="true"></span>`;
    priorityButton.title = priorityButtonDetails ? `Пріоритет: ${priorityButtonDetails.label}` : "Встановити пріоритет";
    priorityButton.setAttribute("aria-label", priorityButton.title);
    priorityButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openPriorityPicker(task, priorityButton);
    });
    const reminderButton = document.createElement("button");
    reminderButton.className = `task-reminder-button${task.reminderAt ? " has-reminder" : ""}`;
    reminderButton.type = "button";
    reminderButton.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5" /><path d="M12 8v4.4l3 2" /></svg>`;
    reminderButton.title = task.reminderAt ? "Змінити нагадування" : "Додати нагадування";
    reminderButton.setAttribute("aria-label", reminderButton.title);
    reminderButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openPriorityPicker(task, reminderButton, true);
    });
    const moreButton = document.createElement("button");
    moreButton.className = "task-more-button";
    moreButton.type = "button";
    moreButton.textContent = "•••";
    moreButton.title = "Редагувати завдання";
    moreButton.setAttribute("aria-label", "Редагувати завдання");
    moreButton.addEventListener("click", (event) => {
      event.stopPropagation();
      openTaskTitleEditor(task);
    });
    actions.append(priorityButton, reminderButton, moreButton);
  }

  if (reminderMeta) actions.prepend(reminderMeta);

  if (mode === "trash") {
    item.append(checkButton, text, actions);
  } else {
    item.append(checkButton, text, actions);
  }

  let itemClickCount = 0;
  let itemClickTimer = null;
  item.addEventListener("click", (event) => {
    if (event.target.closest("button") || event.target.closest("a") || dragState?.active) return;
    event.preventDefault();

    itemClickCount += 1;
    if (itemClickTimer) window.clearTimeout(itemClickTimer);

    // Wait to see if more clicks are coming before acting, so a 2nd click
    // in a triple-click sequence doesn't open the editor before the 3rd
    // click has a chance to register.
    itemClickTimer = window.setTimeout(() => {
      const count = itemClickCount;
      itemClickCount = 0;
      itemClickTimer = null;
      // Editing is handled by the "•••" button only; a click sequence on
      // the item itself is reserved for the triple-tap priority picker,
      // so 1 and 2 clicks intentionally do nothing here.
      if (count >= 3) {
        openPriorityPicker(task, item);
      }
    }, DOUBLE_TAP_DELAY_MS);
  });

  setupTaskReorder(item, task, mode);
  return item;
}

function makePriorityGroupHeader(group, count, isCollapsed) {
  const header = document.createElement("button");
  header.type = "button";
  header.className = `priority-group-header ${group.dotClass}`;
  header.setAttribute("aria-expanded", String(!isCollapsed));

  const icon = document.createElement("span");
  icon.className = `priority-group-icon ${group.dotClass}`;
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = PRIORITY_GROUP_ICONS[group.icon] || "";

  const textWrap = document.createElement("span");
  textWrap.className = "priority-group-headtext";

  const titleRow = document.createElement("span");
  titleRow.className = "priority-group-title-row";

  const label = document.createElement("span");
  label.className = "priority-group-label";
  label.textContent = group.label;

  const countBadge = document.createElement("span");
  countBadge.className = "priority-group-count";
  countBadge.textContent = String(count);

  titleRow.append(label, countBadge);

  const desc = document.createElement("span");
  desc.className = "priority-group-desc";
  desc.textContent = group.description || "";

  textWrap.append(titleRow, desc);

  const badge = document.createElement("span");
  badge.className = `priority-group-badge ${group.dotClass}`;
  badge.textContent = group.badge || "";

  const chevron = document.createElement("span");
  chevron.className = "priority-group-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';

  header.append(icon, textWrap, badge, chevron);
  return header;
}

function makePriorityGroupSection(group, tasks) {
  const isCollapsed = collapsedPriorityGroups.has(group.key);
  const wrapper = document.createElement("div");
  wrapper.className = `priority-group${isCollapsed ? " collapsed" : ""}`;
  wrapper.dataset.priorityGroup = group.key;

  const header = makePriorityGroupHeader(group, tasks.length, isCollapsed);
  header.addEventListener("click", () => {
    if (collapsedPriorityGroups.has(group.key)) collapsedPriorityGroups.delete(group.key);
    else collapsedPriorityGroups.add(group.key);
    const nowCollapsed = collapsedPriorityGroups.has(group.key);
    wrapper.classList.toggle("collapsed", nowCollapsed);
    header.setAttribute("aria-expanded", String(!nowCollapsed));
  });

  const list = document.createElement("ul");
  list.className = "task-list priority-group-list";
  list.append(...tasks.map((task) => makeTaskItem(task, "tasks")));

  wrapper.append(header, list);
  return wrapper;
}

function renderTaskList() {
  const visibleTasks = getFilteredTasks();
  if (!visibleTasks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = taskSearchQuery
      ? "<span class=\"empty-illustration\" aria-hidden=\"true\">⌕</span><strong>Нічого не знайдено</strong><p>Спробуйте інший пошуковий запит.</p>"
      : "<span class=\"empty-illustration\" aria-hidden=\"true\">✓</span><strong>Немає задач</strong><p>Створіть свою першу задачу, натиснувши кнопку нижче</p><button class=\"empty-add-button\" type=\"button\">＋ Створити задачу</button>";
    empty.querySelector(".empty-add-button")?.addEventListener("click", openTaskModal);
    els.taskList.replaceChildren(empty);
    return;
  }

  const grouped = new Map(PRIORITY_GROUPS.map((group) => [group.key, []]));
  visibleTasks.forEach((task) => {
    const key = hasPriority(task.priority) ? task.priority : "none";
    grouped.get(key).push(task);
  });

  const sections = PRIORITY_GROUPS
    .map((group) => ({ group, tasks: grouped.get(group.key) }))
    .filter(({ tasks }) => tasks.length)
    .map(({ group, tasks }) => makePriorityGroupSection(group, tasks));

  els.taskList.replaceChildren(...sections);
}

function renderMandatoryTaskList() {
  if (!els.trashList) return;
  const mandatoryTasks = getMandatoryTasks();
  els.trashList.replaceChildren(...mandatoryTasks.map((task) => makeTaskItem(task, "tasks")));
}

function renderArchiveList() {
  if (!els.archiveList) return;
  if (state.trash.length) {
    els.archiveList.replaceChildren(...state.trash.map((task) => makeTaskItem(task, "archive")));
    return;
  }
  const empty = document.createElement("li");
  empty.className = "empty-state";
  empty.innerHTML = "<span class=\"empty-illustration\" aria-hidden=\"true\">✓</span><strong>Архів порожній</strong><p>Виконані задачі з’являтимуться тут.</p>";
  els.archiveList.replaceChildren(empty);
}

function renderCalendar() {
  if (!els.calendarGrid) return;
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  els.calendarTitle.textContent = calendarMonth.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });

  const firstDayOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstDayOffset);
  const remindersByDay = new Map();
  state.tasks.filter((task) => task.reminderAt).forEach((task) => {
    const date = new Date(task.reminderAt);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const entries = remindersByDay.get(key) || [];
    entries.push(task);
    remindersByDay.set(key, entries);
  });

  const today = new Date();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const cell = document.createElement("div");
    cell.className = `calendar-day${date.getMonth() !== month ? " outside-month" : ""}`;
    if (date.toDateString() === today.toDateString()) cell.classList.add("today");
    const dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = String(date.getDate());
    cell.append(dayNumber);
    (remindersByDay.get(key) || [])
      .sort((a, b) => new Date(a.reminderAt) - new Date(b.reminderAt))
      .forEach((task) => {
        const reminder = document.createElement("div");
        reminder.className = "calendar-reminder";
        const time = new Date(task.reminderAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
        reminder.textContent = `${time} · ${task.title}`;
        reminder.title = `${task.title} — ${formatDate(task.reminderAt)}`;
        cell.append(reminder);
      });
    return cell;
  });
  els.calendarGrid.replaceChildren(...cells);
}

function animateFilterChange(list, direction) {
  if (!direction || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const animationClass = direction === "next" ? "filter-swipe-next" : "filter-swipe-previous";
  list.classList.remove("filter-swipe-next", "filter-swipe-previous");
  // Restart the animation when the user changes filters repeatedly.
  void list.offsetWidth;
  list.classList.add(animationClass);
  list.addEventListener("animationend", () => list.classList.remove(animationClass), { once: true });
}

function render() {
  sortActiveTasks();
  const regularTasks = state.tasks;
  els.taskFilterCounts.forEach((count) => {
    const filter = count.dataset.taskFilterCount;
    count.textContent = regularTasks.filter((task) => {
      const category = getTaskCategory(task);
      return filter === "all" || category === filter;
    }).length;
  });
  renderTaskList();
  if (els.archivePanel && !els.archivePanel.hidden) renderArchiveList();
  if (els.calendarPanel && !els.calendarPanel.hidden) renderCalendar();
  rescheduleNativeReminders();
  syncAndroidWidget();
}

window.openTaskFromNotification = (taskId) => {
  // The Android activity may finish loading this script before Supabase has
  // restored the list. Tell native code to retry instead of losing the task ID.
  if (!appDataReady) return false;
  const task = state.tasks.find((item) => String(item.id) === String(taskId));
  if (!task) return false;

  const isReminderTask = Boolean(task.reminderAt);
  const taskFilter = getTaskCategory(task) || "all";
  setTaskFilter(taskFilter);
  switchTab(isReminderTask ? "trash" : "tasks");
  if (isReminderTask && task.recurrence) setMandatoryFilter(task.recurrence === "daily" ? "daily" : "other");
  const taskItem = (isReminderTask ? els.trashList : els.taskList)
    .querySelector(`.task-item[data-task-id="${CSS.escape(taskId)}"]`);
  if (!taskItem) return false;

  taskItem.scrollIntoView({ behavior: "smooth", block: "center" });
  taskItem.classList.add("notification-target");
  window.setTimeout(() => taskItem.classList.remove("notification-target"), 3000);
  return true;
};

async function applyNotificationAction(taskId, action) {
  const task = state.tasks.find((item) => String(item.id) === String(taskId));
  if (!task) return false;
  if (action === "complete") await completeTask(task.id, { force: true });
  else if (action === "snooze") await snoozeTask(task.id);
  else return false;
  return true;
}

async function processNativeNotificationAction() {
  let rawAction = null;
  try {
    rawAction = window.AndroidNotificationActions?.peek?.();
  } catch (_) {
    return;
  }
  if (!rawAction) return;

  try {
    const { taskId, action } = JSON.parse(rawAction);
    if (await applyNotificationAction(taskId, action)) {
      window.AndroidNotificationActions?.clear?.();
      window.AndroidNotificationActionCallback?.complete?.();
    }
  } catch (error) {
    console.error("Failed to apply notification action:", error);
  }
}

window.handleNotificationAction = (taskId, action) => {
  if (!appDataReady) return false;
  void applyNotificationAction(taskId, action);
  return true;
};

// Called by the microphone button on the Android home-screen widget.
window.startVoiceTaskFromWidget = () => addVoiceTask();
window.addVoiceTaskFromWidget = async (text) => {
  // The tiny native voice window may finish loading before Supabase has
  // restored the task list. Wait so a new voice task cannot be overwritten.
  for (let attempt = 0; attempt < 50 && !appDataReady; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  if (!appDataReady) return false;
  return await addTaskFromTitle(String(text || ""));
};

function setTaskFilter(filterName, { direction = null } = {}) {
  if (filterName === activeTaskFilter) return;
  activeTaskFilter = filterName;
  els.taskFilterTabs.forEach((tab) => {
    const isActive = tab.dataset.taskFilter === activeTaskFilter;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  renderTaskList();
  animateFilterChange(els.taskList, direction);
}

function setMandatoryFilter(filterName, { direction = null } = {}) {
  if (filterName === activeMandatoryFilter) return;
  activeMandatoryFilter = filterName;
  els.mandatoryFilterTabs.forEach((tab) => {
    const isActive = tab.dataset.mandatoryFilter === activeMandatoryFilter;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  renderMandatoryTaskList();
  animateFilterChange(els.trashList, direction);
}

function setupTaskFilterSwipe() {
  const filterOrder = ["all", "bookmarks", "buy", "laptops"];
  const swipeThreshold = 64;

  const isTasksSwipeArea = (event) => {
    if (els.tasksPanel.hidden || event.pointerType !== "touch") return false;
    // Cards are included deliberately: when the list fills the screen there
    // is no empty area left from which to change screens.
    return !event.target.closest("button, input, select, textarea, a");
  };

  els.appShell.addEventListener("pointerdown", (event) => {
    if (!isTasksSwipeArea(event)) return;
    taskFilterSwipe = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  });

  els.appShell.addEventListener("pointerup", (event) => {
    if (!taskFilterSwipe || taskFilterSwipe.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - taskFilterSwipe.startX;
    const deltaY = event.clientY - taskFilterSwipe.startY;
    taskFilterSwipe = null;

    if (Math.abs(deltaX) < swipeThreshold || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    const currentIndex = filterOrder.indexOf(activeTaskFilter);
    const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1);
    if (nextIndex >= 0 && nextIndex < filterOrder.length) {
      setTaskFilter(filterOrder[nextIndex], { direction: deltaX < 0 ? "next" : "previous" });
    }
  });

  els.appShell.addEventListener("pointercancel", () => {
    taskFilterSwipe = null;
  });
}

function setupMandatoryFilterSwipe() {
  const filterOrder = ["one-time", "daily", "other"];
  const swipeThreshold = 64;

  const isMandatorySwipeArea = (event) => {
    if (els.trashPanel.hidden || event.pointerType !== "touch") return false;
    return !event.target.closest("button, input, select, textarea, a");
  };

  els.appShell.addEventListener("pointerdown", (event) => {
    if (!isMandatorySwipeArea(event)) return;
    mandatoryFilterSwipe = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  });

  els.appShell.addEventListener("pointerup", (event) => {
    if (!mandatoryFilterSwipe || mandatoryFilterSwipe.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - mandatoryFilterSwipe.startX;
    const deltaY = event.clientY - mandatoryFilterSwipe.startY;
    mandatoryFilterSwipe = null;
    if (Math.abs(deltaX) < swipeThreshold || Math.abs(deltaX) <= Math.abs(deltaY)) return;

    const currentIndex = filterOrder.indexOf(activeMandatoryFilter);
    const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1);
    if (nextIndex >= 0 && nextIndex < filterOrder.length) {
      setMandatoryFilter(filterOrder[nextIndex], { direction: deltaX < 0 ? "next" : "previous" });
    }
  });

  els.appShell.addEventListener("pointercancel", () => {
    mandatoryFilterSwipe = null;
  });
}

function switchTab(tabName) {
  const showTasks = tabName === "tasks";
  const showArchive = tabName === "archive";
  const showCalendar = tabName === "calendar";
  els.tasksPanel.hidden = !showTasks;
  els.archivePanel.hidden = !showArchive;
  els.calendarPanel.hidden = !showCalendar;
  els.tasksTab.classList.toggle("active", showTasks);
  els.tasksTab.setAttribute("aria-selected", String(showTasks));
  els.tasksNav?.classList.toggle("active", showTasks);
  els.archiveNav?.classList.toggle("active", showArchive);
  els.calendarNav?.classList.toggle("active", showCalendar);
  if (showArchive) renderArchiveList();
  if (showCalendar) renderCalendar();
}

function setupSpeechRecognition() {
  if (!SpeechRecognition) {
    els.voiceStatus.textContent = "Голосове введення недоступне в цьому браузері.";
    els.micButton.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "uk-UA";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("start", () => {
    els.micButton.classList.add("listening");
    els.navMicButton.classList.add("listening");
    els.voiceStatus.textContent = "Слухаю...";
    playMicStartSound();
  });

  recognition.addEventListener("result", async (event) => {
    const transcript = event.results[0][0].transcript.trim();

    if (shouldAutoAddVoiceResult) {
      shouldAutoAddVoiceResult = false;
      if (!transcript) {
        showVoiceToast("Не почув тексту. Спробуйте ще раз.", "error");
        return;
      }
      await addTaskFromTitle(transcript);
      return;
    }

    els.taskInput.value = transcript;
    els.voiceStatus.textContent = "Готово. Можна додати або відредагувати текст.";
    els.taskInput.focus();
  });

  recognition.addEventListener("error", () => {
    if (shouldAutoAddVoiceResult) {
      shouldAutoAddVoiceResult = false;
      showVoiceToast("Не вдалося розпізнати голос. Спробуйте ще раз.", "error");
      return;
    }
    shouldAutoAddVoiceResult = false;
    els.voiceStatus.textContent = "Не вдалося розпізнати голос. Спробуйте ще раз.";
  });

  recognition.addEventListener("end", () => {
    els.micButton.classList.remove("listening");
    els.navMicButton.classList.remove("listening");
    playMicStopSound();
    if (els.voiceStatus.textContent === "Слухаю...") {
      els.voiceStatus.textContent = "";
    }
  });
}

els.addButton?.addEventListener("click", openTaskModal);
els.submitTaskButton.addEventListener("click", addTask);
els.closeTaskModalButton.addEventListener("click", closeTaskModal);
els.taskModal.addEventListener("click", (event) => {
  if (event.target === els.taskModal) closeTaskModal();
});
els.taskInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addTask();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.taskModal.hidden) closeTaskModal();
  if (event.key === "Escape" && priorityPickerTaskId) closePriorityPicker();
});

document.addEventListener("click", (event) => {
  if (!priorityPickerTaskId) return;
  if (event.target.closest(".priority-picker") || event.target.closest(".task-item")) return;
  closePriorityPicker();
});

els.tasksTab.addEventListener("click", () => switchTab("tasks"));
els.tasksNav?.addEventListener("click", () => switchTab("tasks"));
els.archiveNav?.addEventListener("click", () => switchTab("archive"));
els.calendarNav?.addEventListener("click", () => switchTab("calendar"));
els.calendarPrevious?.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  renderCalendar();
});
els.calendarNext?.addEventListener("click", () => {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  renderCalendar();
});
els.taskFilterTabs.forEach((tab) => {
  tab.addEventListener("click", () => setTaskFilter(tab.dataset.taskFilter));
});
els.taskSearch?.addEventListener("input", () => {
  taskSearchQuery = els.taskSearch.value.trim().toLocaleLowerCase("uk-UA");
  renderTaskList();
});
setupTaskFilterSwipe();
els.navMicButton.addEventListener("contextmenu", (event) => event.preventDefault());
els.navMicButton.addEventListener("click", handleNavMicTap);

els.micButton.addEventListener("click", () => startVoiceInput());

els.pomodoroStartButton?.addEventListener("click", startPomodoro);
els.pomodoroStopButton?.addEventListener("click", stopPomodoro);
els.pomodoroResetButton?.addEventListener("click", resetPomodoro);
loadPomodoroState();
renderPomodoro();
updateNotifPermissionButton();

els.logoutButton?.addEventListener("click", async () => {
  if (!supabaseClient) return;
  els.logoutButton.disabled = true;
  try {
    await supabaseClient.auth.signOut();
  } catch (error) {
    console.error("Failed to sign out:", error);
  } finally {
    els.logoutButton.disabled = false;
  }
});

function applyThemeToggleLabel() {
  if (!els.themeToggleButton) return;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const icon = els.themeToggleButton.querySelector(".theme-link-icon");
  const label = els.themeToggleButton.querySelector(".theme-link-label");
  if (icon) icon.textContent = isDark ? "☼" : "☾";
  if (label) label.textContent = isDark ? "Світла тема" : "Темна тема";
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("theme", theme);
  } catch (error) {
    // Ignore storage failures (e.g. private browsing) — theme still applies for this session.
  }
  applyThemeToggleLabel();
}

els.themeToggleButton?.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  setTheme(isDark ? "light" : "dark");
});
applyThemeToggleLabel();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}

els.dailyLogAddButton?.addEventListener("click", () => {
  if (els.dailyLogInputRow.hidden) {
    openDailyLogInput();
  } else {
    submitDailyLogInput();
  }
});
els.dailyLogInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submitDailyLogInput();
  if (event.key === "Escape") closeDailyLogInput();
});
els.dailyLogInput?.addEventListener("blur", () => {
  window.setTimeout(() => {
    if (document.activeElement !== els.dailyLogInput) closeDailyLogInput();
  }, 120);
});
els.dailyLogMicButton?.addEventListener("click", toggleDailyLogVoiceInput);

loadDailyLog();
renderDailyLog();
setupDailyLogSpeechRecognition();

setupSpeechRecognition();
setupNewReminderPicker();
els.newReminderEnabled.addEventListener("change", updateNewReminderVisibility);
updateNewReminderVisibility();
render();
setupAccessGate();

document.addEventListener("pointerdown", unlockReminderAudio, { once: true });
document.addEventListener("pointerdown", unlockMp3Audio, { once: true });
window.setInterval(checkDueReminders, REMINDER_ALERT_INTERVAL_MS);
// Keep the "overdue" highlight fresh even when nothing else triggers a
// re-render (e.g. the app is just left open past a reminder's time).
const OVERDUE_REFRESH_INTERVAL_MS = 30000;
window.setInterval(() => {
  if (appDataReady) render();
}, OVERDUE_REFRESH_INTERVAL_MS);
checkDueReminders();
