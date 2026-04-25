/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   DASHBOARD.JS — Scores, Stats, Progress, Activity List
   ============================================================ */

import { supa, initKeys } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import {
  showToast,
  showXPToast,
  lsGet,
  lsSet,
  lsRemove,
  shuffle,
} from "../utilities/helpers.js";
import { colorPy } from "../utilities/pinyin.js";
import {
  calcLevel,
  calcTier,
  checkBadgeUnlock,
  TITLES,
  BADGES,
} from "../core/level.js";
import {
  gramScores,
  updateGrammarDashboard,
  loadGrammarCounts,
  renderGrammarList,
} from "./grammar.js";
import { ceritaScores, updateCeritaDashboard } from "./cerita.js";
import { updateHanziDashboard } from "./hanzi.js";
import { renderKalList } from "./kalimat.js";
import { renderQuizList } from "./quiz.js";
import { refreshKosDashboardProgress } from "./kosakata.js";
import {
  fetchUserStats,
  invalidateStatsCache,
} from "../utilities/stats-api.js";

/* ── Constants ── */
const LS_HAN = "hsk_han";
const XP_WEIGHT = { high: 36, mid: 18, low: 9, flat: 36 };

/* ── Score Objects (export untuk akses file lain) ── */
export const quizScoresGlobal = {};
export const quizMetaGlobal = {};
export const kalMetaGlobal = {};
export const kalScoresGlobal = {};
export const hanziScoresGlobal = {};
export const fcScoresGlobal = {};
export const nadaScoresGlobal = {};
export const speakingScoresGlobal = {};
export const ceritaQuizScoresGlobal = {};

/* ── Cache for DB sets ── */
let _quizSetsCache = null;
let _kalSetsCache = null;
let _hanziSetsCache = null;
let _gramSetsCache = null;
let _ceritaSetsCache = null;

/* ── Streak Cache ── */
let _currentStreak = 0;
let _streakDates = new Set();
let _streakLoading = false;
let _lastBackgroundLoad = 0;
let _streakRecordedDate = null;

/* ── Unlock Notification Cache ── */
let _lastUnlockNotifiedKal = new Set();
let _lastUnlockNotifiedHan = new Set();
let _scoresHaveLoaded = false;

// Promise yang di-resolve saat scores selesai dimuat
let _scoresLoadedResolve = null;
window.scoresLoaded = new Promise((res) => {
  _scoresLoadedResolve = res;
});

/* ══════════════════════════════════════════════════════════════
   LOCALSTORAGE HELPERS (wrapper)
══════════════════════════════════════════════════════════════ */
function _todayWIB() {
  return new Date().toLocaleDateString("en-CA");
}

/* ══════════════════════════════════════════════════════════════
   RENDER HEATMAP AKTIVITAS
══════════════════════════════════════════════════════════════ */
export async function renderHeatmap(prefetchedDates) {
  await new Promise((r) => requestAnimationFrame(r));
  const wrap = document.getElementById("heatmap-wrap");
  const streakLabel = document.getElementById("heatmap-streak-label");
  if (!wrap) return;

  const CELL = 11;
  const GAP = 3;
  const containerW =
    wrap.getBoundingClientRect().width || wrap.offsetWidth || 300;
  const WEEKS = Math.floor((containerW + GAP) / (CELL + GAP));
  const TOTAL_DAYS = WEEKS * 7;

  let activeDates =
    prefetchedDates instanceof Set ? prefetchedDates : new Set();
  const currentUser = getCurrentUser();
  if (!(prefetchedDates instanceof Set) && currentUser) {
    const since = (() => {
      const d = new Date();
      d.setDate(d.getDate() - TOTAL_DAYS - 7);
      return d.toISOString().slice(0, 10);
    })();
    const { data } = await supa
      .from("daily_streaks")
      .select("date")
      .eq("user_id", currentUser.id)
      .gte("date", since);
    if (data) data.forEach((r) => activeDates.add(r.date));
  }

  const today = _todayWIB();
  const todayDate = new Date(today);
  const dayOfWeek = todayDate.getDay();
  const daysToSat = 6 - dayOfWeek;
  const endDate = new Date(todayDate);
  endDate.setDate(endDate.getDate() + daysToSat);

  const MONTH_SHORT = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "Mei",
    "Jun",
    "Jul",
    "Agu",
    "Sep",
    "Okt",
    "Nov",
    "Des",
  ];
  const monthLabels = [];
  let lastMonth = -1;
  let lastLabelCol = -99;

  const columns = [];
  for (let w = WEEKS - 1; w >= 0; w--) {
    const colIdx = WEEKS - 1 - w;
    const days = [];
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(endDate);
      cellDate.setDate(endDate.getDate() - (w * 7 + (6 - d)));
      const dateStr = cellDate.toISOString().slice(0, 10);
      days.push({ dateStr, month: cellDate.getMonth() });
    }
    const topMonth = days[0].month;
    if (topMonth !== lastMonth && colIdx - lastLabelCol >= 3) {
      monthLabels.push({ colIdx, label: MONTH_SHORT[topMonth] });
      lastLabelCol = colIdx;
      lastMonth = topMonth;
    }
    columns.push(days);
  }

  const grid = document.getElementById("heatmap-grid");
  if (!grid) return;
  grid.innerHTML = "";
  const colEls = [];
  columns.forEach((days) => {
    const col = document.createElement("div");
    col.className = "heatmap-col";
    days.forEach(({ dateStr }) => {
      const isFuture = dateStr > today;
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      if (isFuture) {
        cell.classList.add("hm-c0");
        cell.style.opacity = "0.3";
      } else if (activeDates.has(dateStr)) {
        cell.classList.add("hm-c3");
      } else {
        cell.classList.add("hm-c0");
      }
      if (dateStr === today) cell.classList.add("hm-today");
      col.appendChild(cell);
    });
    grid.appendChild(col);
    colEls.push(col);
  });

  const monthRow = document.getElementById("heatmap-months");
  if (monthRow) {
    monthRow.innerHTML = "";
    monthRow.style.position = "relative";
    monthRow.style.height = "12px";
    monthRow.style.width = "100%";
    await new Promise((r) => requestAnimationFrame(r));
    const gridRect = grid.getBoundingClientRect();
    monthLabels.forEach(({ colIdx, label }) => {
      const colEl = colEls[colIdx];
      if (!colEl) return;
      const colRect = colEl.getBoundingClientRect();
      const span = document.createElement("span");
      span.className = "heatmap-month-lbl";
      span.style.position = "absolute";
      span.style.left = colRect.left - gridRect.left + "px";
      span.textContent = label;
      monthRow.appendChild(span);
    });
  }

  if (streakLabel)
    streakLabel.textContent = _currentStreak > 0 ? `🔥 ${_currentStreak}` : "";

  const totalEl = document.getElementById("stat-total-days");
  const currentUserForTotal = getCurrentUser();
  if (totalEl && currentUserForTotal) {
    const { count } = await supa
      .from("daily_streaks")
      .select("date", { count: "exact", head: true })
      .eq("user_id", currentUserForTotal.id);
    if (count !== null) totalEl.textContent = count;
  }
}

/* ══════════════════════════════════════════════════════════════
   STREAK SYSTEM
══════════════════════════════════════════════════════════════ */
async function loadStreak() {
  const currentUser = getCurrentUser();
  if (!currentUser || _streakLoading) return;
  _streakLoading = true;
  try {
    const since = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 400);
      return d.toISOString().slice(0, 10);
    })();

    const { data, error } = await supa
      .from("daily_streaks")
      .select("date")
      .eq("user_id", currentUser.id)
      .gte("date", since)
      .order("date", { ascending: false })
      .limit(400);
    if (error) {
      console.error("loadStreak:", error);
      return;
    }
    if (!data || data.length === 0) {
      _currentStreak = 0;
      _renderStreak();
      renderHeatmap(new Set());
      return;
    }

    const dates = new Set(data.map((r) => r.date));
    _streakDates = dates;
    const today = _todayWIB();
    const yesterday = (() => {
      const d = new Date(today);
      d.setDate(d.getDate() - 1);
      return d.toISOString().slice(0, 10);
    })();
    const startFrom = dates.has(today)
      ? today
      : dates.has(yesterday)
        ? yesterday
        : null;

    if (!startFrom) {
      _currentStreak = 0;
      _renderStreak();
      renderHeatmap(dates);
      return;
    }

    let streak = 0;
    const cur = new Date(startFrom);
    while (true) {
      const dateStr = cur.toISOString().slice(0, 10);
      if (dates.has(dateStr)) {
        streak++;
        cur.setDate(cur.getDate() - 1);
      } else break;
    }
    _currentStreak = streak;
    _renderStreak();
    renderHeatmap(dates);
  } finally {
    _streakLoading = false;
  }
}

function _incrementDayIntensity(date) {
  const key = "hm_intensity";
  const map = lsGet(key, {});
  map[date] = (map[date] || 0) + 1;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 200);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  Object.keys(map).forEach((d) => {
    if (d < cutoffStr) delete map[d];
  });
  lsSet(key, map);
}

function _getDayIntensity(date) {
  return lsGet("hm_intensity", {})[date] || 0;
}

async function _recordDailyStreak() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  const today = _todayWIB();
  _incrementDayIntensity(today);
  if (_streakRecordedDate === today) return;
  _streakRecordedDate = today;
  await supa
    .from("daily_streaks")
    .upsert(
      { user_id: currentUser.id, date: today },
      { onConflict: "user_id,date", ignoreDuplicates: true },
    );
  await loadStreak();
}

function _renderStreak() {
  window._currentStreak = _currentStreak; // sync ke window — primitif tidak reactive
  const lbl = document.getElementById("heatmap-streak-label");
  if (lbl) lbl.textContent = _currentStreak > 0 ? `🔥 ${_currentStreak}` : "";
  const bigEl = document.getElementById("streak-days-big");
  if (bigEl) bigEl.textContent = _currentStreak;
  const statBest = document.getElementById("streak-stat-best");
  if (statBest) statBest.textContent = _calcBestStreak(_streakDates);
  const statKon = document.getElementById("streak-stat-kon");
  if (statKon) statKon.textContent = _calcKonsistensi(_streakDates) + "%";
  _renderStreakDots(_streakDates);
}

function _calcBestStreak(dates) {
  if (!dates.size) return 0;
  const sorted = [...dates].sort();
  let best = 1,
    cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    prev.setDate(prev.getDate() + 1);
    if (prev.toISOString().slice(0, 10) === sorted[i]) {
      cur++;
      if (cur > best) best = cur;
    } else cur = 1;
  }
  return best;
}

function _calcKonsistensi(dates) {
  if (!dates.size) return 0;
  const sorted = [...dates].sort();
  const first = new Date(sorted[0]);
  const today = new Date(_todayWIB());
  const totalDays = Math.round((today - first) / 86400000) + 1;
  return Math.round((dates.size / totalDays) * 100);
}

function _renderStreakDots(dates) {
  const row = document.getElementById("streak-dots-row");
  if (!row) return;
  const DAY_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  const today = new Date(_todayWIB());
  const todayStr = _todayWIB();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));

  row.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dStr = d.toISOString().slice(0, 10);
    const isFuture = dStr > todayStr;
    const isToday = dStr === todayStr;
    const isDone = dates.has(dStr);
    const dot = document.createElement("div");
    dot.className = "s-dot" + (isToday ? " today" : isDone ? " done" : " miss");
    if (isFuture) dot.style.opacity = "0.3";
    dot.innerHTML = `<div class="s-dot-fill"><div class="s-dot-mark">${isToday ? "●" : isDone ? "✓" : "–"}</div></div><div class="s-dot-day" ${isToday ? 'style="color:var(--gold);"' : ""}>${DAY_ID[d.getDay()]}</div>`;
    row.appendChild(dot);
  }
}

/* ══════════════════════════════════════════════════════════════
   XP SYSTEM
══════════════════════════════════════════════════════════════ */
function _xpFromScore(score) {
  if (score >= 80) return XP_WEIGHT.high;
  if (score >= 60) return XP_WEIGHT.mid;
  return XP_WEIGHT.low;
}

function _calcUserXP() {
  let xp = 0;
  Object.keys(quizScoresGlobal).forEach(
    (k) => (xp += _xpFromScore(quizScoresGlobal[k])),
  );
  Object.keys(kalScoresGlobal).forEach(
    (k) => (xp += _xpFromScore(kalScoresGlobal[k])),
  );
  Object.keys(gramScores).forEach((k) => (xp += _xpFromScore(gramScores[k])));
  Object.keys(hanziScoresGlobal).forEach((k) => {
    if (hanziScoresGlobal[k] >= 100) xp += XP_WEIGHT.flat;
  });
  Object.keys(ceritaScores).forEach((k) => {
    if (ceritaScores[k] >= 95) xp += XP_WEIGHT.flat;
  });
  const capXP = (v) => Math.min(v || 0, XP_WEIGHT.high);
  Object.keys(fcScoresGlobal).forEach((k) => (xp += capXP(fcScoresGlobal[k])));
  Object.keys(nadaScoresGlobal).forEach(
    (k) => (xp += capXP(nadaScoresGlobal[k])),
  );
  Object.keys(speakingScoresGlobal).forEach(
    (k) => (xp += capXP(speakingScoresGlobal[k])),
  );
  Object.keys(ceritaQuizScoresGlobal).forEach((k) => {
    const score = ceritaQuizScoresGlobal[k];
    if (score >= 80) xp += 20;
    else if (score >= 60) xp += 12;
    else xp += 6;
  });
  return xp;
}

function _calcMaxXP() {
  const quizCount = _quizSetsCache
    ? _quizSetsCache.length
    : window.QUIZ_KEYS?.length || 0;
  const kalCount = _kalSetsCache
    ? _kalSetsCache.length
    : window.KALIMAT_KEYS?.length || 0;
  const gramCount = _gramSetsCache ? _gramSetsCache.length : 0;
  const hanziCount = _hanziSetsCache
    ? _hanziSetsCache.length
    : window.HANZI_KEYS?.length || 0;
  const ceritaCount = _ceritaSetsCache ? _ceritaSetsCache.length : 0;
  return (
    (quizCount + kalCount + gramCount + hanziCount + ceritaCount) *
    XP_WEIGHT.high
  );
}

/* ── PATCHED: _renderLevel() — async, XP dari server ── */
async function _renderLevel() {
  // Ambil XP dari server — tidak bisa dimanipulasi dari console
  const stats = await fetchUserStats();
  const userXP = stats?.xp ?? _calcUserXP(); // fallback ke lokal jika offline
  const maxXP = _calcMaxXP();

  const elLevel = document.getElementById("stat-level");
  const elSub = document.getElementById("stat-level-sub");
  const level = calcLevel(userXP, maxXP);
  const tier = calcTier(level);
  if (elLevel) elLevel.textContent = level;
  if (elSub) elSub.textContent = `${userXP} XP`;
  if (elLevel && tier) elLevel.style.color = tier.color;

  const kosakataCount =
    stats?.kosakataCount ?? Object.keys(fcScoresGlobal).length * 20;
  const sesiCount =
    stats?.sesiCount ??
    Object.keys(quizScoresGlobal).length +
      Object.keys(kalScoresGlobal).length +
      Object.keys(gramScores).length +
      Object.keys(hanziScoresGlobal).length +
      Object.keys(ceritaScores).length +
      Object.keys(fcScoresGlobal).length +
      Object.keys(nadaScoresGlobal).length;

  checkBadgeUnlock(userXP, {
    streak: _currentStreak,
    kosakata: kosakataCount,
    sesi: sesiCount,
  });
}

/* ══════════════════════════════════════════════════════════════
   LOAD SCORES FROM SUPABASE
══════════════════════════════════════════════════════════════ */
export async function loadScores() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  await initKeys();

  _lastBackgroundLoad = Date.now();

  const [scoresRes] = await Promise.all([
    supa
      .from("user_scores")
      .select("key, score, type, meta")
      .eq("user_id", currentUser.id),
    !_quizSetsCache
      ? typeof window._ensureQuizSetsCache === "function"
        ? window._ensureQuizSetsCache()
        : supa
            .from("quiz_sets")
            .select("key, title, sub, badge, hsk_level")
            .order("sort_order", { ascending: true })
            .then(({ data, error }) => {
              if (!error && data) _quizSetsCache = data;
            })
      : Promise.resolve(),
    !_kalSetsCache
      ? supa
          .from("kalimat_sets")
          .select("key, title, sub, hsk_level, unlock_after")
          .order("hsk_level", { ascending: true })
          .order("sort_order", { ascending: true })
          .then(({ data, error }) => {
            if (!error && data) _kalSetsCache = data;
          })
      : Promise.resolve(),
    !_hanziSetsCache
      ? supa
          .from("hanzi_sets")
          .select(
            "key, title, sub, description, badge, hsk_level, sort_order, unlock_after",
          )
          .order("hsk_level", { ascending: true })
          .order("sort_order", { ascending: true })
          .then(({ data, error }) => {
            if (!error && data) _hanziSetsCache = data;
          })
      : Promise.resolve(),
  ]);

  if (scoresRes.error) {
    console.error("loadScores error:", scoresRes.error);
    return;
  }
  const data = scoresRes.data;

  Object.keys(quizScoresGlobal).forEach((k) => delete quizScoresGlobal[k]);
  Object.keys(kalScoresGlobal).forEach((k) => delete kalScoresGlobal[k]);
  Object.keys(quizMetaGlobal).forEach((k) => delete quizMetaGlobal[k]);
  Object.keys(kalMetaGlobal).forEach((k) => delete kalMetaGlobal[k]);
  Object.keys(gramScores).forEach((k) => delete gramScores[k]);
  Object.keys(ceritaScores).forEach((k) => delete ceritaScores[k]);
  Object.keys(hanziScoresGlobal).forEach((k) => delete hanziScoresGlobal[k]);
  Object.keys(fcScoresGlobal).forEach((k) => delete fcScoresGlobal[k]);
  Object.keys(nadaScoresGlobal).forEach((k) => delete nadaScoresGlobal[k]);
  Object.keys(speakingScoresGlobal).forEach(
    (k) => delete speakingScoresGlobal[k],
  );
  Object.keys(ceritaQuizScoresGlobal).forEach(
    (k) => delete ceritaQuizScoresGlobal[k],
  );

  data.forEach((row) => {
    if (row.type === "quiz") {
      quizScoresGlobal[row.key] = row.score;
      if (row.meta) quizMetaGlobal[row.key] = row.meta;
    }
    if (row.type === "kal") {
      kalScoresGlobal[row.key] = row.score;
      if (row.meta) kalMetaGlobal[row.key] = row.meta;
    }
    if (row.type === "grammar") gramScores[row.key] = row.score;
    if (row.type === "cerita") ceritaScores[row.key] = row.score;
    if (row.type === "hanzi") hanziScoresGlobal[row.key] = row.score;
    if (row.type === "fc_session") fcScoresGlobal[row.key] = row.score;
    if (row.type === "speaking_session")
      speakingScoresGlobal[row.key] = row.score;
    if (row.type === "nada_session") nadaScoresGlobal[row.key] = row.score;
    if (row.type === "cerita_quiz") ceritaQuizScoresGlobal[row.key] = row.score;
  });

  renderStats();
  updateDailyProgress();
  updateGrammarDashboard();
  updateHanziDashboard();
  updateCeritaDashboard();

  // Bug #5 fix: sync window caches setelah diisi — assignment sekali waktu di bawah
  // tidak cukup karena JS primitive reference sudah terputus saat module load
  window._quizSetsCache = _quizSetsCache;
  window._kalSetsCache = _kalSetsCache;
  window._hanziSetsCache = _hanziSetsCache;
  window._gramSetsCache = _gramSetsCache;
  window._ceritaSetsCache = _ceritaSetsCache;

  if (_quizSetsCache) renderQuizList();
  if (_kalSetsCache) renderKalList();
  if (_gramSetsCache) renderGrammarList();
  if (typeof refreshKosDashboardProgress === "function")
    refreshKosDashboardProgress().catch(console.error);

  // PATCH: resolve window.scoresLoaded promise agar quiz.js bisa re-render
  _scoresHaveLoaded = true;
  window._scoresHaveLoaded = true;
  if (typeof _scoresLoadedResolve === "function") {
    _scoresLoadedResolve();
    _scoresLoadedResolve = null; // resolve sekali saja
  }
  // Tetap panggil signalScoresLoaded jika ada (backward compat)
  if (typeof window.signalScoresLoaded === "function")
    window.signalScoresLoaded();

  _prefetchNextQuiz();

  await Promise.all([
    loadStreak(),
    renderActList(),
    typeof loadGrammarCounts === "function"
      ? loadGrammarCounts()
      : Promise.resolve(),
    typeof window.updateSrsDashboard === "function"
      ? window.updateSrsDashboard()
      : Promise.resolve(),
  ]);

  checkUnlockAndNotify().catch(console.error);
}

/* ══════════════════════════════════════════════════════════════
   CHECK UNLOCK & NOTIFY
══════════════════════════════════════════════════════════════ */
async function checkUnlockAndNotify() {
  const currentUser = getCurrentUser();
  if (!currentUser || !_quizSetsCache) return;

  if (_kalSetsCache && _kalSetsCache.length) {
    for (const s of _kalSetsCache) {
      const quizDone = _quizSetsCache.filter(
        (q) =>
          q.hsk_level === s.hsk_level && quizScoresGlobal[q.key] !== undefined,
      ).length;
      const wasLocked =
        !_lastUnlockNotifiedKal.has(s.key) &&
        s.unlock_after > 0 &&
        quizDone < s.unlock_after;
      const nowUnlocked = s.unlock_after > 0 && quizDone >= s.unlock_after;
      if (wasLocked && nowUnlocked) {
        _lastUnlockNotifiedKal.add(s.key);
        showToast(`🎉 Quiz Kumulatif "${s.title}" telah terbuka!`, "success");
      }
    }
  }

  if (_hanziSetsCache && _hanziSetsCache.length) {
    for (const s of _hanziSetsCache) {
      const quizDone = _quizSetsCache.filter(
        (q) =>
          q.hsk_level === s.hsk_level && quizScoresGlobal[q.key] !== undefined,
      ).length;
      const wasLocked =
        !_lastUnlockNotifiedHan.has(s.key) &&
        s.unlock_after > 0 &&
        quizDone < s.unlock_after;
      const nowUnlocked = s.unlock_after > 0 && quizDone >= s.unlock_after;
      if (wasLocked && nowUnlocked) {
        _lastUnlockNotifiedHan.add(s.key);
        showToast(
          `🎉 Flashcard Kumulatif "${s.title}" telah terbuka!`,
          "success",
        );
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   UPSERT / DELETE SCORE
══════════════════════════════════════════════════════════════ */
export async function upsertScore(type, key, score, meta = null) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  const payload = {
    user_id: currentUser.id,
    type,
    key,
    score,
    updated_at: new Date().toISOString(),
  };
  if (meta !== null) payload.meta = meta;
  await supa
    .from("user_scores")
    .upsert(payload, { onConflict: "user_id,type,key" });
  invalidateStatsCache(); // ← PATCH: reset cache supaya XP fresh dari server
  _recordDailyStreak().catch(console.error);
}

export async function deleteScore(type, key) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  await supa
    .from("user_scores")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("type", type)
    .eq("key", key);
}

export async function saveScore(key, score, meta = null) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showToast("Login dulu untuk menyimpan skor 🔒", "warn");
    return;
  }
  quizScoresGlobal[key] = score;
  if (meta) quizMetaGlobal[key] = meta;
  lsSet("hsk_last_quiz_key", key);
  showXPToast(score >= 80 ? 36 : score >= 60 ? 18 : 9, "Quiz selesai");
  upsertScore("quiz", key, score, meta).catch(console.error);
  renderStats();
  updateDailyProgress();
  if (
    _quizSetsCache &&
    _kalSetsCache &&
    _gramSetsCache &&
    _hanziSetsCache &&
    _ceritaSetsCache
  ) {
    _renderActListFromCache();
  }
}

export async function saveKalScore(key, score, meta = null) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showToast("Login dulu untuk menyimpan skor 🔒", "warn");
    return;
  }
  kalScoresGlobal[key] = score;
  if (meta) kalMetaGlobal[key] = meta;
  showXPToast(score >= 80 ? 36 : score >= 60 ? 18 : 9, "Kalimat selesai");
  upsertScore("kal", key, score, meta).catch(console.error);
  updateDailyProgress();
  if (
    _quizSetsCache &&
    _kalSetsCache &&
    _gramSetsCache &&
    _hanziSetsCache &&
    _ceritaSetsCache
  ) {
    _renderActListFromCache();
  }
}

/* ══════════════════════════════════════════════════════════════
   RENDER STATS
══════════════════════════════════════════════════════════════ */
export function renderStats() {
  _renderStreak();
  _renderLevel().catch((err) => console.warn("renderStats/_renderLevel:", err));
  const totalDone =
    Object.keys(quizScoresGlobal).length +
    Object.keys(kalScoresGlobal).length +
    Object.keys(gramScores).length +
    Object.keys(hanziScoresGlobal).filter((k) => hanziScoresGlobal[k] >= 100)
      .length +
    Object.keys(ceritaScores).filter((k) => ceritaScores[k] >= 95).length +
    Object.keys(fcScoresGlobal).filter((k) => fcScoresGlobal[k] > 0).length +
    Object.keys(nadaScoresGlobal).filter((k) => nadaScoresGlobal[k] > 0)
      .length +
    Object.keys(ceritaQuizScoresGlobal).filter(
      (k) => ceritaQuizScoresGlobal[k] > 0,
    ).length +
    Object.keys(speakingScoresGlobal).filter((k) => speakingScoresGlobal[k] > 0)
      .length;
  const statBest = document.getElementById("stat-best");
  if (statBest) statBest.textContent = totalDone > 0 ? totalDone : "—";
  if (!getCurrentUser()) renderHeatmap();
}

/* ══════════════════════════════════════════════════════════════
   RENDER ACTIVITY LIST
══════════════════════════════════════════════════════════════ */
export async function renderActList() {
  const belumEl = document.getElementById("act-list-belum");
  const selesaiEl = document.getElementById("act-list-selesai");
  if (!belumEl || !selesaiEl) return;

  const fetches = [];
  if (!_quizSetsCache)
    fetches.push(
      supa
        .from("quiz_sets")
        .select("key, title, sub, badge, hsk_level")
        .order("sort_order", { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) _quizSetsCache = data;
        }),
    );
  if (!_kalSetsCache)
    fetches.push(
      supa
        .from("kalimat_sets")
        .select("key, title, sub, hsk_level")
        .order("hsk_level", { ascending: true })
        .order("sort_order", { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) _kalSetsCache = data;
        }),
    );
  if (!_gramSetsCache)
    fetches.push(
      supa
        .from("grammar_patterns")
        .select("id, title, slug, hsk_level")
        .order("hsk_level", { ascending: true })
        .order("sort_order", { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) _gramSetsCache = data;
        }),
    );
  if (!_hanziSetsCache)
    fetches.push(
      supa
        .from("hanzi_sets")
        .select("key, title, sub, description, badge, hsk_level, sort_order")
        .order("hsk_level", { ascending: true })
        .order("sort_order", { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) _hanziSetsCache = data;
        }),
    );
  if (!_ceritaSetsCache)
    fetches.push(
      supa
        .from("cerita_sets")
        .select(
          "key, title, title_zh, description, badge, hsk_level, total_chars, sort_order",
        )
        .eq("is_published", true)
        .order("hsk_level", { ascending: true })
        .order("sort_order", { ascending: true })
        .then(({ data, error }) => {
          if (!error && data) _ceritaSetsCache = data;
        }),
    );

  if (fetches.length > 0) await Promise.all(fetches);

  const quizSetsMeta = _quizSetsCache
    ? _quizSetsCache.map((s) => ({
        key: s.key,
        label: s.title,
        type: "quiz",
        hsk: `hsk${s.hsk_level || 1}`,
      }))
    : [];
  const kalSetsMeta = _kalSetsCache
    ? _kalSetsCache.map((s) => ({
        key: s.key,
        label: s.title,
        type: "kal",
        hsk: `hsk${s.hsk_level || 1}`,
      }))
    : [];
  const gramMeta = _gramSetsCache
    ? _gramSetsCache.map((s) => ({
        key: s.slug,
        label: s.title,
        type: "grammar",
        hsk: `hsk${s.hsk_level || 1}`,
      }))
    : [];
  const hanziMeta = _hanziSetsCache
    ? _hanziSetsCache.map((s) => ({
        key: s.key,
        label: s.title,
        type: "hanzi",
        hsk: `hsk${s.hsk_level || 1}`,
      }))
    : [];
  const ceritaMeta = _ceritaSetsCache
    ? _ceritaSetsCache.map((s) => ({
        key: s.key,
        label: s.title,
        type: "cerita",
        hsk: `hsk${s.hsk_level || 1}`,
      }))
    : [];

  const TYPE_LABEL = {
    quiz: { text: "Quiz", cls: "act-tag-quiz" },
    kal: { text: "Kalimat", cls: "act-tag-kal" },
    grammar: { text: "Pola", cls: "act-tag-grammar" },
    hanzi: { text: "Hanzi", cls: "act-tag-hanzi" },
    cerita: { text: "Cerita", cls: "act-tag-cerita" },
  };

  const allMeta = [
    ...quizSetsMeta,
    ...kalSetsMeta,
    ...gramMeta,
    ...hanziMeta,
    ...ceritaMeta,
  ];
  const belum = [];
  const selesai = [];

  allMeta.forEach((m) => {
    let s;
    if (m.type === "quiz") s = quizScoresGlobal[m.key];
    else if (m.type === "kal") s = kalScoresGlobal[m.key];
    else if (m.type === "grammar") s = gramScores[m.key];
    else if (m.type === "hanzi") {
      if (getCurrentUser()) {
        const sc = hanziScoresGlobal[m.key];
        s = sc !== undefined && sc >= 100 ? 100 : undefined;
      } else {
        const saved = lsGet(LS_HAN);
        const st = saved[m.key];
        s = st && st.filter((v) => v >= 2).length >= 100 ? 100 : undefined;
      }
    } else if (m.type === "cerita") {
      const pct = ceritaScores[m.key];
      s = pct !== undefined && pct >= 95 ? 100 : undefined;
    }

    const tl = TYPE_LABEL[m.type];
    const typeTag = `<span class="act-tag ${tl.cls}">${tl.text}</span>`;
    const scoreColor =
      s !== undefined
        ? s >= 80
          ? "var(--green)"
          : s >= 60
            ? "var(--gold)"
            : "var(--red)"
        : "";
    const unit = m.type === "grammar" || m.type === "cerita" ? "%" : "/100";
    const badge =
      s !== undefined
        ? `<span style="font-size:11px;font-weight:600;color:${scoreColor}">${s}${unit}</span>`
        : "";
    const item = `<div class="act-item" data-type="${m.type}" data-hsk="${m.hsk}"><div class="act-dot"></div><div class="act-name">${typeTag}${m.label}</div>${badge}</div>`;
    if (s !== undefined) selesai.push(item);
    else belum.push(item);
  });

  belumEl.innerHTML = belum.length
    ? belum.join("")
    : '<div class="prog-section-empty">🎉 Semua sudah selesai!</div>';
  selesaiEl.innerHTML = selesai.length
    ? selesai.join("")
    : '<div class="prog-section-empty">Belum ada yang selesai</div>';

  const tabB = document.getElementById("prog-tab-belum");
  const tabS = document.getElementById("prog-tab-selesai");
  if (tabB) tabB.textContent = `Belum (${belum.length})`;
  if (tabS) tabS.textContent = `Selesai (${selesai.length})`;

  _applyProgFilters();
}

function _renderActListFromCache() {
  const belumEl = document.getElementById("act-list-belum");
  const selesaiEl = document.getElementById("act-list-selesai");
  if (!belumEl || !selesaiEl) return;

  const quizSetsMeta = (_quizSetsCache || []).map((s) => ({
    key: s.key,
    label: s.title,
    type: "quiz",
    hsk: `hsk${s.hsk_level || 1}`,
  }));
  const kalSetsMeta = (_kalSetsCache || []).map((s) => ({
    key: s.key,
    label: s.title,
    type: "kal",
    hsk: `hsk${s.hsk_level || 1}`,
  }));
  const gramMeta = (_gramSetsCache || []).map((s) => ({
    key: s.slug,
    label: s.title,
    type: "grammar",
    hsk: `hsk${s.hsk_level || 1}`,
  }));
  const hanziMeta = (_hanziSetsCache || []).map((s) => ({
    key: s.key,
    label: s.title,
    type: "hanzi",
    hsk: `hsk${s.hsk_level || 1}`,
  }));
  const ceritaMeta = (_ceritaSetsCache || []).map((s) => ({
    key: s.key,
    label: s.title,
    type: "cerita",
    hsk: `hsk${s.hsk_level || 1}`,
  }));

  const TYPE_LABEL = {
    quiz: { text: "Quiz", cls: "act-tag-quiz" },
    kal: { text: "Kalimat", cls: "act-tag-kal" },
    grammar: { text: "Pola", cls: "act-tag-grammar" },
    hanzi: { text: "Hanzi", cls: "act-tag-hanzi" },
    cerita: { text: "Cerita", cls: "act-tag-cerita" },
  };

  const allMeta = [
    ...quizSetsMeta,
    ...kalSetsMeta,
    ...gramMeta,
    ...hanziMeta,
    ...ceritaMeta,
  ];
  const belum = [];
  const selesai = [];

  allMeta.forEach((m) => {
    let s;
    if (m.type === "quiz") s = quizScoresGlobal[m.key];
    else if (m.type === "kal") s = kalScoresGlobal[m.key];
    else if (m.type === "grammar") s = gramScores[m.key];
    else if (m.type === "hanzi") {
      if (getCurrentUser()) {
        const sc = hanziScoresGlobal[m.key];
        s = sc !== undefined && sc >= 100 ? 100 : undefined;
      } else {
        const saved = lsGet(LS_HAN);
        const st = saved[m.key];
        s = st && st.filter((v) => v >= 2).length >= 100 ? 100 : undefined;
      }
    } else if (m.type === "cerita") {
      const pct = ceritaScores[m.key];
      s = pct !== undefined && pct >= 95 ? 100 : undefined;
    }

    const tl = TYPE_LABEL[m.type];
    const typeTag = `<span class="act-tag ${tl.cls}">${tl.text}</span>`;
    const scoreColor =
      s !== undefined
        ? s >= 80
          ? "var(--green)"
          : s >= 60
            ? "var(--gold)"
            : "var(--red)"
        : "";
    const unit = m.type === "grammar" || m.type === "cerita" ? "%" : "/100";
    const badge =
      s !== undefined
        ? `<span style="font-size:11px;font-weight:600;color:${scoreColor}">${s}${unit}</span>`
        : "";
    const item = `<div class="act-item" data-type="${m.type}" data-hsk="${m.hsk}"><div class="act-dot"></div><div class="act-name">${typeTag}${m.label}</div>${badge}</div>`;
    if (s !== undefined) selesai.push(item);
    else belum.push(item);
  });

  belumEl.innerHTML = belum.length
    ? belum.join("")
    : '<div class="prog-section-empty">🎉 Semua sudah selesai!</div>';
  selesaiEl.innerHTML = selesai.length
    ? selesai.join("")
    : '<div class="prog-section-empty">Belum ada yang selesai</div>';

  const tabB = document.getElementById("prog-tab-belum");
  const tabS = document.getElementById("prog-tab-selesai");
  if (tabB) tabB.textContent = `Belum (${belum.length})`;
  if (tabS) tabS.textContent = `Selesai (${selesai.length})`;

  _applyProgFilters();
}

/* ── Filter State ── */
let _progTypeFilter = "all";

export function filterProgType(el) {
  document
    .querySelectorAll(".prog-type-pill")
    .forEach((p) => p.classList.remove("active"));
  el.classList.add("active");
  _progTypeFilter = el.dataset.type;
  _applyProgFilters();
}

function _applyProgFilters() {
  const belumEl = document.getElementById("act-list-belum");
  const selesaiEl = document.getElementById("act-list-selesai");
  const tabB = document.getElementById("prog-tab-belum");
  const tabS = document.getElementById("prog-tab-selesai");

  let belumCount = 0,
    selesaiCount = 0;
  [belumEl, selesaiEl].forEach((list) => {
    if (!list) return;
    list.querySelectorAll(".act-item[data-type]").forEach((item) => {
      const visible =
        _progTypeFilter === "all" || item.dataset.type === _progTypeFilter;
      item.style.display = visible ? "" : "none";
      if (visible) {
        if (list.id === "act-list-belum") belumCount++;
        else selesaiCount++;
      }
    });
  });
  if (tabB) tabB.textContent = `Belum (${belumCount})`;
  if (tabS) tabS.textContent = `Selesai (${selesaiCount})`;
}

/* ── Switch Progress Tab ── */
export function switchProgTab(tab) {
  const belumEl = document.getElementById("act-list-belum");
  const selesaiEl = document.getElementById("act-list-selesai");
  const tabBelum = document.getElementById("prog-tab-belum");
  const tabSelesai = document.getElementById("prog-tab-selesai");
  if (!belumEl || !selesaiEl) return;
  if (tab === "belum") {
    belumEl.style.display = "";
    selesaiEl.style.display = "none";
    tabBelum.classList.add("active");
    tabSelesai.classList.remove("active");
  } else {
    belumEl.style.display = "none";
    selesaiEl.style.display = "";
    tabBelum.classList.remove("active");
    tabSelesai.classList.add("active");
  }
}

/* ══════════════════════════════════════════════════════════════
   UPDATE DAILY PROGRESS
══════════════════════════════════════════════════════════════ */
export function updateDailyProgress() {
  const quizDone = (window.QUIZ_KEYS || []).filter(
    (k) => quizScoresGlobal[k] !== undefined,
  ).length;
  const kalDone = (window.KALIMAT_KEYS || []).filter(
    (k) => kalScoresGlobal[k] !== undefined,
  ).length;
  const totalQuiz = (window.QUIZ_KEYS || []).length;
  const totalKal = (window.KALIMAT_KEYS || []).length;

  const qv = document.getElementById("mc-quiz-val");
  const qf = document.getElementById("mc-quiz-fill");
  if (qv) qv.textContent = `${quizDone} / ${totalQuiz}`;
  if (qf) qf.style.width = (quizDone / totalQuiz) * 100 + "%";

  const kv = document.getElementById("mc-kal-val");
  const kf = document.getElementById("mc-kal-fill");
  if (kv) kv.textContent = `${kalDone} / ${totalKal}`;
  if (kf) kf.style.width = (kalDone / totalKal) * 100 + "%";

  _renderStreak();
  _renderLevel().catch((err) =>
    console.warn("updateDailyProgress/_renderLevel:", err),
  );

  const mcQuizCount = document.getElementById("mc-quiz-count");
  if (mcQuizCount) mcQuizCount.textContent = `${totalQuiz} Quiz tersedia`;
  const mcKalCount = document.getElementById("mc-kal-count");
  if (mcKalCount) mcKalCount.textContent = `${totalKal} Latihan tersedia`;
  const hanziCountEl = document.getElementById("mc-hanzi-count");
  if (hanziCountEl)
    hanziCountEl.textContent = `${(window.HANZI_KEYS || []).length} Set tersedia`;
  
  updateHanziDashboard();
  
  // TAMBAHKAN INI: Agar bar kosakata ikut terupdate saat data skor masuk
  if (typeof refreshKosDashboardProgress === "function") {
    refreshKosDashboardProgress();
  }
}

/* ══════════════════════════════════════════════════════════════
   LOAD DASHBOARD COUNTS
══════════════════════════════════════════════════════════════ */
export async function loadDashboardCounts() {
  // Guard dihapus — query HEAD-only ringan, dan guard lama menyebabkan
  // elemen return null saat pertama dipanggil sebelum DOM siap.
  const [quizCount, kalCount, hanziCount, ceritaCount, deckCount, fcCount] =
    await Promise.all([
      supa.from("quiz_sets").select("id", { count: "exact", head: true }),
      supa.from("kalimat_sets").select("id", { count: "exact", head: true }),
      supa.from("hanzi_sets").select("id", { count: "exact", head: true }),
      supa
        .from("cerita_sets")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true),
      supa
        .from("flashcard_sets")
        .select("id", { count: "exact", head: true })
        .eq("is_default", true),
      supa
        .from("flashcard_sets")
        .select("id", { count: "exact", head: true })
        .eq("is_default", true),
    ]);

  const quizEl = document.getElementById("mc-quiz-count");
  if (quizEl && quizCount.count !== null)
    quizEl.textContent = `${quizCount.count} Quiz tersedia`;
  const quizSubEl = document.getElementById("layer-quiz-sub");
  if (quizSubEl && quizCount.count !== null)
    quizSubEl.textContent = `100 soal per day · 4 bagian · ${quizCount.count} quiz`;

  const kalEl = document.getElementById("mc-kal-count");
  if (kalEl && kalCount.count !== null)
    kalEl.textContent = `${kalCount.count} Latihan tersedia`;
  const kalSubEl2 = document.getElementById("layer-kal-sub");
  if (kalSubEl2 && kalCount.count !== null)
    kalSubEl2.textContent = `Kalimat kumulatif · ${kalCount.count} set`;

  const hanziEl = document.getElementById("mc-hanzi-count");
  if (hanziEl && hanziCount.count !== null)
    hanziEl.textContent = `${hanziCount.count} Set tersedia`;

  const ceritaEl = document.getElementById("mc-cerita-count");
  if (ceritaEl && ceritaCount.count !== null)
    ceritaEl.textContent = `${ceritaCount.count} Cerita tersedia`;

  const kosEl = document.getElementById("mc-kos-count");
  if (kosEl && deckCount.count !== null)
    kosEl.textContent = `${deckCount.count} Deck tersedia`;

  const fcEl = document.getElementById("mc-fc-count");
  if (fcEl && fcCount.count !== null)
    fcEl.textContent = `${fcCount.count} Set tersedia`;
}

/* ══════════════════════════════════════════════════════════════
   HANZI HELPERS
══════════════════════════════════════════════════════════════ */
function getHanziDoneCount(key) {
  const saved = lsGet(LS_HAN);
  if (!saved[key]) return 0;
  return saved[key].filter((s) => s >= 2).length;
}

function isHanziDayDone(dayIdx) {
  return getHanziDoneCount((window.HANZI_KEYS || [])[dayIdx]) >= 100;
}

function isQuizDayDone(dayIdx) {
  return quizScoresGlobal[(window.QUIZ_KEYS || [])[dayIdx]] !== undefined;
}

function getDaysDone() {
  return (window.QUIZ_KEYS || []).filter(
    (k) => quizScoresGlobal[k] !== undefined,
  ).length;
}

/* ══════════════════════════════════════════════════════════════
   HSK FILTER
══════════════════════════════════════════════════════════════ */
export function filterHSK(type, level, pillEl) {
  if (pillEl) {
    const wrap = pillEl.closest(".hsk-filter-wrap");
    if (wrap) {
      wrap
        .querySelectorAll(".hsk-pill")
        .forEach((p) => p.classList.remove("active"));
      pillEl.classList.add("active");
    }
  }
  if (type === "kos") {
    if (typeof window.filterKosHSK === "function") window.filterKosHSK(level);
    return;
  }

  const layerMap = {
    quiz: "layer-quiz",
    kalimat: "layer-kalimat",
    hanzi: "layer-hanzi",
    grammar: "layer-grammar",
    cerita: "layer-cerita",
  };
  const layer = document.getElementById(layerMap[type]);
  if (!layer) return;
  layer.querySelectorAll(".item-card[data-hsk]").forEach((card) => {
    card.style.display =
      level === "all" || card.dataset.hsk === level ? "" : "none";
  });
}

export function toggleHSKDropdown(el) {
  const isOpen = el.classList.contains("open");
  document
    .querySelectorAll(".hsk-dropdown.open")
    .forEach((d) => d.classList.remove("open"));
  if (!isOpen) el.classList.add("open");
}

export function filterHSKDropdown(e, type, level, itemEl) {
  e.stopPropagation();
  const dropdown = itemEl.closest(".hsk-dropdown");
  dropdown.querySelector(".hsk-dropdown-val").textContent = itemEl.textContent;
  dropdown
    .querySelectorAll(".hsk-dropdown-item")
    .forEach((i) => i.classList.remove("active"));
  itemEl.classList.add("active");
  dropdown.classList.remove("open");
  if (type === "kos") {
    if (typeof window.filterKosHSK === "function") window.filterKosHSK(level);
    return;
  }

  const layerMap = {
    quiz: "layer-quiz",
    hanzi: "layer-hanzi",
    kalimat: "layer-kalimat",
    grammar: "layer-grammar",
    cerita: "layer-cerita",
  };
  const layer = document.getElementById(layerMap[type]);
  if (!layer) return;
  layer.querySelectorAll(".item-card[data-hsk]").forEach((card) => {
    card.style.display =
      level === "all" || card.dataset.hsk === level ? "" : "none";
  });
}

document.addEventListener("click", (e) => {
  if (!e.target.closest(".hsk-dropdown")) {
    document
      .querySelectorAll(".hsk-dropdown.open")
      .forEach((d) => d.classList.remove("open"));
  }
});

/* ══════════════════════════════════════════════════════════════
   PREFETCH NEXT QUIZ
══════════════════════════════════════════════════════════════ */
function _prefetchNextQuiz() {
  if (!_quizSetsCache || !_quizSetsCache.length) return;
  const nextSet = _quizSetsCache.find(
    (s) => quizScoresGlobal[s.key] === undefined,
  );
  if (!nextSet) return;
  if (
    typeof window.loadQuizFromDB === "function" &&
    (!window._quizCache || !window._quizCache[nextSet.key])
  ) {
    window.loadQuizFromDB(nextSet.key).catch(() => {});
  }
}

/* ══════════════════════════════════════════════════════════════
   UPDATE SRS DASHBOARD
══════════════════════════════════════════════════════════════ */
export async function updateSrsDashboard() {
  const sec = document.getElementById("srs-sec");
  if (!sec) return;

  const currentUser = getCurrentUser();
  if (!currentUser) {
    sec.style.display = "none";
    return;
  }

  const today = _todayWIB();
  const { data: progress } = await supa
    .from("user_card_progress")
    .select("srs_level, next_review, last_reviewed")
    .eq("user_id", currentUser.id);
  const reviewed = progress ?? [];
  const total = reviewed.length;

  const todayCards = reviewed.filter((r) => r.last_reviewed === today);
  const hafalToday = todayCards.filter((r) => r.srs_level >= 1).length;
  const lupaToday = todayCards.filter((r) => r.srs_level === 0).length;
  const totalToday = hafalToday + lupaToday;
  const dueCount = reviewed.filter((r) => r.next_review <= today).length;
  const pct = totalToday > 0 ? Math.round((hafalToday / totalToday) * 100) : 0;

  const totalEl = document.getElementById("srs-total");
  const matureEl = document.getElementById("srs-mature");
  const dueEl = document.getElementById("srs-due");
  const fillEl = document.getElementById("srs-bar-fill");
  const textEl = document.getElementById("srs-bar-text");
  const pctEl = document.getElementById("srs-bar-pct");
  if (totalEl) totalEl.textContent = total;
  if (matureEl) matureEl.textContent = hafalToday;
  if (dueEl) dueEl.textContent = dueCount;
  if (fillEl) fillEl.style.width = pct + "%";
  if (textEl)
    textEl.textContent =
      totalToday > 0
        ? `${hafalToday} hafal hari ini · ${lupaToday} lupa hari ini`
        : `Belum ada sesi hari ini`;
  if (pctEl) pctEl.textContent = totalToday > 0 ? pct + "%" : "";

  const badge = document.getElementById("srs-due-badge");
  const badgeCount = document.getElementById("srs-due-count");
  if (badge && badgeCount) {
    badgeCount.textContent = dueCount;
    badge.style.display = dueCount > 0 ? "" : "none";
  }
  sec.style.display = "";
}

/* ══════════════════════════════════════════════════════════════
   EXPOSE GLOBALS KE WINDOW (untuk HTML & file lain yang belum migrasi)
══════════════════════════════════════════════════════════════ */
window.quizScores = quizScoresGlobal;
window.quizMeta = quizMetaGlobal;
window.kalMeta = kalMetaGlobal;
window.kalScores = kalScoresGlobal;
window.hanziScores = hanziScoresGlobal;
window.fcScores = fcScoresGlobal;
window.nadaScores = nadaScoresGlobal;
window.speakingScores = speakingScoresGlobal;
window.ceritaQuizScores = ceritaQuizScoresGlobal;
window._calcUserXP = _calcUserXP;
window._calcMaxXP = _calcMaxXP;
window._renderLevel = _renderLevel;
window._currentStreak = _currentStreak;
window._recordDailyStreak = _recordDailyStreak;
window._prefetchNextQuiz = _prefetchNextQuiz;
window._quizSetsCache = _quizSetsCache;
window._kalSetsCache = _kalSetsCache;
window._hanziSetsCache = _hanziSetsCache;
window._gramSetsCache = _gramSetsCache;
window._ceritaSetsCache = _ceritaSetsCache;
window._scoresHaveLoaded = _scoresHaveLoaded;
window._streakRecordedDate = _streakRecordedDate;
window._lastBackgroundLoad = _lastBackgroundLoad;
window._lastUnlockNotifiedKal = _lastUnlockNotifiedKal;
window._lastUnlockNotifiedHan = _lastUnlockNotifiedHan;

window.showToast = showToast;
window.showXPToast = showXPToast;
window.lsGet = lsGet;
window.lsSet = lsSet;
window.lsRemove = lsRemove;
window.loadScores = loadScores;
window.saveScore = saveScore;
window.saveKalScore = saveKalScore;
window.deleteScore = deleteScore;
window.upsertScore = upsertScore;
window.renderStats = renderStats;
window.renderActList = renderActList;
window.updateDailyProgress = updateDailyProgress;
window.updateSrsDashboard = updateSrsDashboard;
window.loadDashboardCounts = loadDashboardCounts;
window.filterHSK = filterHSK;
window.filterHSKDropdown = filterHSKDropdown;
window.toggleHSKDropdown = toggleHSKDropdown;
window.filterProgType = filterProgType;
window.switchProgTab = switchProgTab;
window.renderHeatmap = renderHeatmap;
window._recordDailyStreak = _recordDailyStreak;

/* ══════════════════════════════════════════════════════════════
   FINAL: SYNC KE WINDOW UNTUK AUTH.JS
══════════════════════════════════════════════════════════════ */
window.quizScores = quizScoresGlobal;
window.kalScores = kalScoresGlobal;
window.gramScores = gramScores;
window.ceritaScores = ceritaScores;
window.hanziScores = hanziScoresGlobal;
window.fcScores = fcScoresGlobal;
window.speakingScores = speakingScoresGlobal;
