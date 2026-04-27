/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   GRAMMAR.JS — Pola Kalimat Engine + localStorage Session Persistence
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import {
  showScreen,
  backToLayer,
  setFabVisible,
  _navStack,
  _pushAppHistory,
} from "../core/navigation.js";
import {
  showToast,
  showXPToast,
  lsGet,
  lsSet,
  lsRemove,
  shuffle,
} from "../utilities/helpers.js";
import { speakMandarin } from "../utilities/tts.js";
import { showDoneScreen } from "../core/done-screen.js";
import { updateNavbar } from "../core/navigation.js";
import { calcXPFromPct } from "../utilities/xp.js";
import {
  resolveQuizLock,
  lockMessage,
  loadUnlockedTiers,
  loadTierStartDecks,
} from "../utilities/tier-unlock.js";

let grammarPatterns = [];
let currentGramPattern = null;
let gramQuestions = [];
let gramIdx = 0;
let gramAnswer = [];
let gramChipUsed = [];
let gramCorrect = 0;
let gramWrong = 0;
let gramChecked = false;
let gramStates = [];
let _gramSetsCache = null;
let _gramTotalCount = null;
export const gramScores = {};

/* ── Review Round State ── */
let gramReviewRonde = 0;
let gramWrongQuestions = [];
let gramRonde1Correct = 0;
let gramRonde1Total = 0;

function _gramSessionKey(slug) {
  const currentUser = getCurrentUser();
  const uid = currentUser?.id || "guest";
  return `gram_session_${uid}_${slug}`;
}

function _gramSaveState(idx) {
  gramStates[idx] = {
    answer: JSON.parse(JSON.stringify(gramAnswer)),
    used: [...gramChipUsed],
    checked: gramChecked,
    words: _gramGetCurrentWords(),
  };
}

function _gramGetCurrentWords() {
  const bank = document.getElementById("gram-word-bank");
  if (!bank) return [];
  return [...bank.querySelectorAll(".gram-chip")].map((c) => ({
    word: c.dataset.word,
    pinyin: c.dataset.pinyin || "",
  }));
}

function _gramRestoreState(idx) {
  const s = gramStates[idx];
  if (!s) return false;
  gramAnswer = JSON.parse(JSON.stringify(s.answer));
  gramChipUsed = [...s.used];
  gramChecked = s.checked;
  return true;
}

function _gramSaveSession() {
  if (!currentGramPattern) return;
  const state = {
    gramQuestions,
    gramStates,
    gramIdx,
    gramCorrect,
    gramWrong,
    finished: gramIdx >= gramQuestions.length,
  };
  lsSet(_gramSessionKey(currentGramPattern.slug), state);
}

function _gramLoadSession(slug) {
  return lsGet(_gramSessionKey(slug), null);
}

function _gramDeleteSession(slug) {
  lsRemove(_gramSessionKey(slug));
}

function _gramShowHeader(visible) {
  const gramHd = document.querySelector("#grammar-screen .gram-hd");
  const gramProg = document.querySelector("#grammar-screen .gram-prog");
  if (gramHd) gramHd.style.display = visible ? "" : "none";
  if (gramProg) gramProg.style.display = visible ? "" : "none";
}

function _gramTruncate(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen).trimEnd() + "…" : str;
}

function _gramLockedToast(el) {
  const title = el.closest("[data-prev-title]")?.dataset.prevTitle || "";
  showToast(`Selesaikan dulu latihan sebelumnya!`, "warn");
}

function _gramIsCorrect(userArr, correctOrder, altOrders) {
  const userStr = JSON.stringify(userArr);
  if (userStr === JSON.stringify(correctOrder)) return true;
  if (altOrders && altOrders.length > 0) {
    return altOrders.some((alt) => userStr === JSON.stringify(alt));
  }
  return false;
}

/* ── Render Grammar List ── */
export async function renderGrammarList() {
  const grid = document.getElementById("grammar-list-grid");
  if (!grid) return;

  await loadUnlockedTiers();
  await loadTierStartDecks("grammar_patterns");

  if (_gramSetsCache) {
    _renderGrammarGrid();
    return;
  }

  grid.innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--dim);font-size:13px;"><span class="spinner"></span>Memuat...</div>';

  const { data, error } = await supa
    .from("grammar_patterns")
    .select("id, title, slug, hsk_level, sub_title, badge, sort_order")
    .order("hsk_level", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--dim);">Gagal memuat: ${error.message}</div>`;
    return;
  }

  _gramSetsCache = data || [];
  _renderGrammarGrid();
}

function _renderGrammarGrid() {
  const grid = document.getElementById("grammar-list-grid");
  if (!grid || !_gramSetsCache) return;

  grid.innerHTML = _gramSetsCache
    .map((p, i) => {
      const hsk = `hsk${p.hsk_level}`;
      const score = gramScores[p.slug];
      const prevSlug = i > 0 ? _gramSetsCache[i - 1].slug : null;

      // MENGGUNAKAN resolveQuizLock
      const { isLocked, reason } = resolveQuizLock({
        hskLevel: p.hsk_level,
        deckIndex: i,
        prevScore: gramScores[prevSlug],
        tableName: "grammar_patterns",
      });

      const lockedOnclick =
        reason === "tier"
          ? `window.showToast('${lockMessage("tier")}', 'warn')`
          : `window._gramLockedToast(this)`;

      const scoreHtml =
        score !== undefined
          ? `<span class="status done">${score}%</span>`
          : `<span class="status new">Belum</span>`;
      const prevTitle = i > 0 ? _gramSetsCache[i - 1].title : "";
      const safePrevTitle = prevTitle.replace(/"/g, "&quot;");

      return `<div class="item-card${isLocked ? " locked" : ""}" data-hsk="${hsk}" data-prev-title="${safePrevTitle}" onclick="${isLocked ? lockedOnclick : `window.startGrammar(${p.id}, '${p.slug}')`}">
      <div class="item-card-top"><span class="day-badge">${p.badge || "HSK " + p.hsk_level}</span>${scoreHtml}</div>
      <div class="item-title">${p.title}</div>
      ${p.sub_title ? `<div class="gram-card-sub">${p.sub_title}</div>` : ""}
      <div class="item-meta"><span class="item-date">Susun kata — Grammar</span><button class="btn-open" onclick="event.stopPropagation();${isLocked ? lockedOnclick : `window.startGrammar(${p.id}, '${p.slug}')`}">${isLocked ? "🔒" : "Mulai"}</button></div>
    </div>`;
    })
    .join("");

  const activeItem = document.querySelector(
    "#hsk-filter-grammar .hsk-dropdown-item.active",
  );
  if (activeItem && typeof window.filterHSK === "function") {
    window.filterHSK("grammar", activeItem.dataset.level || "all", null);
  } else {
    const activePill = document.querySelector(
      "#hsk-filter-grammar .hsk-pill.active",
    );
    if (activePill && typeof window.filterHSK === "function") {
      const txt = activePill.textContent
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
      window.filterHSK("grammar", txt === "semua" ? "all" : txt, activePill);
    }
  }
}

/* ── Start Grammar Session ── */
export async function startGrammar(patternId, slug) {
  if (typeof window.closeLayer === "function")
    window.closeLayer("layer-grammar", true);

  showScreen("grammar-screen");

  gramIdx = 0;
  gramCorrect = 0;
  gramWrong = 0;
  gramChecked = false;
  gramStates = [];
  gramReviewRonde = 0;
  gramWrongQuestions = [];
  gramRonde1Correct = 0;
  gramRonde1Total = 0;

  _gramShowHeader(true);

  const soalPhase = document.getElementById("gram-soal-phase");
  const theoryPhase = document.getElementById("gram-theory-phase");
  const doneEl = document.getElementById("gram-done");
  const progFill = document.getElementById("gram-prog-fill");
  const footerTheory = document.getElementById("gram-footer-theory");
  const footerSoal = document.getElementById("gram-footer-soal");

  if (soalPhase) soalPhase.style.display = "none";
  if (theoryPhase) theoryPhase.style.display = "none";
  if (doneEl) doneEl.classList.remove("show");
  if (progFill) progFill.style.width = "0%";
  if (footerTheory) footerTheory.style.display = "none";
  if (footerSoal) footerSoal.style.display = "none";

  const titleEl = document.getElementById("gram-title");
  const subEl = document.getElementById("gram-sub");
  if (titleEl) titleEl.textContent = "Memuat...";
  if (subEl) subEl.textContent = "";

  try {
    const [patternRes, questionsRes] = await Promise.all([
      supa.from("grammar_patterns").select("*").eq("id", patternId).single(),
      supa
        .from("grammar_questions")
        .select("*")
        .eq("pattern_id", patternId)
        .order("sort_order", { ascending: true }),
    ]);

    if (patternRes.error || questionsRes.error) {
      showToast("Gagal memuat data grammar. Cek koneksi kamu.", "err");
      closeGrammar();
      return;
    }

    currentGramPattern = patternRes.data;
    gramQuestions = questionsRes.data;

    if (titleEl)
      titleEl.textContent = _gramTruncate(currentGramPattern.title, 40);
    if (subEl)
      subEl.textContent = _gramTruncate(
        currentGramPattern.sub_title ||
          `${gramQuestions.length} soal susun kata`,
        55,
      );

    const savedSession = _gramLoadSession(slug);
    const isValidSession =
      savedSession &&
      savedSession.gramQuestions &&
      savedSession.gramQuestions.length === gramQuestions.length;

    if (isValidSession) {
      gramQuestions = savedSession.gramQuestions;
      gramStates = savedSession.gramStates || [];
      gramIdx = savedSession.gramIdx || 0;
      gramCorrect = savedSession.gramCorrect || 0;
      gramWrong = savedSession.gramWrong || 0;

      if (savedSession.finished) {
        renderGramTheory();
        showGramDone();
        return;
      }

      const curState = gramStates[gramIdx];
      if (curState) {
        gramAnswer = JSON.parse(JSON.stringify(curState.answer || []));
        gramChipUsed = [...(curState.used || [])];
        gramChecked = curState.checked || false;
      }
    }

    renderGramTheory();
    const _restoredQ = gramQuestions[gramIdx];
    window._gramRestoredWds =
      isValidSession && _restoredQ?._shuffledWords
        ? _restoredQ._shuffledWords
        : undefined;

    if (theoryPhase) theoryPhase.style.display = "";
    if (footerTheory) footerTheory.style.display = "";
  } catch (error) {
    console.error("startGrammar error:", error);
    showToast("Gagal memuat grammar. Coba lagi.", "err");
    closeGrammar();
  }

  setTimeout(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, 150);
}

/* ── Render Theory Card ── */
export function renderGramTheory() {
  const p = currentGramPattern;
  if (!p) return;

  const theoryBody = document.getElementById("gram-theory-body");
  if (theoryBody) theoryBody.textContent = p.theory_text || "";

  const exList = document.getElementById("gram-ex-list");
  const examples = p.example_json || [];
  if (exList) {
    exList.innerHTML = examples
      .map(
        (ex, i) => `
      <div class="gram-ex-item">
        <div class="gram-ex-hz">${ex.hz}</div>
        <div class="gram-ex-py">${window.colorPy ? window.colorPy(ex.py) : ex.py}</div>
        <div class="gram-ex-id">${ex.id}</div>
      </div>
      ${i < examples.length - 1 ? '<div style="height:1px;background:var(--bdr);margin:2px 0;"></div>' : ""}
    `,
      )
      .join("");
  }

  const exEl = document.getElementById("gram-theory-ex");
  if (exEl) exEl.classList.add("open");

  const toggleEl = document.getElementById("gram-theory-toggle");
  if (toggleEl) toggleEl.style.display = "none";
}

/* ── Mulai Latihan ── */
export function gramStartSoal() {
  const theoryPhase = document.getElementById("gram-theory-phase");
  const soalPhase = document.getElementById("gram-soal-phase");
  const footerTheory = document.getElementById("gram-footer-theory");
  const footerSoal = document.getElementById("gram-footer-soal");
  if (theoryPhase) theoryPhase.style.display = "none";
  if (soalPhase) soalPhase.style.display = "";
  if (footerTheory) footerTheory.style.display = "none";
  if (footerSoal) footerSoal.style.display = "";

  const savedState = gramStates[gramIdx];
  if (savedState) {
    _gramRestoreState(gramIdx);
    renderGramSoal(savedState.words);
  } else {
    renderGramSoal(window._gramRestoredWds);
  }
  window._gramRestoredWds = undefined;
  window.scrollTo({ top: 0, behavior: "instant" });
}

export function toggleGramTheory() {}

/* ── Render Current Soal ── */
export function renderGramSoal(restoredWords) {
  if (gramIdx >= gramQuestions.length) {
    showGramDone();
    return;
  }

  const q = gramQuestions[gramIdx];
  const total = gramQuestions.length;

  const pinyin = q.pinyin_word || [];
  if (!q._shuffledWords) {
    q._shuffledWords = shuffle(
      q.words.map((w, i) => ({ word: w, pinyin: pinyin[i] || "" })),
    );
  }
  const rawWords = restoredWords || q._shuffledWords;

  if (!restoredWords) {
    gramAnswer = [];
    gramChipUsed = new Array(rawWords.length).fill(false);
    gramChecked = false;
    _gramSaveSession();
  }

  const progress = (gramIdx / total) * 100;
  const progFill = document.getElementById("gram-prog-fill");
  const scoreN = document.getElementById("gram-score-n");
  const scoreL = document.getElementById("gram-score-l");
  const soalLabel = document.getElementById("gram-soal-label");
  const soalTarget = document.getElementById("gram-soal-target");
  if (progFill) progFill.style.width = progress + "%";
  if (scoreN) scoreN.textContent = gramCorrect;
  if (scoreL) scoreL.textContent = `${gramIdx}`;

  const rondeLabel =
    gramReviewRonde > 0
      ? `Review R${gramReviewRonde + 1} — Soal ${gramIdx + 1} dari ${total}`
      : `Soal ${gramIdx + 1} dari ${total} — Susun Kata`;
  if (soalLabel) soalLabel.textContent = rondeLabel;
  if (soalTarget) soalTarget.textContent = q.translation;

  const resultEl = document.getElementById("gram-result");
  if (gramChecked) {
    const userArr = gramAnswer.map((a) => a.word);
    const isCorrect = _gramIsCorrect(userArr, q.correct_order, q.alt_orders);
    if (resultEl) {
      resultEl.className = isCorrect
        ? "gram-result correct"
        : "gram-result wrong";
      const mainText = isCorrect
        ? `✓ Benar! ${q.correct_order.join("")} — ${q.translation}`
        : `✗ Belum tepat. Urutan benar: ${q.correct_order.join("")}`;
      const explanationHtml = q.explanation
        ? `<div class="gram-result-explanation">${q.explanation}</div>`
        : "";
      resultEl.innerHTML = `<div class="gram-result-main" onclick="window.gramPlayCurrent()" style="cursor:pointer;">
          <span>${mainText}</span>
        </div>${explanationHtml}`;
      }
      }
 else if (resultEl) {
    resultEl.className = "gram-result";
    resultEl.innerHTML = "";
  }

  const checkBtn = document.getElementById("gram-btn-check");
  const nextBtn = document.getElementById("gram-btn-next");
  const prevBtn = document.getElementById("gram-btn-prev");

  if (gramChecked) {
    if (checkBtn) checkBtn.style.display = "none";
    if (nextBtn) {
      nextBtn.style.display = "";
      const isLastSoal = gramIdx >= total - 1;
      if (isLastSoal) {
        const userArr = gramAnswer.map((a) => a.word);
        const isCorrect = _gramIsCorrect(
          userArr,
          q.correct_order,
          q.alt_orders,
        );
        const remainingWrong = isCorrect
          ? gramWrongQuestions.filter((wq) => wq.id !== q.id).length
          : gramWrongQuestions.length;
        nextBtn.textContent = remainingWrong > 0 ? "Lanjut" : "Lihat Hasil";
      } else {
        nextBtn.textContent = "Lanjut";
      }
    }
  } else {
    if (checkBtn) {
      checkBtn.style.display = "";
      checkBtn.disabled = false;
    }
    if (nextBtn) nextBtn.style.display = "none";
  }

  if (prevBtn) {
    prevBtn.disabled = false;
    prevBtn.textContent = gramIdx === 0 ? "Teori" : "Sebelumnya";
  }

  renderGramAnswerZone();
  renderGramWordBank(rawWords);
}

export function renderGramAnswerZone() {
  const zone = document.getElementById("gram-answer-zone");
  if (!zone) return;

  if (gramAnswer.length === 0) {
    zone.classList.remove("has-words");
    zone.innerHTML =
      '<span class="gram-answer-placeholder">Ketuk kata di bawah untuk menyusun...</span>';
    return;
  }

  zone.classList.add("has-words");
  zone.innerHTML = gramAnswer
    .map(
      (a, i) => `
    <div class="gram-chip answer" onclick="window.gramRemoveWord(${i})">
      <span class="gram-chip-hanzi">${a.word}</span>
      <span class="gram-chip-pinyin">${a.pinyin || ""}</span>
    </div>
  `,
    )
    .join("");
}

export function renderGramWordBank(words) {
  const bank = document.getElementById("gram-word-bank");
  if (!bank) return;

  bank.innerHTML = words
    .map(
      (w, i) => `
    <div class="gram-chip${gramChipUsed[i] ? " used" : ""}" data-idx="${i}" data-word="${w.word.replace(/"/g, "&quot;")}" data-pinyin="${(w.pinyin || "").replace(/"/g, "&quot;")}" onclick="window.gramAddWord(${i}, '${w.word.replace(/'/g, "\\'")}', '${(w.pinyin || "").replace(/'/g, "\\'")}', this)">
      <span class="gram-chip-hanzi">${w.word}</span>
      <span class="gram-chip-pinyin">${w.pinyin || ""}</span>
    </div>
  `,
    )
    .join("");
}

/* ── Add/Remove Word ── */
export function gramAddWord(idx, word, pinyin, el) {
  if (gramChipUsed[idx] || gramChecked) return;
  gramChipUsed[idx] = true;
  gramAnswer.push({ idx, word, pinyin: pinyin || "" });
  el.classList.add("used");
  speakMandarin(word, true);
  renderGramAnswerZone();

  const resultEl = document.getElementById("gram-result");
  if (resultEl) {
    resultEl.className = "gram-result";
    resultEl.innerHTML = "";
  }

  const nextBtn = document.getElementById("gram-btn-next");
  const checkBtn = document.getElementById("gram-btn-check");
  if (nextBtn) nextBtn.style.display = "none";
  if (checkBtn) {
    checkBtn.style.display = "";
    checkBtn.disabled = false;
  }
}

export function gramRemoveWord(ansIdx) {
  const item = gramAnswer[ansIdx];
  if (!item) return;

  // Selalu putar suara untuk validasi
  speakMandarin(item.word, true);

  if (gramChecked) return;
  gramChipUsed[item.idx] = false;
  gramAnswer.splice(ansIdx, 1);

  const bank = document.getElementById("gram-word-bank");
  if (bank) {
    bank.querySelectorAll(".gram-chip").forEach((chip) => {
      if (parseInt(chip.dataset.idx) === item.idx)
        chip.classList.remove("used");
    });
  }

  renderGramAnswerZone();

  const resultEl = document.getElementById("gram-result");
  if (resultEl) {
    resultEl.className = "gram-result";
    resultEl.innerHTML = "";
  }

  const nextBtn = document.getElementById("gram-btn-next");
  if (nextBtn) nextBtn.style.display = "none";
}

/* ── Check Answer ── */
export function gramCheck() {
  const q = gramQuestions[gramIdx];
  const total = gramQuestions.length;
  if (gramAnswer.length < q.correct_order.length) return;

  gramChecked = true;
  const checkBtn = document.getElementById("gram-btn-check");
  if (checkBtn) checkBtn.style.display = "none";

  const userArr = gramAnswer.map((a) => a.word);
  const isCorrect = _gramIsCorrect(userArr, q.correct_order, q.alt_orders);
  const resultEl = document.getElementById("gram-result");

  const _explanationHtml = q.explanation
    ? `<div class="gram-result-explanation">${q.explanation}</div>`
    : "";

  if (isCorrect) {
    gramCorrect++;
    if (resultEl) {
      resultEl.className = "gram-result correct";
      resultEl.innerHTML = `<div class="gram-result-main" onclick="window.gramPlayCurrent()" style="cursor:pointer;">
          <span>✓ Benar! ${q.correct_order.join("")} — ${q.translation}</span>
        </div>${_explanationHtml}`;
    }
    setTimeout(() => speakMandarin(q.correct_order.join(""), true), 300);
  } else {
    gramWrong++;
    if (!gramWrongQuestions.find((wq) => wq.id === q.id)) {
      gramWrongQuestions.push(q);
    }
    if (resultEl) {
      resultEl.className = "gram-result wrong";
      resultEl.innerHTML = `<div class="gram-result-main" onclick="window.gramPlayCurrent()" style="cursor:pointer;">
          <span>✗ Belum tepat. Urutan benar: ${q.correct_order.join("")}</span>
        </div>${_explanationHtml}`;
    }
  }

  const scoreN = document.getElementById("gram-score-n");
  const scoreL = document.getElementById("gram-score-l");
  if (scoreN) scoreN.textContent = gramCorrect;
  if (scoreL) scoreL.textContent = `${gramIdx + 1}`;

  const isLast = gramIdx >= total - 1;
  const nextBtn = document.getElementById("gram-btn-next");
  if (nextBtn) {
    nextBtn.style.display = "";
    if (isLast) {
      const newWrongCount = isCorrect
        ? gramWrongQuestions.filter((wq) => wq.id !== q.id).length
        : gramWrongQuestions.length;
      nextBtn.textContent = newWrongCount > 0 ? "Lanjut" : "Lihat Hasil";
    } else {
      nextBtn.textContent = "Lanjut";
    }
  }

  _gramSaveState(gramIdx);
  _gramSaveSession();
}

/* ── Prev/Next Soal ── */
export function gramPrev() {
  if (gramIdx === 0) {
    _gramSaveState(gramIdx);
    const soalPhase = document.getElementById("gram-soal-phase");
    const theoryPhase = document.getElementById("gram-theory-phase");
    const footerTheory = document.getElementById("gram-footer-theory");
    const footerSoal = document.getElementById("gram-footer-soal");
    if (soalPhase) soalPhase.style.display = "none";
    if (theoryPhase) theoryPhase.style.display = "";
    if (footerTheory) footerTheory.style.display = "";
    if (footerSoal) footerSoal.style.display = "none";
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }
  _gramSaveState(gramIdx);
  gramIdx--;
  _gramSaveSession();
  const s = gramStates[gramIdx];
  if (s) {
    _gramRestoreState(gramIdx);
    renderGramSoal(s.words);
  } else {
    renderGramSoal();
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function gramNext() {
  _gramSaveState(gramIdx);
  gramIdx++;
  _gramSaveSession();
  if (gramIdx >= gramQuestions.length) {
    if (gramWrongQuestions.length > 0) {
      _gramStartReviewRonde();
    } else {
      showGramDone();
    }
  } else {
    const s = gramStates[gramIdx];
    if (s) {
      _gramRestoreState(gramIdx);
      renderGramSoal(s.words);
    } else {
      renderGramSoal();
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function _gramStartReviewRonde() {
  if (gramReviewRonde === 0) {
    gramRonde1Correct = gramCorrect;
    gramRonde1Total = gramQuestions.length;
    const pct =
      gramRonde1Total > 0
        ? Math.round((gramRonde1Correct / gramRonde1Total) * 100)
        : 0;
    const currentUser = getCurrentUser();
    if (currentUser && currentGramPattern) {
      gramScores[currentGramPattern.slug] = pct;
      if (typeof window.upsertScore === "function")
        window.upsertScore("grammar", currentGramPattern.slug, pct);
      updateGrammarDashboard();
      if (_gramSetsCache) renderGrammarList();
    }
  }

  gramReviewRonde++;

  gramQuestions = shuffle([...gramWrongQuestions]).map((q) => {
    const cloned = { ...q };
    delete cloned._shuffledWords;
    return cloned;
  });
  gramWrongQuestions = [];
  gramIdx = 0;
  gramCorrect = 0;
  gramWrong = 0;
  gramChecked = false;
  gramStates = [];
  gramAnswer = [];
  gramChipUsed = [];

  const subEl = document.getElementById("gram-sub");
  if (subEl)
    subEl.textContent = `Ronde ${gramReviewRonde + 1} — Review Salah (${gramQuestions.length} soal)`;

  const doneEl = document.getElementById("gram-done");
  const progFill = document.getElementById("gram-prog-fill");
  const soalPhase = document.getElementById("gram-soal-phase");
  const footerSoal = document.getElementById("gram-footer-soal");

  _gramShowHeader(true);
  if (doneEl) doneEl.classList.remove("show");
  if (progFill) progFill.style.width = "0%";
  if (soalPhase) soalPhase.style.display = "";
  if (footerSoal) footerSoal.style.display = "";

  renderGramSoal();
  window.scrollTo({ top: 0, behavior: "instant" });
}

/* ── Show Done Screen ── */
export async function showGramDone() {
  const total = gramQuestions.length;
  const correct = gramCorrect;
  const wrong = gramWrong;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const xp = calcXPFromPct(pct);

  _gramShowHeader(false);

  const soalPhase = document.getElementById("gram-soal-phase");
  const theoryPhase = document.getElementById("gram-theory-phase");
  const footerSoal = document.getElementById("gram-footer-soal");
  const footerTheory = document.getElementById("gram-footer-theory");
  const footerParent = document.querySelector("#grammar-screen .gram-footer");

  if (soalPhase) soalPhase.style.display = "none";
  if (theoryPhase) theoryPhase.style.display = "none";
  if (footerSoal) footerSoal.style.display = "none";
  if (footerTheory) footerTheory.style.display = "none";
  if (footerParent) footerParent.style.display = "none";

  window.scrollTo({ top: 0, behavior: "instant" });

  const doneEl = document.getElementById("gram-done");
  if (!doneEl) return;
  doneEl.classList.add("show");

  showDoneScreen("gram-done", {
    correct,
    wrong,
    total,
    xp,
    btnMainLabel: "🔀 Ulangi",
    btnMainFn: "window.gramRestart",
    btnSecLabel: "Kembali",
    btnSecFn: "window.closeGrammar",
  });

  showXPToast(xp, "Grammar selesai");

  const currentUser = getCurrentUser();
  if (currentUser && currentGramPattern) {
    gramScores[currentGramPattern.slug] = pct;
    if (typeof window.upsertScore === "function")
      window.upsertScore("grammar", currentGramPattern.slug, pct);
    updateGrammarDashboard();
    if (_gramSetsCache) renderGrammarList();
  }
  _gramDeleteSession(currentGramPattern?.slug);
}

/* ── Restart ── */
export function confirmGramRestart() {
  const descEl = document.getElementById("retry-confirm-desc");
  const btnEl = document.getElementById("retry-confirm-btn");
  const modalEl = document.getElementById("retry-confirm-modal");

  if (descEl)
    descEl.textContent =
      "Soal akan diacak ulang dan skor latihan ini akan direset.";
  if (btnEl) {
    btnEl.onclick = () => {
      if (typeof window.closeRetryConfirm === "function")
        window.closeRetryConfirm();
      gramRestart();
    };
  }
  if (modalEl) modalEl.classList.add("active");
}

export function gramRestart() {
  if (!currentGramPattern) return;

  const footerParent = document.querySelector("#grammar-screen .gram-footer");
  if (footerParent) footerParent.style.display = "";

  _gramDeleteSession(currentGramPattern.slug);
  delete gramScores[currentGramPattern.slug];
  if (typeof window.deleteScore === "function")
    window.deleteScore("grammar", currentGramPattern.slug);
  updateGrammarDashboard();
  if (_gramSetsCache) renderGrammarList();
  startGrammar(currentGramPattern.id, currentGramPattern.slug);
}

/* ── Close Grammar Screen ── */
export function closeGrammar() {
  window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  if (typeof window.backToLayer === "function")
    window.backToLayer("layer-grammar");
}

/* ── Update Grammar Progress on Dashboard ── */
export function updateGrammarDashboard() {
  const done = Object.keys(gramScores).filter(
    (k) => gramScores[k] >= 80,
  ).length;
  const total = _gramSetsCache ? _gramSetsCache.length : _gramTotalCount;

  const progEl = document.getElementById("mc-grammar-val");
  if (progEl) progEl.textContent = `${done} / ${total ?? "?"}`;

  const fill = document.getElementById("mc-grammar-fill");
  if (fill && total) fill.style.width = (done / total) * 100 + "%";
}

/* ── Load Dashboard Grammar Count ── */
export async function loadGrammarCounts() {
  if (_gramTotalCount !== null) {
    updateGrammarDashboard();
    return;
  }

  const { count } = await supa
    .from("grammar_patterns")
    .select("id", { count: "exact", head: true });
  if (count !== null) _gramTotalCount = count;

  const el = document.getElementById("mc-grammar-count");
  if (el && count !== null) el.textContent = `${count} Pola tersedia`;

  updateGrammarDashboard();
}

/* ── Expose ke window untuk dipanggil dari HTML ── */
window.renderGrammarList = renderGrammarList;
window.startGrammar = startGrammar;
window.renderGramTheory = renderGramTheory;
window.gramStartSoal = gramStartSoal;
window.toggleGramTheory = toggleGramTheory;
window.renderGramSoal = renderGramSoal;
window.gramAddWord = gramAddWord;
window.gramRemoveWord = gramRemoveWord;
window.gramCheck = gramCheck;
window.gramPrev = gramPrev;
window.gramNext = gramNext;
window.gramPlayCurrent = () => {
  const q = gramQuestions[gramIdx];
  if (q) speakMandarin(q.correct_order.join(""), true);
};
window.showGramDone = showGramDone;
window.confirmGramRestart = confirmGramRestart;
window.gramRestart = gramRestart;
window.closeGrammar = closeGrammar;
window.updateGrammarDashboard = updateGrammarDashboard;
window.loadGrammarCounts = loadGrammarCounts;
window._gramLockedToast = _gramLockedToast;