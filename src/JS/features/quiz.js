/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   QUIZ.JS — Quiz Engine (load, build, render, submit, retry)
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showScreen, backToLayer, backToDash } from "../core/navigation.js";
import { calcXPFromPct } from "../utilities/xp.js";
import {
  showToast,
  showXPToast,
  lsGet,
  lsSet,
  lsGetScoped,
  lsSetScoped,
  lsRemoveScoped,
  shuffle,
  withTimeout,
} from "../utilities/helpers.js";
import { colorPy } from "../utilities/pinyin.js";
import { speakMandarin } from "../utilities/tts.js";
import {
  resolveQuizLock,
  lockMessage,
  loadUnlockedTiers,
  loadTierStartDecks,
} from "../utilities/tier-unlock.js";

let currentQuizData = null;
let currentQuizKey = null;
let allQ = [];
let answered = {};
let totalCorrect = 0;
let totalAnswered = 0;
let activeQuizTab = "all";
let _isRestoringFromRefresh = false;

const _quizCache = {};
let _quizScoresPatchScheduled = false;
let _renderQuizListId = 0;
let _loadQuizPromises = new Map();

/* ── Render helpers ── */
function renderQText(q) {
  switch (q.si) {
    case 0:
      return `<div class="q-text q-hanzi"><span class="hz">${q.q}</span></div>`;
    case 1:
      return `<div class="q-text q-pinyin">${colorPy(q.q)}</div>`;
    case 2:
      return `<div class="q-text q-hanzi"><span class="hz">${q.q}</span></div>`;
    case 3:
      return `<div class="q-text q-rumpang">${renderRumpang(q.q)}</div>`;
    default:
      return `<div class="q-text">${q.q}</div>`;
  }
}

function renderRumpang(text) {
  let out = text.replace(/_{2,}/g, "\x00BLANK\x00");
  out = out.replace(/\(([^)]+)\)/g, '<span class="lat">($1)</span>');
  out = out.replace(
    /([\u4e00-\u9fff\u3400-\u4dbf\uff01-\uff5e\u3001-\u303f\u300c-\u300f]+)/g,
    '<span class="hz">$1</span>',
  );
  out = out.replace(/\x00BLANK\x00/g, '<span class="blank"> </span>');
  return out;
}

/* ── Load Quiz from Supabase ── */
export async function loadQuizFromDB(key) {
  if (_quizCache[key]) return _quizCache[key];
  if (_loadQuizPromises.has(key)) return _loadQuizPromises.get(key);

  const p = (async () => {
    try {
      const [metaRes, questRes] = await Promise.all([
        supa.from("quiz_sets").select("title, sub").eq("key", key).single(),
        supa
          .from("quiz_questions")
          .select("section, sort_order, question, options, answer_index")
          .eq("quiz_key", key)
          .order("section")
          .order("sort_order"),
      ]);

      if (metaRes.error)
        throw new Error("Gagal load quiz meta " + key + ": " + metaRes.error.message);
      if (questRes.error)
        throw new Error("Gagal load quiz soal " + key + ": " + questRes.error.message);

      const result = {
        title: metaRes.data.title,
        sub: metaRes.data.sub,
        A: [], B: [], C: [], D: [],
      };

      for (const row of questRes.data) {
        if (result[row.section]) {
          result[row.section].push({
            q: row.question,
            opts: row.options,
            ans: row.answer_index,
          });
        }
      }
      _quizCache[key] = result;
      return result;
    } finally {
      _loadQuizPromises.delete(key);
    }
  })();

  _loadQuizPromises.set(key, p);
  return p;
}

/* ── Start Quiz ── */
export async function startQuiz(key) {
  currentQuizKey = key;
  _isRestoringFromRefresh = false;

  if (typeof window.closeLayer === "function")
    window.closeLayer("layer-quiz", true);
  showScreen("quiz-screen");

  const resultPanel = document.getElementById("result-panel");
  const warnBox = document.getElementById("warn-box");
  const progFill = document.getElementById("prog");
  const titleEl = document.getElementById("quiz-title");
  const subEl = document.getElementById("quiz-sub");

  if (resultPanel) resultPanel.classList.remove("show");
  if (warnBox) warnBox.classList.remove("show");
  if (progFill) progFill.style.width = "0%";
  if (titleEl) titleEl.textContent = "Memuat soal...";
  if (subEl) subEl.textContent = "";
  window.scrollTo(0, 0);

  try {
    currentQuizData = await loadQuizFromDB(key);
  } catch (err) {
    showToast("Gagal memuat soal. Periksa koneksi kamu.", "err");
    lsRemoveScoped("hsk_active_quiz");
    backToDash();
    return;
  }

  if (titleEl) titleEl.textContent = currentQuizData.title;
  if (subEl) subEl.textContent = currentQuizData.sub;
  const resultTitle = document.getElementById("r-title");
  if (resultTitle)
    resultTitle.textContent =
      "Hasil " + currentQuizData.title.split("—")[0].trim();

  if (window._quizSetsCache) {
    const idx = window._quizSetsCache.findIndex((s) => s.key === key);
    const nextKey =
      idx >= 0 && idx + 1 < window._quizSetsCache.length
        ? window._quizSetsCache[idx + 1].key
        : null;
    if (nextKey && !_quizCache[nextKey])
      loadQuizFromDB(nextKey).catch(() => {});
  }

  const saved = lsGetScoped("hsk_quiz_state", {});
  const savedState = saved[key];
  const isValidSave =
    savedState && savedState.allQ && savedState.allQ.length === 100;

  if (isValidSave && !savedState.submitted) {
    _isRestoringFromRefresh = true;
    allQ = savedState.allQ;
    answered = savedState.answered || {};
    totalCorrect = Object.values(answered).filter((v) => v === true).length;
    totalAnswered = Object.keys(answered).length;
    renderQuiz();
    updateLive();
  } else if (
    getCurrentUser() &&
    window.quizMeta?.[key]?.allQ?.length === 100 &&
    !window.quizMeta[key].submitted
  ) {
    _isRestoringFromRefresh = true;
    const remote = window.quizMeta[key];
    allQ = remote.allQ;
    answered = remote.answered || {};
    totalCorrect = Object.values(answered).filter((v) => v === true).length;
    totalAnswered = Object.keys(answered).length;
    const ls = lsGetScoped("hsk_quiz_state", {});
    ls[key] = { allQ, answered, submitted: false };
    lsSetScoped("hsk_quiz_state", ls);
    renderQuiz();
    updateLive();
  } else if (savedState && savedState.submitted) {
    _isRestoringFromRefresh = true;
    allQ = savedState.allQ;
    answered = savedState.answered || {};
    totalCorrect = Object.values(answered).filter((v) => v === true).length;
    totalAnswered = Object.keys(answered).length;
    renderQuiz();
    updateLive();
    submitQuiz(true);
  } else {
    buildQuiz();
    renderQuiz();
    updateLive();
  }

  if (_isRestoringFromRefresh) lsRemoveScoped("hsk_active_quiz");
}

/* ── Filter Quiz Tab ── */
export function filterQuizTab(tab, doScroll) {
  activeQuizTab = tab;
  ["all", 0, 1, 2, 3].forEach((t) => {
    const el = document.getElementById("qtab-" + t);
    if (el) el.classList.toggle("active", t === tab);
  });
  const sections = document.querySelectorAll("#quiz-main .section");
  const labels = ["1", "2", "3", "4"];
  sections.forEach((sec, idx) => {
    const visible = tab === "all" || tab === idx;
    sec.style.display = visible ? "" : "none";
    if (visible) {
      const secNum = sec.querySelector(".sec-num");
      const secCnt = sec.querySelector(".sec-cnt");
      if (secNum) secNum.textContent = labels[idx];
      if (secCnt)
        secCnt.textContent =
          tab === "all" ? `${idx * 25 + 1}–${idx * 25 + 25}` : `1–25`;
      sec.querySelectorAll(".q-card").forEach((card, ci) => {
        const qNum = card.querySelector(".q-num");
        if (qNum) qNum.textContent = tab === "all" ? idx * 25 + ci + 1 : ci + 1;
      });
    }
  });
  if (doScroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── Build Quiz ── */
export function buildQuiz() {
  allQ = [];
  let gi = 0;
  const secs = [
    {
      label: "1",
      title: "Hanzi → Arti Indonesia",
      sub: "Hanzi → pilih arti Indonesia",
      raw: currentQuizData.A,
    },
    {
      label: "2",
      title: "Pinyin → Arti Indonesia",
      sub: "Pinyin berwarna → pilih arti",
      raw: currentQuizData.B,
    },
    {
      label: "3",
      title: "Hanzi → Pilih Pinyin",
      sub: "Hanzi → Pilih Pinyin yang tepat",
      raw: currentQuizData.C,
    },
    {
      label: "4",
      title: "Lengkapi Kalimat Rumpang",
      sub: "Pilih kata yang tepat untuk melengkapi",
      raw: currentQuizData.D,
    },
  ];
  secs.forEach((sec, si) => {
    const shuffled = [...shuffle(sec.raw.slice(0, 20)), ...sec.raw.slice(20)];
    shuffled.forEach((q) => {
      const idx = [0, 1, 2, 3].slice(0, q.opts.length);
      const si2 = shuffle(idx);
      allQ.push({
        si,
        label: sec.label,
        title: sec.title,
        sub: sec.sub,
        q: q.q,
        opts: si2.map((i) => q.opts[i]),
        ans: si2.indexOf(q.ans),
        gi: gi++,
      });
    });
  });
  answered = {};
  totalCorrect = 0;
  totalAnswered = 0;
  activeQuizTab = "all";
}

/* ── Render Quiz ── */
export function renderQuiz() {
  const main = document.getElementById("quiz-main");
  if (!main) return;

  const frag = document.createDocumentFragment();

  ["1", "2", "3", "4"].forEach((lbl, si) => {
    const sq = allQ.filter((q) => q.si === si);
    if (!sq.length) return;

    const secDiv = document.createElement("div");
    secDiv.className = "section";
    const start = si * 25 + 1,
      end = si * 25 + 25;
    secDiv.innerHTML = `<div class="sec-hd"><div class="sec-num">${lbl}</div><div><div class="sec-title-txt">${sq[0].title}</div><div class="sec-sub-txt">${sq[0].sub}</div></div><div class="sec-cnt">Soal ${start}–${end}</div></div>`;

    sq.forEach((q, li) => {
      const card = document.createElement("div");
      card.className = "q-card";
      card.id = `card-${q.gi}`;
      card.style.cursor = "pointer";
      card.onclick = () => window.playQuizTTS(q.gi);

      const opts = q.opts
        .map((o, i) => {
          const labs = ["A", "B", "C", "D"];
          const optLabel = (() => {
            if (q.si === 3) {
              const blanks = (q.q.match(/_{2,}/g) || []).length;
              if (blanks >= 2) return o.split(" ").join("，");
              return o;
            }
            return q.si === 2 ? colorPy(o) : o;
          })();
          const optClass = q.si === 3 ? "opt opt-hz" : "opt";
          return `<button class="${optClass}" id="opt-${q.gi}-${i}" onclick="event.stopPropagation(); window.selectAns(${q.gi},${i},${q.ans})" data-c="${i === q.ans}"><span class="opt-lbl">${labs[i]}</span><span>${optLabel}</span></button>`;
        })
        .join("");

      card.innerHTML = `<div class="q-top"><span class="q-num">${si * 25 + li + 1}</span>${renderQText(q)}</div><div class="options">${opts}</div><div class="fb" id="fb-${q.gi}"></div>`;
      secDiv.appendChild(card);
    });

    frag.appendChild(secDiv);
  });

  main.innerHTML = "";
  main.appendChild(frag);

  Object.keys(answered).forEach((gi) => {
    gi = parseInt(gi);
    const q = allQ[gi];
    if (!q) return;
    const card = document.getElementById("card-" + gi);
    if (!card) return;
    card.classList.add(answered[gi] ? "answered-correct" : "answered-wrong");
    for (let i = 0; i < q.opts.length; i++) {
      const b = document.getElementById(`opt-${gi}-${i}`);
      if (b) {
        b.disabled = true;
        if (i === q.ans)
          b.classList.add(answered[gi] ? "correct" : "show-correct");
        else if (i === q.selectedIdx && !answered[gi]) b.classList.add("wrong");
      }
    }
    const fb = document.getElementById("fb-" + gi);
    if (fb) {
      fb.className = "fb " + (answered[gi] ? "correct" : "wrong");
      fb.textContent = answered[gi]
        ? "✓ Benar!"
        : `✗ Salah. Jawaban: ${["A", "B", "C", "D"][q.ans]}`;
    }
  });

  filterQuizTab(activeQuizTab);
}

/* ── Select Answer ── */
export function selectAns(gi, sel, cor) {
  if (answered[gi] !== undefined) return;
  answered[gi] = sel === cor;
  allQ[gi].selectedIdx = sel;
  if (answered[gi]) totalCorrect++;
  totalAnswered++;

  for (let i = 0; i < allQ[gi].opts.length; i++) {
    const b = document.getElementById(`opt-${gi}-${i}`);
    if (b) b.disabled = true;
  }
  const sb = document.getElementById(`opt-${gi}-${sel}`);
  if (sb) sb.classList.add(answered[gi] ? "correct" : "wrong");
  if (!answered[gi]) {
    const cb = document.getElementById(`opt-${gi}-${cor}`);
    if (cb) cb.classList.add("show-correct");
  }
  const card = document.getElementById(`card-${gi}`);
  if (card)
    card.classList.add(answered[gi] ? "answered-correct" : "answered-wrong");
  const fb = document.getElementById(`fb-${gi}`);
  if (fb) {
    fb.className = "fb " + (answered[gi] ? "correct" : "wrong");
    fb.textContent = answered[gi]
      ? "✓ Benar!"
      : `✗ Salah. Jawaban: ${["A", "B", "C", "D"][cor]}`;
  }

  // Simpan state ke localStorage setiap kali jawab
  if (currentQuizKey) {
    const saved = lsGetScoped("hsk_quiz_state", {});
    saved[currentQuizKey] = { allQ, answered, submitted: false };
    lsSetScoped("hsk_quiz_state", saved);
    if (!_isRestoringFromRefresh)
      lsSetScoped("hsk_active_quiz", currentQuizKey);
  }

  // TTS
  const q = allQ[gi];
  if (q.si !== 1) playQuizTTS(gi);

  updateLive();
}

export function playQuizTTS(gi) {
  // Hanya bunyi jika soal sudah terjawab
  if (answered[gi] === undefined) return;

  const q = allQ[gi];
  if (!q) return;

  // Jangan bunyikan TTS untuk tipe Pinyin -> Arti (1) 
  // karena soalnya sudah berupa Pinyin.
  if (q.si === 1) return;

  let speechText = q.q;
  speechText = speechText.replace(/<\/?[^>]+(>|$)/g, ""); // Strip HTML
  speechText = speechText.replace(/\([^)]+\)/g, ""); // Remove translations in ()

  if (q.si === 3) {
    // Untuk soal rumpang, gunakan jawaban benar jika sudah terjawab
    const corAns = q.opts[q.ans];
    speechText = speechText.replace(/_{2,}/g, corAns);
  }

  speakMandarin(speechText);
}

/* ── Update Live Score ── */
export function updateLive() {
  const liveEl = document.getElementById("live-score");
  const ansEl = document.getElementById("ans-count");
  const stickyEl = document.getElementById("sticky-txt");
  const progEl = document.getElementById("prog");
  if (liveEl) liveEl.textContent = totalCorrect;
  if (ansEl) ansEl.textContent = totalAnswered;
  if (stickyEl) stickyEl.textContent = `${totalAnswered} / 100 dijawab`;
  if (progEl) progEl.style.width = (totalAnswered / 100) * 100 + "%";
}

/* ── Submit Quiz ── */
export function submitQuiz(silent = false) {
  const skip = 100 - totalAnswered;
  const warn = document.getElementById("warn-box");
  if (skip > 0) {
    if (warn) {
      warn.textContent = `⚠️ ${skip} soal belum dijawab — dihitung salah.`;
      warn.classList.add("show");
    }
  } else if (warn) {
    warn.classList.remove("show");
  }

  const pct = Math.round((totalCorrect / 100) * 100);
  const rs = document.getElementById("r-score");
  if (rs) {
    rs.textContent = `${totalCorrect} / 100`;
    rs.style.color =
      pct >= 80 ? "#4ade80" : pct >= 60 ? "var(--gold)" : "#f87171";
  }

  const correctEl = document.getElementById("r-correct");
  const wrongEl = document.getElementById("r-wrong");
  const skipEl = document.getElementById("r-skip");
  const pctEl = document.getElementById("r-pct");
  if (correctEl) correctEl.textContent = totalCorrect;
  if (wrongEl) wrongEl.textContent = 100 - totalCorrect - skip;
  if (skipEl) skipEl.textContent = skip;
  if (pctEl) pctEl.textContent = pct + "%";

  let grade, msg;
  if (pct >= 90) {
    grade = `⭐ Luar Biasa! ${currentQuizData.title.split("—")[0].trim()} dikuasai!`;
    msg = "Penguasaan hari ini sangat baik. Gas lanjut!";
  } else if (pct >= 80) {
    grade = "✅ Bagus! Fondasi kuat.";
    msg = "Hampir sempurna! Review soal yang salah, lalu lanjut.";
  } else if (pct >= 70) {
    grade = "📘 Cukup Baik — Perlu Sedikit Review";
    msg = "Sudah cukup! Review Pleco dulu lalu coba lagi. Target 80%+.";
  } else if (pct >= 60) {
    grade = "⚠️ Perlu Review Lebih Banyak";
    msg = "Review modul dan Pleco 15 menit dulu. Coba lagi!";
  } else {
    grade = "🔄 Review Dulu Sebelum Lanjut";
    msg =
      "Kembali ke modul, review Pleco, lalu coba lagi. Pelan-pelan pasti bisa!";
  }

  const gradeEl = document.getElementById("r-grade");
  const msgEl = document.getElementById("r-msg");
  if (gradeEl) gradeEl.textContent = grade;
  if (msgEl) msgEl.textContent = msg;

  const panel = document.getElementById("result-panel");
  const progEl = document.getElementById("prog");
  if (panel) panel.classList.add("show");
  if (progEl) progEl.style.width = "100%";

  if (!silent && panel)
    panel.scrollIntoView({ behavior: "smooth", block: "center" });

  if (currentQuizKey && !silent) {
    if (typeof window.saveScore === "function")
      window.saveScore(currentQuizKey, totalCorrect, { allQ, answered });
    const savedSt = lsGetScoped("hsk_quiz_state", {});
    if (savedSt[currentQuizKey]) {
      savedSt[currentQuizKey].submitted = true;
      lsSetScoped("hsk_quiz_state", savedSt);
    }
    if (!getCurrentUser()) {
      const xp = calcXPFromPct(pct);
      showXPToast(xp, "Quiz selesai");
    }
    if (!getCurrentUser() && typeof window.invalidateStatsCache === "function")
      window.invalidateStatsCache();
  }

  if (currentQuizKey) lsRemoveScoped("hsk_active_quiz");

  const badge = document.getElementById("qs-" + currentQuizKey);
  if (badge) {
    badge.textContent = totalCorrect + "/100";
    badge.className = "status " + (totalCorrect >= 80 ? "done" : "new");
  }
}

/* ── Confirm Retry ── */
export function confirmRetryQuiz() {
  const descEl = document.getElementById("retry-confirm-desc");
  const btnEl = document.getElementById("retry-confirm-btn");
  const modalEl = document.getElementById("retry-confirm-modal");
  if (descEl)
    descEl.textContent =
      "Soal akan diacak ulang dan skor quiz ini akan direset.";
  if (btnEl) {
    btnEl.onclick = () => {
      if (typeof window.closeRetryConfirm === "function")
        window.closeRetryConfirm();
      retryQuiz();
    };
  }
  if (modalEl) modalEl.classList.add("active");
}

export function closeRetryConfirm() {
  const modalEl = document.getElementById("retry-confirm-modal");
  if (modalEl) modalEl.classList.remove("active");
}

/* ── Retry Quiz ── */
export function retryQuiz() {
  const panel = document.getElementById("result-panel");
  const warn = document.getElementById("warn-box");
  if (panel) panel.classList.remove("show");
  if (warn) warn.classList.remove("show");

  if (currentQuizKey) {
    if (typeof window.quizScores !== "undefined")
      delete window.quizScores[currentQuizKey];
    if (typeof window.deleteScore === "function")
      window.deleteScore("quiz", currentQuizKey);
    const savedState = lsGetScoped("hsk_quiz_state", {});
    delete savedState[currentQuizKey];
    lsSetScoped("hsk_quiz_state", savedState);
    const badge = document.getElementById("qs-" + currentQuizKey);
    if (badge) {
      badge.textContent = "Belum";
      badge.className = "status new";
    }
    if (typeof window.updateDailyProgress === "function")
      window.updateDailyProgress();
    if (typeof window.renderActList === "function") window.renderActList();
  }
  buildQuiz();
  renderQuiz();
  updateLive();
  lsRemoveScoped("hsk_active_quiz");
  window.scrollTo(0, 0);
}

/* ── Close Quiz ── */
export function closeQuiz() {
  destroyQuiz();
  if (typeof window.backToLayer === "function")
    window.backToLayer("layer-quiz");
}

/**
 * CLEANUP LOGIC: destroyQuiz
 */
export function destroyQuiz() {
  lsRemoveScoped("hsk_active_quiz");
  _isRestoringFromRefresh = false;
  currentQuizData = null;
  currentQuizKey = null;
  allQ = [];
  answered = {};
  totalCorrect = 0;
  totalAnswered = 0;
  // Hentikan suara jika masih ada yang bicara
  if (typeof window.cancelTTS === "function") window.cancelTTS();
}
window.destroyQuiz = destroyQuiz;

let _quizSetsCache = null;
let _quizListFetchPromise = null;

export function _ensureQuizSetsCache() {
  // Kalau cache sudah ada, return resolved promise agar caller bisa await dengan aman
  if (_quizSetsCache) return Promise.resolve();
  // Kalau fetch sedang berjalan, kembalikan promise yang sama
  if (_quizListFetchPromise) return _quizListFetchPromise;

  _quizListFetchPromise = supa
    .from("quiz_sets")
    .select("id, key, title, sub, badge, hsk_level")
    .order("sort_order", { ascending: true })
    .then(({ data, error }) => {
      _quizListFetchPromise = null;
      if (!error && data) _quizSetsCache = data;
    })
    .catch(() => {
      _quizListFetchPromise = null;
    });
  return _quizListFetchPromise;
}

_ensureQuizSetsCache();

function _quizLockedToast(el) {
  const title = el.closest("[data-prev-title]")?.dataset.prevTitle || "";
  if (title) {
    showToast(`Selesaikan “${title}” dulu!`, "warn");
  } else {
    showToast(`Selesaikan kuis sebelumnya dulu!`, "warn");
  }
}

function _renderQuizGrid() {
  const grid = document.getElementById("quiz-list-grid");
  if (!grid || !_quizSetsCache) return;
  grid.innerHTML = _quizSetsCache
    .map((s, i) => {
      const hsk = `hsk${s.hsk_level}`;
      const scoreVal = window.quizScores?.[s.key];
      const prevKey = i > 0 ? _quizSetsCache[i - 1].key : null;

      // MENGGUNAKAN resolveQuizLock
      const { isLocked, reason } = resolveQuizLock({
        hskLevel: s.hsk_level,
        deckIndex: i,
        prevScore: window.quizScores?.[prevKey],
        tableName: "quiz_sets",
      });

      const lockedOnclick =
        reason === "tier"
          ? `window.showToast('${lockMessage("tier")}', 'warn')`
          : `window._quizLockedToast(this)`;

      const statusTxt = scoreVal !== undefined ? `${scoreVal}/100` : "Belum";
      const statusCls =
        scoreVal !== undefined ? (scoreVal >= 80 ? "done" : "new") : "new";
      const prevTitle = i > 0 ? _quizSetsCache[i - 1].title : "";
      const safePrevTitle = prevTitle.replace(/"/g, "&quot;");

      return `<div class="item-card${isLocked ? " locked" : ""}" data-hsk="${hsk}" data-prev-title="${safePrevTitle}" onclick="${isLocked ? lockedOnclick : `window.startQuiz('${s.key}')`}">
      <div class="item-card-top"><span class="day-badge">${s.badge}</span><span class="status ${statusCls}" id="qs-${s.key}">${statusTxt}</span></div>
      <div class="item-title">${s.title}</div><div class="item-desc">${s.sub}</div>
      <div class="item-meta"><span class="item-date">100 soal · 4 bagian</span><button class="btn-open" onclick="event.stopPropagation();${isLocked ? lockedOnclick : `window.startQuiz('${s.key}')`}">${isLocked ? "🔒" : "Mulai"}</button></div>
    </div>`;
    })
    .join("");

  const activePill = document.querySelector(
    "#hsk-filter-quiz .hsk-pill.active",
  );
  if (activePill && typeof window.filterHSK === "function") {
    const level = activePill.textContent
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    window.filterHSK("quiz", level === "semua" ? "all" : level, activePill);
  }
}

/* ── Render Quiz List (layer) ── */
export async function renderQuizList() {
  const grid = document.getElementById("quiz-list-grid");
  if (!grid) return;

  const myId = ++_renderQuizListId;

  await withTimeout(loadUnlockedTiers(), 2500);
  await withTimeout(loadTierStartDecks("quiz_sets"), 2500);

  if (!_quizSetsCache) {
    grid.innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--dim);font-size:13px;"><span class="spinner"></span>Memuat...</div>';
    try {
      await _ensureQuizSetsCache();
    } catch {
      /* handled inside _ensureQuizSetsCache */
    }
    if (!_quizSetsCache) {
      grid.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--dim);">Gagal memuat — cek koneksi</div>';
      return;
    }
  }

  // Tunggu scores dulu sebelum render, supaya lock status akurat
  if (getCurrentUser()) {
    const scoresPromise = window.scoresLoaded;
    if (
      scoresPromise &&
      typeof scoresPromise.then === "function" &&
      !window._scoresHaveLoaded
    ) {
      await Promise.race([
        scoresPromise,
        new Promise((r) => setTimeout(r, 8000)),
      ]);
    }
  }

  if (myId !== _renderQuizListId) return;

  _renderQuizGrid();

  if (typeof window._prefetchNextQuiz === "function")
    window._prefetchNextQuiz();
}

/* ── Expose ke window untuk dipanggil dari HTML ── */
window.isQuizActive = function () {
  return document.getElementById("quiz-screen")?.style.display !== "none";
};
window.loadQuizFromDB = loadQuizFromDB;
window.startQuiz = startQuiz;
window.filterQuizTab = filterQuizTab;
window.buildQuiz = buildQuiz;
window.renderQuiz = renderQuiz;
window.selectAns = selectAns;
window.updateLive = updateLive;
window.submitQuiz = submitQuiz;
window.confirmRetryQuiz = confirmRetryQuiz;
window.closeRetryConfirm = closeRetryConfirm;
window.retryQuiz = retryQuiz;
window.closeQuiz = closeQuiz;
window.renderQuizList = renderQuizList;
window.playQuizTTS = playQuizTTS;
window._quizLockedToast = _quizLockedToast;
window._ensureQuizSetsCache = _ensureQuizSetsCache;
