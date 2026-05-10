/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   CERITA.JS — Baca Cerita (Reading Mode)
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showScreen, backToLayer } from "../core/navigation.js";
import { speakMandarin, cancelTTS } from "../utilities/tts.js";
import { showToast, showXPToast } from "../utilities/helpers.js";
import { showDoneScreen } from "../core/done-screen.js";
import { calcXPCeritaQuiz } from "../utilities/xp.js";
import { XP } from "../utilities/xp.js";
import { showPettool, hidePettool } from "../utilities/tooltip.js";

let currentCeritaKey = null;
let currentCeritaData = null;
let _ceritaCache = {};
let _ceritaSetsCache = null;

/* ── Comprehension Quiz State ── */
let _cqItems = [];
let _cqIdx = 0;
let _cqCorrect = 0;
let _cqAnswered = false;
let _cqLoading = false;

let _ceritaScrolling = false;
let _ceritaScrollIv = null;
let _ceritaSpeed = 1;
let _ceritaFontSize = 22;
let _ceritaResetting = false;

function _escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ── cerita_scores helper ── */
export const ceritaScores = {};

/* ── Guard: hentikan semua aktivitas cerita ── */
export function _ceritaStopAll() {
  if (_ceritaScrollIv) {
    cancelAnimationFrame(_ceritaScrollIv);
    _ceritaScrollIv = null;
  }
  _ceritaScrolling = false;
  cancelTTS();
}

/* ── Pasang listener global ── */
document.addEventListener("visibilitychange", () => {
  if (document.hidden && currentCeritaKey) {
    _ceritaStopAll();
  }
});

window.addEventListener("pagehide", () => {
  _ceritaStopAll();
});

async function _ceritaUpsertScore(key, pct) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  ceritaScores[key] = pct;
  if (typeof window._recordDailyStreak === "function")
    window._recordDailyStreak();
  const { error } = await supa.from("user_scores").upsert(
    {
      user_id: currentUser.id,
      type: "cerita",
      key,
      score: pct,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,type,key" },
  );
  if (error) throw error;
  // FIX: invalidate hanya saat selesai (pct >= 95) — progress scroll biasa tidak perlu invalidate tiap 5%
  if (pct >= 95 && typeof window.invalidateStatsCache === "function")
    window.invalidateStatsCache();
}

async function _ceritaDeleteScore(key) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  delete ceritaScores[key];
  const { error } = await supa
    .from("user_scores")
    .delete()
    .eq("user_id", currentUser.id)
    .eq("type", "cerita")
    .eq("key", key);
  if (error) throw error;
}

/* ── Load Cerita dari Supabase ── */
async function loadCeritaFromDB(key) {
  if (_ceritaCache[key]) return _ceritaCache[key];

  const [metaRes, parasRes, vocabRes] = await Promise.all([
    supa.from("cerita_sets").select("*").eq("key", key).single(),
    supa
      .from("cerita_paragraphs")
      .select("para_index, hanzi_text")
      .eq("cerita_key", key)
      .order("para_index", { ascending: true }),
    supa
      .from("cerita_vocab")
      .select("hanzi, pinyin, arti")
      .eq("cerita_key", key)
      .order("sort_order", { ascending: true }),
  ]);

  if (metaRes.error)
    throw new Error("Gagal load cerita meta: " + metaRes.error.message);
  if (parasRes.error)
    throw new Error("Gagal load paragraf: " + parasRes.error.message);

  const vocab = {};
  (vocabRes.data || []).forEach((v) => {
    vocab[v.hanzi] = { pinyin: v.pinyin, arti: v.arti };
  });

  const result = {
    title: metaRes.data.title,
    title_zh: metaRes.data.title_zh || "",
    badge: metaRes.data.badge || "HSK 1",
    paragraphs: (parasRes.data || []).map((p) => p.hanzi_text),
    vocab,
  };
  _ceritaCache[key] = result;
  return result;
}

/* ── Mulai Baca Cerita ── */
export async function startCerita(key) {
  _ceritaStopAll();
  currentCeritaKey = key;

  if (typeof window.closeLayer === "function")
    window.closeLayer("layer-cerita", true);
  showScreen("cerita-screen");

  _ceritaSpeed = 1;
  _ceritaFontSize = 22;
  let _ceritaLastSavedPct = -1;

  const titleEl = document.getElementById("cerita-title");
  const bodyEl = document.getElementById("cerita-body");
  if (titleEl) titleEl.textContent = "Memuat...";
  if (bodyEl)
    bodyEl.innerHTML =
      '<div style="text-align:center;padding:60px 0;color:var(--dim);font-size:13px;"><span class="spinner"></span>Memuat cerita...</div>';

  const progFill = document.getElementById("cerita-progress-fill");
  const badge = document.getElementById("cerita-prog-badge");
  const label = document.getElementById("cerita-progress-label");
  if (progFill) progFill.style.width = "0%";
  if (badge) badge.classList.remove("done");
  if (label) label.textContent = "0%";

  const fontLabel = document.getElementById("cerita-font-label");
  const speedVal = document.getElementById("cerita-speed-val");
  const playIcon = document.getElementById("cerita-play-icon");
  const playLabel = document.getElementById("cerita-play-label");
  if (fontLabel) fontLabel.textContent = "22px";
  if (speedVal) speedVal.textContent = "1×";
  if (playIcon) playIcon.textContent = "▶";
  if (playLabel) playLabel.textContent = "Auto-scroll";

  window.scrollTo(0, 0);

  try {
    currentCeritaData = await loadCeritaFromDB(key);
  } catch (err) {
    if (bodyEl)
      bodyEl.innerHTML = `<div style="text-align:center;padding:60px;color:var(--dim);">⚠️ ${_escapeHtml(err.message)}</div>`;
    return;
  }

  if (titleEl) titleEl.textContent = currentCeritaData.title;
  const titleZh = document.getElementById("cerita-title-zh");
  if (titleZh) {
    if (currentCeritaData.title_zh) {
      titleZh.textContent = currentCeritaData.title_zh;
      titleZh.style.display = "";
    } else {
      titleZh.style.display = "none";
    }
  }

  renderCeritaBody();

  const sc = document.getElementById("cerita-scroll-container");
  if (sc) {
    sc.style.overflowAnchor = "none";
    sc.scrollTop = 0;
    requestAnimationFrame(() => {
      if (sc) sc.style.overflowAnchor = "";
    });
  }

  _restoreCeritaProgress(key);
}

/* ── Render Body Teks ── */
export function renderCeritaBody() {
  const vocab = currentCeritaData.vocab;
  const body = document.getElementById("cerita-body");
  const vocabWords = Object.keys(vocab).sort((a, b) => b.length - a.length);

  const oldPanel = document.getElementById("cerita-cq-panel");
  if (oldPanel) oldPanel.style.display = "none";

  if (!body) return;

  body.innerHTML = currentCeritaData.paragraphs
    .map(
      (para, pi) =>
        `<p class="cerita-para" style="font-size:${_ceritaFontSize}px;" id="cerita-para-${pi}">${markVocab(para, vocabWords, vocab)}<button class="cerita-speak-btn" data-para="${pi}" title="Dengar paragraf ini">🔊</button></p>`,
    )
    .join("");

  const quizBtnHtml = `
    <div class="cerita-quiz-trigger" id="cerita-quiz-trigger">
      <div class="cerita-quiz-divider"></div>
      <button class="cerita-quiz-btn" id="cerita-quiz-btn">
        <span class="cerita-quiz-btn-icon">📝</span>
        <span>Uji Pemahaman</span>
        <span class="cerita-quiz-btn-sub">3 soal tentang cerita ini</span>
      </button>
    </div>
    <div class="cerita-cq-panel" id="cerita-cq-panel" style="display:none;"></div>`;
  body.insertAdjacentHTML("beforeend", quizBtnHtml);
  const quizBtn = document.getElementById("cerita-quiz-btn");
  if (quizBtn) {
    quizBtn.addEventListener("click", () => window.startCeritaQuiz());
  }

  body.querySelectorAll(".cerita-speak-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!currentCeritaKey) return;
      const pi = parseInt(btn.dataset.para);
      const rawText = currentCeritaData.paragraphs[pi];
      if (rawText) speakMandarin(rawText);
    });
  });

  body.querySelectorAll(".cerita-hl").forEach((el) => {
    const word = el.dataset.word || el.textContent.trim();
    const v = vocab[word] || { pinyin: "", arti: "" };

    // Gunakan utility long press global
    if (typeof window._attachLongPressTTS === 'function') {
      window._attachLongPressTTS(el, null, 
        () => { // Tap -> TTS
          speakMandarin(word);
        },
        () => { // Hold -> Pettool
          showPettool(el, { hanzi: word, pinyin: v.pinyin, arti: v.arti }, () => {
             // Go to detail (requires searchAndOpenWord to be global)
             if (window.searchAndOpenWord) window.searchAndOpenWord(word);
          });
        }
      );
    } else {
        // Fallback jika global utility belum siap
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          speakMandarin(word);
        });
    }
  });

  document.removeEventListener("click", closeCeritaPopups);
  document.addEventListener("click", closeCeritaPopups);
}

export function closeCeritaPopups() {
  document
    .querySelectorAll(".cerita-popup")
    .forEach((p) => (p.style.display = "none"));
}

function markVocab(text, vocabWords, vocab) {
  let result = _escapeHtml(text);
  let pidx = 0;
  const placeholders = {};

  vocabWords.forEach((word) => {
    const v = vocab[word];
    const escapedWord = _escapeHtml(word);
    const pid = `__HL${pidx++}__`;
    const tag = `<span class="cerita-hl" data-word="${escapedWord}">${escapedWord}</span>`;
    result = result.split(escapedWord).join(pid);
    placeholders[pid] = tag;
  });

  Object.entries(placeholders).forEach(([pid, tag]) => {
    result = result.split(pid).join(tag);
  });

  return result;
}

/* ── Auto Scroll ── */
export function toggleCeritaScroll() {
  _ceritaScrolling = !_ceritaScrolling;
  const playIcon = document.getElementById("cerita-play-icon");
  const playLabel = document.getElementById("cerita-play-label");
  const sc = document.getElementById("cerita-scroll-container");

  if (_ceritaScrolling) {
    if (playIcon) playIcon.textContent = "⏸";
    if (playLabel) playLabel.textContent = "Pause";

    let lastTs = null;
    let scrollAccum = 0;
    const _rafSessionKey = currentCeritaKey;

    function _ceritaRAF(ts) {
      if (!_ceritaScrolling || currentCeritaKey !== _rafSessionKey) return;
      if (lastTs !== null) {
        const delta = ts - lastTs;
        scrollAccum += (_ceritaSpeed / 30) * delta;
        const step = Math.floor(scrollAccum);
        if (step >= 1 && sc) {
          sc.scrollTop += step;
          scrollAccum -= step;
          updateCeritaProgress();
        }
        if (sc && sc.scrollTop >= sc.scrollHeight - sc.clientHeight) {
          _ceritaScrolling = false;
          _ceritaScrollIv = null;
          scrollAccum = 0;
          if (playIcon) playIcon.textContent = "▶";
          if (playLabel) playLabel.textContent = "Auto-scroll";
          return;
        }
      }
      lastTs = ts;
      _ceritaScrollIv = requestAnimationFrame(_ceritaRAF);
    }
    _ceritaScrollIv = requestAnimationFrame(_ceritaRAF);
  } else {
    if (_ceritaScrollIv) {
      cancelAnimationFrame(_ceritaScrollIv);
      _ceritaScrollIv = null;
    }
    if (playIcon) playIcon.textContent = "▶";
    if (playLabel) playLabel.textContent = "Auto-scroll";
  }
}

export function changeCeritaSpeed(delta) {
  _ceritaSpeed = Math.min(
    4,
    Math.max(0.5, Math.round((_ceritaSpeed + delta) * 10) / 10),
  );
  const speedVal = document.getElementById("cerita-speed-val");
  if (speedVal) speedVal.textContent = _ceritaSpeed + "×";
}

export function changeCeritaFont(delta) {
  _ceritaFontSize = Math.min(40, Math.max(16, _ceritaFontSize + delta));
  const fontLabel = document.getElementById("cerita-font-label");
  if (fontLabel) fontLabel.textContent = _ceritaFontSize + "px";
  document.querySelectorAll(".cerita-para").forEach((p) => {
    p.style.fontSize = _ceritaFontSize + "px";
  });
}

let _ceritaLastSavedPct = -1;

export function updateCeritaProgress() {
  const sc = document.getElementById("cerita-scroll-container");
  if (!sc) return;
  const max = sc.scrollHeight - sc.clientHeight;
  if (max <= 0) return;
  const pct = Math.round((sc.scrollTop / max) * 100);

  const progFill = document.getElementById("cerita-progress-fill");
  const badge = document.getElementById("cerita-prog-badge");
  const label = document.getElementById("cerita-progress-label");
  if (progFill) progFill.style.width = pct + "%";

  if (pct >= 95) {
    if (label) label.textContent = "Reset";
    if (badge) badge.classList.add("done");
    if (_ceritaLastSavedPct < 95 && !_ceritaResetting) {
      _ceritaLastSavedPct = 100;
      showXPToast(XP.CERITA_SELESAI, "Cerita selesai");
      _ceritaUpsertScore(currentCeritaKey, 100).catch(console.error);
    }
  } else {
    if (label) label.textContent = pct + "%";
    if (badge) badge.classList.remove("done");
    if (pct - _ceritaLastSavedPct >= 5) {
      _ceritaLastSavedPct = pct;
      _ceritaUpsertScore(currentCeritaKey, pct).catch(console.error);
    }
  }
}

function _restoreCeritaProgress(key) {
  const pct = ceritaScores[key];
  if (!pct || pct <= 0 || pct >= 100) return;
  const sc = document.getElementById("cerita-scroll-container");
  if (!sc) return;
  setTimeout(() => {
    if (currentCeritaKey !== key) return;
    const max = sc.scrollHeight - sc.clientHeight;
    if (max <= 0) return;
    sc.scrollTop = (max * pct) / 100;
    const realPct = Math.round((sc.scrollTop / max) * 100);
    const progFill = document.getElementById("cerita-progress-fill");
    const badge = document.getElementById("cerita-prog-badge");
    const label = document.getElementById("cerita-progress-label");
    if (progFill) progFill.style.width = realPct + "%";
    if (realPct >= 95) {
      if (label) label.textContent = "Reset";
      if (badge) badge.classList.add("done");
    } else {
      if (label) label.textContent = realPct + "%";
      if (badge) badge.classList.remove("done");
    }
    _ceritaLastSavedPct = realPct;
  }, 120);
}

export function confirmCeritaReset() {
  const titleEl = document.getElementById("retry-confirm-title");
  const descEl = document.getElementById("retry-confirm-desc");
  const warningEl = document.getElementById("retry-confirm-warning");
  const btnEl = document.getElementById("retry-confirm-btn");
  const modalEl = document.getElementById("retry-confirm-modal");

  if (titleEl) titleEl.textContent = "Reset Progress Cerita?";
  if (descEl)
    descEl.textContent = "Progress membaca cerita ini akan direset ke awal.";
  if (warningEl)
    warningEl.textContent =
      "⚠️ Progress akan dihapus dan cerita mulai dari awal.";
  if (btnEl) {
    btnEl.onclick = () => {
      if (typeof window.closeRetryConfirm === "function")
        window.closeRetryConfirm();
      _doCeritaReset();
    };
  }
  if (modalEl) modalEl.classList.add("active");
}

function _doCeritaReset() {
  if (!currentCeritaKey) return;
  _ceritaResetting = true;

  if (_ceritaScrollIv) {
    cancelAnimationFrame(_ceritaScrollIv);
    _ceritaScrollIv = null;
    _ceritaScrolling = false;
    const playIcon = document.getElementById("cerita-play-icon");
    const playLabel = document.getElementById("cerita-play-label");
    if (playIcon) playIcon.textContent = "▶";
    if (playLabel) playLabel.textContent = "Auto-scroll";
  }

  delete ceritaScores[currentCeritaKey];

  const badge = document.getElementById("cerita-prog-badge");
  const label = document.getElementById("cerita-progress-label");
  const progFill = document.getElementById("cerita-progress-fill");
  if (badge) badge.classList.remove("done");
  if (label) label.textContent = "0%";
  if (progFill) progFill.style.width = "0%";
  _ceritaLastSavedPct = 100;

  const sc = document.getElementById("cerita-scroll-container");
  if (sc) sc.scrollTop = 0;
  _ceritaLastSavedPct = -1;

  if (typeof window.updateCeritaDashboard === "function")
    window.updateCeritaDashboard();
  if (_ceritaSetsCache && typeof window.renderCeritaList === "function")
    window.renderCeritaList();

  const currentUser = getCurrentUser();
  if (currentUser) {
    supa
      .from("user_scores")
      .delete()
      .eq("user_id", currentUser.id)
      .eq("type", "cerita")
      .eq("key", currentCeritaKey)
      .then(({ error }) => {
        if (error) console.warn("_doCeritaReset/delete:", error);
      });
  }

  setTimeout(() => {
    _ceritaResetting = false;
  }, 500);
}

/* ── Comprehension Quiz ── */
export async function startCeritaQuiz() {
  if (_cqLoading) return;

  const panel = document.getElementById("cerita-cq-panel");
  if (!panel) return;

  _cqItems = [];
  _cqIdx = 0;
  _cqCorrect = 0;
  _cqAnswered = false;

  panel.style.display = "block";
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
  _cqRenderLoading();

  _cqLoading = true;
  try {
    _cqItems = await _cqGenerate();
  } catch (e) {
    console.warn("_cqGenerate error:", e);
    _cqItems = [];
  }
  _cqLoading = false;

  if (!_cqItems.length) {
    panel.innerHTML = `<div class="cq-error">Soal belum tersedia untuk cerita ini.</div>`;
    return;
  }

  _cqRenderQuestion();
}

async function _cqGenerate() {
  const { data, error } = await supa
    .from("cerita_sets")
    .select("quiz_questions")
    .eq("key", currentCeritaKey)
    .single();
  if (error || !data?.quiz_questions?.length) return [];
  return [...data.quiz_questions].sort(() => Math.random() - 0.5).slice(0, 3);
}

function _cqRenderLoading() {
  const panel = document.getElementById("cerita-cq-panel");
  if (!panel) return;
  panel.innerHTML = `<div class="cq-header"><span class="cq-badge">Uji Pemahaman</span></div><div class="cq-loading"><span class="spinner"></span> Menyiapkan soal...</div>`;
}

function _cqRenderQuestion() {
  const panel = document.getElementById("cerita-cq-panel");
  if (!panel || !_cqItems.length) return;

  const q = _cqItems[_cqIdx];
  const pct = (((_cqIdx + 1) / _cqItems.length) * 100).toFixed(0);
  _cqAnswered = false;
  const qText = _escapeHtml(q.q);
  const options = (q.options || []).map((opt) => _escapeHtml(opt));

  panel.innerHTML = `
    <div class="cq-header"><span class="cq-badge">Uji Pemahaman</span><span class="cq-counter">${_cqIdx + 1} / ${_cqItems.length}</span></div>
    <div class="cq-prog"><div class="cq-prog-fill" style="width:${pct}%"></div></div>
    <div class="cq-qnum">Soal ${_cqIdx + 1}</div>
    <div class="cq-qtext">${qText}</div>
    <div class="cq-opts" id="cq-opts">
      ${options.map((opt, i) => `<button class="cq-opt" id="cq-opt-${i}" data-opt="${i}"><span class="cq-opt-lbl">${["A", "B", "C"][i]}</span><span>${opt}</span></button>`).join("")}
    </div>
    <div class="cq-feedback" id="cq-feedback"></div>
    <div class="cq-nav"><button class="cq-next-btn" id="cq-next" onclick="window._cqNext()" disabled>${_cqIdx === _cqItems.length - 1 ? "Lihat Hasil" : "Lanjut"}</button></div>`;
  panel.querySelectorAll(".cq-opt").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.opt || "-1", 10);
      if (idx >= 0) _cqAnswer(idx);
    });
  });
}

function _cqAnswer(selected) {
  if (_cqAnswered) return;
  _cqAnswered = true;

  const q = _cqItems[_cqIdx];
  const correct = selected === q.correctIndex;
  if (correct) _cqCorrect++;

  for (let i = 0; i < q.options.length; i++) {
    const btn = document.getElementById("cq-opt-" + i);
    if (!btn) continue;
    btn.disabled = true;
    if (i === q.correctIndex) btn.classList.add("cq-opt--correct");
    else if (i === selected && !correct) btn.classList.add("cq-opt--wrong");
  }

  const fb = document.getElementById("cq-feedback");
  if (fb) {
    fb.className = "cq-feedback cq-feedback--" + (correct ? "ok" : "err");
    fb.textContent =
      (correct ? "✓ Benar! " : "✗ Salah. ") + (q.explanation || "");
  }

  const next = document.getElementById("cq-next");
  if (next) next.disabled = false;
}

async function _cqSaveResult() {
  const currentUser = getCurrentUser();
  if (!currentUser || !currentCeritaKey) return;
  const pct = Math.round((_cqCorrect / _cqItems.length) * 100);
  try {
    const { error } = await supa.from("user_scores").upsert(
      {
        user_id: currentUser.id,
        type: "cerita_quiz",
        key: currentCeritaKey,
        score: pct,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,type,key" },
    );
    if (error) throw error;
    if (typeof window.invalidateStatsCache === "function")
      // FIX: invalidate cache profile
      window.invalidateStatsCache();
  } catch (e) {
    console.warn("_cqSaveResult:", e);
  }
}

function _cqNext() {
  _cqIdx++;
  if (_cqIdx >= _cqItems.length) {
    _cqShowDone();
    return;
  }
  _cqRenderQuestion();
}

function _cqShowDone() {
  const panel = document.getElementById("cerita-cq-panel");
  if (!panel) return;

  const pct = Math.round((_cqCorrect / _cqItems.length) * 100);
  const wrong = _cqItems.length - _cqCorrect;
  const emoji = pct >= 80 ? "🎉" : pct >= 60 ? "💪" : "📚";
  const title =
    pct >= 80 ? "Hebat!" : pct >= 60 ? "Lumayan!" : "Terus Berlatih!";

    panel.innerHTML = `
        <div class="cq-done">
            <div class="cq-done-emoji">${emoji}</div>
            <div class="cq-done-title">${title}</div>
            <div class="cq-done-sub">${_cqCorrect} dari ${_cqItems.length} soal benar</div>
            <div class="cq-chips">
            <div class="cq-chip cq-chip--ok"><span class="cq-chip-num">${_cqCorrect}</span><span class="cq-chip-lbl">Benar</span></div>
            <div class="cq-chip cq-chip--err"><span class="cq-chip-num">${wrong}</span><span class="cq-chip-lbl">Salah</span></div>
            <div class="cq-chip cq-chip--pct"><span class="cq-chip-num">${pct}%</span><span class="cq-chip-lbl">Skor</span></div>
            </div>
            <div class="cq-done-actions">
            <button class="cq-done-btn" onclick="window.startCeritaQuiz()">🔀 Coba Lagi</button>
            <button class="cq-done-btn" onclick="window._cqClose()">Tutup</button>
            </div>
        </div>`;

  const xp = calcXPCeritaQuiz(pct);
  showXPToast(xp, "Uji Pemahaman");
  _cqSaveResult().catch(console.warn);
}

function _cqClose() {
  const panel = document.getElementById("cerita-cq-panel");
  if (panel) panel.style.display = "none";
}

/* ── Tutup & Kembali ── */
export function closeCerita() {
  _ceritaStopAll();
  document.removeEventListener("click", closeCeritaPopups);
  currentCeritaKey = null;
  currentCeritaData = null;
  if (typeof window.backToLayer === "function")
    window.backToLayer("layer-cerita");
}

/**
 * CLEANUP LOGIC: destroyCerita
 */
export function destroyCerita() {
  _ceritaStopAll();
  currentCeritaKey = null;
  currentCeritaData = null;
}
window.destroyCerita = destroyCerita;

/* ── Update Dashboard Card ── */
let _ceritaTotalCount = null;

export async function updateCeritaDashboard() {
  if (_ceritaTotalCount === null) {
    if (_ceritaSetsCache) {
      _ceritaTotalCount = _ceritaSetsCache.length;
    } else {
      const { count } = await supa
        .from("cerita_sets")
        .select("id", { count: "exact", head: true })
        .eq("is_published", true);
      _ceritaTotalCount = count ?? 0;
    }
  }
  const total = _ceritaTotalCount;
  const done = Object.keys(ceritaScores).filter(
    (k) => ceritaScores[k] >= 95,
  ).length;

  const valEl = document.getElementById("mc-cerita-val");
  const fillEl = document.getElementById("mc-cerita-fill");
  if (valEl) valEl.textContent = `${done} / ${total}`;
  if (fillEl && total) fillEl.style.width = (done / total) * 100 + "%";

  if (typeof window.renderProgList === "function") window.renderProgList();
}

/* ── Render List Cerita ── */
export async function renderCeritaList() {
  const grid = document.getElementById("cerita-list-grid");
  if (!grid) return;

  if (!_ceritaSetsCache) {
    grid.innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--dim);font-size:13px;"><span class="spinner"></span>Memuat...</div>';
    const { data, error } = await supa
      .from("cerita_sets")
      .select(
        "key, title, title_zh, description, badge, hsk_level, total_chars, sort_order",
      )
      .eq("is_published", true)
      .order("hsk_level", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error || !data) {
      grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--dim);">Gagal memuat cerita</div>`;
      return;
    }
    _ceritaSetsCache = data;
  }

  grid.innerHTML = _ceritaSetsCache
    .map((s) => {
      const hsk = `hsk${s.hsk_level}`;
      const pct = ceritaScores[s.key];
      const isDone = pct !== undefined && pct >= 95;
      const inProgress = pct !== undefined && pct > 0 && pct < 95;
      const doneTag = isDone
        ? `<span class="item-done-tag">✓ Selesai</span>`
        : inProgress
          ? `<span class="item-done-tag" style="opacity:.65">${pct}%</span>`
          : "";
      const chars = s.total_chars ? `${s.total_chars} karakter` : "—";
      const title = _escapeHtml(s.title);
      const titleZh = s.title_zh ? _escapeHtml(s.title_zh) : "";
      const badgeSafe = _escapeHtml(s.badge);
      const charsSafe = _escapeHtml(chars);
      const keySafe = _escapeHtml(s.key);
      return `<div class="item-card" data-hsk="${hsk}" data-cerita-key="${keySafe}">
      <div class="item-card-top"><span class="day-badge">${badgeSafe}</span>${doneTag}</div>
      <div class="item-title">${title}</div>
      ${s.title_zh ? `<div style="font-size:13px;color:var(--dim2);font-family:'Noto Sans SC',sans-serif;margin-top:2px;">${titleZh}</div>` : ""}
      <div class="item-meta"><span class="item-date">${charsSafe}</span><button class="btn-open" data-cerita-open="${keySafe}">Baca</button></div>
    </div>`;
    })
    .join("");
  grid.querySelectorAll(".item-card[data-cerita-key]").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.dataset.ceritaKey;
      if (key) window.startCerita(key);
    });
  });
  grid.querySelectorAll(".btn-open[data-cerita-open]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const key = btn.dataset.ceritaOpen;
      if (key) window.startCerita(key);
    });
  });

  const activeItem = document.querySelector(
    "#hsk-filter-cerita .hsk-dropdown-item.active",
  );
  if (activeItem && typeof window.filterHSK === "function") {
    window.filterHSK("cerita", activeItem.dataset.level || "all", null);
  } else {
    const activePill = document.querySelector(
      "#hsk-filter-cerita .hsk-pill.active",
    );
    if (activePill && typeof window.filterHSK === "function") {
      const txt = activePill.textContent
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
      window.filterHSK("cerita", txt === "semua" ? "all" : txt, activePill);
    }
  }
}

export function getCeritaProgItems() {
  if (!_ceritaSetsCache) return [];
  return _ceritaSetsCache.map((s) => {
    const pct = ceritaScores[s.key];
    return {
      key: s.key,
      title: s.title,
      title_zh: s.title_zh || "",
      pct: pct ?? 0,
      done: pct !== undefined && pct >= 95,
    };
  });
}

/* ── Expose ke window untuk dipanggil dari HTML ── */
window.startCerita = startCerita;
window.renderCeritaBody = renderCeritaBody;
window.closeCeritaPopups = closeCeritaPopups;
window.toggleCeritaScroll = toggleCeritaScroll;
window.changeCeritaSpeed = changeCeritaSpeed;
window.changeCeritaFont = changeCeritaFont;
window.confirmCeritaReset = confirmCeritaReset;
window.startCeritaQuiz = startCeritaQuiz;
window.closeCerita = closeCerita;
window.updateCeritaDashboard = updateCeritaDashboard;
window.renderCeritaList = renderCeritaList;
window.getCeritaProgItems = getCeritaProgItems;
window._ceritaStopAll = _ceritaStopAll;
window._cqAnswer = _cqAnswer;
window._cqNext = _cqNext;
window._cqClose = _cqClose;
window.updateCeritaProgress = updateCeritaProgress;
