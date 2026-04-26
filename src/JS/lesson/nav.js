/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   LESSON/NAV.JS — nextQuestion, showResult, lessonClose, UI helpers
   ============================================================ */

import { lessonState, matchTemp, setMatchTemp } from "./state.js";
import {
  renderQuestion,
  renderVocabIntro,
  _vocabRemoveSwipe,
  _lessonSpeak,
} from "./render.js";
import { cancelTTS } from "../utilities/tts.js";
import { playSFX, playHaptic, playBurst } from "../utilities/sfx.js";
import { screenEnter, screenLeave } from "../utilities/screen-anim.js";
import { showScreen } from "../core/navigation.js";
import { showDoneScreen } from "../core/done-screen.js";
import { showXPToast } from "../utilities/helpers.js";
import { SVG_SPINNER } from "../../assets/icon.js";
import {
  _lessonRemoveBackHandler,
  _lessonInstallBackHandler,
  _lessonIsVocabActive,
  clearLessonStateFromStorage,
} from "./index.js";
import { saveLessonScore } from "./save.js";
import { calcXPLesson } from "../utilities/xp.js";

// ============================================================
// STREAK BAR + LIGHTNING ANIMATION
// ============================================================
export function _updateStreakBar() {
  const fill = document.getElementById("lessonProgressFillTop");
  if (!fill) return;
  const streak = lessonState.currentStreak;

  fill.classList.remove("streak-3", "streak-5");

  if (streak >= 5) {
    fill.classList.add("streak-5");
    _spawnLightningBolts(fill, 3, "#fff700");
  } else if (streak >= 3) {
    fill.classList.add("streak-3");
    _spawnLightningBolts(fill, 1, "#ffe066");
  }
}

function _spawnLightningBolts(fillEl, count, color) {
  if (!fillEl) return;

  if (!document.getElementById("_streak-bolt-style")) {
    const style = document.createElement("style");
    style.id = "_streak-bolt-style";
    style.textContent = `
      @keyframes _boltFlash {
        0%   { opacity:0; transform:translate(-50%,-50%) scaleY(0.5) rotate(-5deg); }
        12%  { opacity:1; transform:translate(-50%,-50%) scaleY(1.15) rotate(3deg); }
        28%  { opacity:0.7; transform:translate(-50%,-50%) scaleY(0.95) rotate(-2deg); }
        55%  { opacity:1; transform:translate(-50%,-50%) scaleY(1.05) rotate(1deg); }
        80%  { opacity:0.5; transform:translate(-50%,-50%) scaleY(1) rotate(0deg); }
        100% { opacity:0; transform:translate(-50%,-50%) scaleY(0.7) rotate(4deg); }
      }
      ._streak-bolt {
        position: fixed;
        pointer-events: none;
        z-index: 9999;
        animation: _boltFlash 0.6s cubic-bezier(.22,1,.36,1) forwards;
      }
    `;
    document.head.appendChild(style);
  }

  const fillRect = fillEl.getBoundingClientRect();
  const fillRightX = fillRect.right;
  const fillCenterY = fillRect.top + fillRect.height / 2;

  for (let b = 0; b < count; b++) {
    setTimeout(() => {
      const bolt = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      bolt.setAttribute("viewBox", "0 0 14 28");
      bolt.setAttribute("width", "14");
      bolt.setAttribute("height", "28");
      bolt.setAttribute("fill", "none");
      bolt.classList.add("_streak-bolt");

      const jitterX = (b - (count - 1) / 2) * 14;
      const jitterY = (Math.random() - 0.5) * 8;
      bolt.style.left = fillRightX + jitterX + "px";
      bolt.style.top = fillCenterY + jitterY + "px";
      bolt.style.transform = "translate(-50%, -50%)";
      bolt.style.animationDelay = b * 0.07 + "s";

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", "M9 1L3 14h5L6 27l8-15H9L11 1z");
      path.setAttribute("fill", color);
      path.setAttribute("stroke", color);
      path.setAttribute("stroke-width", "0.8");
      path.setAttribute("stroke-linejoin", "round");
      bolt.appendChild(path);

      const sh1 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      sh1.setAttribute("d", "M3 9L0 6l2 6z");
      sh1.setAttribute("fill", color);
      sh1.setAttribute("opacity", "0.7");
      bolt.appendChild(sh1);

      const sh2 = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      sh2.setAttribute("d", "M11 18l3 3-2-6z");
      sh2.setAttribute("fill", color);
      sh2.setAttribute("opacity", "0.7");
      bolt.appendChild(sh2);

      const glow = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle",
      );
      glow.setAttribute("cx", "7");
      glow.setAttribute("cy", "14");
      glow.setAttribute("r", "3");
      glow.setAttribute("fill", color);
      glow.setAttribute("opacity", "0.35");
      bolt.appendChild(glow);

      document.body.appendChild(bolt);
      setTimeout(() => bolt.remove(), 750 + b * 70);
    }, b * 80);
  }
}

// ============================================================
// NEXT QUESTION
// ============================================================
export function nextQuestion() {
  cancelTTS();
  _stopLessonMic();

  const q = lessonState.questions[lessonState.currentIdx];
  if (q && !lessonState._isReviewRound && lessonState._lastWasWrong) {
    lessonState._wrongQueue.push({ ...q });
  }

  lessonState._lastWasWrong = false;
  lessonState.currentIdx++;

  const isAtEnd = lessonState.currentIdx >= lessonState.questions.length;
  const delay = isAtEnd ? 400 : 0;

  setTimeout(() => {
    if (isAtEnd) {
      if (!lessonState._isReviewRound && lessonState._wrongQueue.length > 0) {
        lessonState._originalTotal = lessonState.questions.length;
        lessonState._originalCorrect = lessonState.correctCount;
        lessonState._originalWrong = lessonState.wrongCount;
        lessonState._isReviewRound = true;
        lessonState.questions = [...lessonState._wrongQueue];
        lessonState._wrongQueue = [];
        lessonState.currentIdx = 0;
        lessonState.answered = false;
        lessonState.selectedOption = null;
        lessonState.arrangeAnswer = [];
        lessonState.matchDoneCount = 0;
        lessonState.matchAllCorrect = false;
        setMatchTemp({ type: null, idx: null });
        _showReviewBanner(() => renderQuestion());
      } else {
        showResult();
      }
    } else {
      renderQuestion();
    }
  }, delay);
}

// ============================================================
// REVIEW ROUND BANNER
// ============================================================
function _showReviewBanner(onDone) {
  const wrap = document.getElementById("lesson-question-wrap");
  if (!wrap) {
    onDone();
    return;
  }

  const btn = document.getElementById("lessonBtnCek");
  if (btn) btn.style.display = "none";

  resetFeedback();

  const badge = document.getElementById("lessonReviewBadge");
  if (badge) badge.style.display = "none";

  wrap.innerHTML = `
    <style>
      @keyframes _rb_spin { to { transform: rotate(360deg); } }
      @keyframes _rb_bounceIn { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 80% { transform: scale(0.95); } 100% { transform: scale(1); } }
      @keyframes _rb_fadeUp { from { transform: translateY(14px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      @keyframes _rb_dotPop { 0% { transform: scale(0); opacity: 0; } 60% { transform: scale(1.4); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
      @keyframes _rb_dotPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.3); } }
      @keyframes _rb_pulse { 0% { transform: scale(0.85); opacity: 0.45; } 50% { transform: scale(1.2); opacity: 0.1; } 100% { transform: scale(0.85); opacity: 0.45; } }
      @keyframes _rb_progFill { from { width: 0%; } to { width: 100%; } }
      ._rb_wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60dvh; }
      ._rb_iconWrap { position: relative; width: 88px; height: 88px; margin-bottom: 22px; }
      ._rb_pulse { position: absolute; inset: -12px; border-radius: 50%; background: var(--gold); opacity: 0.2; animation: _rb_pulse 1.8s ease-in-out infinite; }
      ._rb_iconBg { width: 88px; height: 88px; border-radius: 20px; background: linear-gradient(135deg, var(--blue,#4c8fff), #7b61ff); display: flex; align-items: center; justify-content: center; animation: _rb_bounceIn 0.5s cubic-bezier(.34,1.56,.64,1) 0.1s both; }
      ._rb_spinner { animation: _rb_spin 1.1s linear infinite; transform-origin: center; }
      ._rb_title { font-size: 20px; font-weight: 700; color: var(--txt, #f0f0f0); margin: 0 0 8px; text-align: center; animation: _rb_fadeUp 0.45s ease 0.35s both; }
      ._rb_sub { font-size: 13px; color: var(--dim, #aaa); text-align: center; margin-bottom: 28px; animation: _rb_fadeUp 0.45s ease 0.5s both; }
      ._rb_progWrap { width: 180px; height: 8px; background: var(--sur2, #2a2a2a); border-radius: 99px; overflow: hidden; margin-bottom: 20px; animation: _rb_fadeUp 0.45s ease 0.6s both; }
      ._rb_progFill { height: 100%; width: 0%; background: var(--gold, #e8c96d); border-radius: 99px; animation: _rb_progFill 1.4s cubic-bezier(.4,0,.2,1) 0.65s forwards; }
      ._rb_dots { display: flex; gap: 10px; align-items: center; }
      ._rb_dot { width: 10px; height: 10px; border-radius: 50%; background: var(--sur2, #333); opacity: 0; transform: scale(0); }
      ._rb_dot._rb_dotActive { background: var(--gold, #e8c96d); }
    </style>
    <div class="_rb_wrap">
      <div class="_rb_iconWrap">
        <div class="_rb_pulse"></div>
        <div class="_rb_iconBg">
          ${SVG_SPINNER}
        </div>
      </div>
      <div class="_rb_title">Ulang Soal yang Salah</div>
      <div class="_rb_sub">Yuk coba lagi sebelum selesai!</div>
      <div class="_rb_progWrap"><div class="_rb_progFill"></div></div>
      <div class="_rb_dots">
        <div class="_rb_dot" id="_rbDot0"></div>
        <div class="_rb_dot" id="_rbDot1"></div>
        <div class="_rb_dot" id="_rbDot2"></div>
        <div class="_rb_dot" id="_rbDot3"></div>
      </div>
    </div>`;

  const dotEls = [0, 1, 2, 3].map((i) => document.getElementById("_rbDot" + i));
  function _showDot(i, isActive) {
    const d = dotEls[i];
    if (!d) return;
    d.style.animation = "none";
    void d.offsetWidth;
    d.classList.toggle("_rb_dotActive", isActive);
    d.style.animation =
      "_rb_dotPop 0.35s cubic-bezier(.34,1.56,.64,1) forwards" +
      (isActive ? ", _rb_dotPulse 0.9s ease-in-out infinite 0.35s" : "");
  }

  setTimeout(() => _showDot(0, true), 300);
  setTimeout(() => {
    _showDot(0, false);
    _showDot(1, true);
  }, 700);
  setTimeout(() => {
    _showDot(1, false);
    _showDot(2, true);
  }, 1050);
  setTimeout(() => {
    _showDot(2, false);
    _showDot(3, true);
  }, 1350);
  setTimeout(() => {
    if (btn) btn.style.display = "block";
    onDone();
  }, 3200);
}

// ============================================================
// SHOW RESULT
// ============================================================
export function showResult() {
  resetFeedback();
  const reviewBadge = document.getElementById("lessonReviewBadge");
  if (reviewBadge) reviewBadge.style.display = "none";

  _lessonRemoveBackHandler();

  const actionBar = document.querySelector(".lesson-action-bar");
  const progressTop = document.querySelector(".lesson-progress-top");
  if (actionBar) actionBar.style.setProperty("display", "none", "important");
  if (progressTop)
    progressTop.style.setProperty("display", "none", "important");

  const container = document.querySelector(".lesson-screen-container");
  if (container) container.style.setProperty("padding-top", "0", "important");

  const btn = document.getElementById("lessonBtnCek");
  if (btn) btn.style.display = "none";

  const total =
    lessonState._isReviewRound && lessonState._originalTotal > 0
      ? lessonState._originalTotal
      : lessonState.questions.length;
  const correct =
    lessonState._isReviewRound && lessonState._originalTotal > 0
      ? lessonState._originalCorrect
      : lessonState.correctCount;
  const wrong =
    lessonState._isReviewRound && lessonState._originalTotal > 0
      ? lessonState._originalWrong
      : lessonState.wrongCount;

  // BUG #2 FIX: gunakan calcXPLesson() yang sama dengan save.js
  // sebelumnya: baseXP=10, correctXP=correct*5 — tidak konsisten dengan xp.js (base=20, per_benar=3)
  const xp = calcXPLesson(
    correct,
    lessonState.combo5Bonus,
    lessonState.combo10Bonus,
  );

  const questionScreen = document.getElementById("lesson-screen-question");
  const resultScreen = document.getElementById("lesson-screen-result");
  if (questionScreen) questionScreen.classList.remove("active");

  let resultWrap = document.getElementById("lesson-result-wrap");
  if (!resultWrap) {
    resultWrap = document.createElement("div");
    resultWrap.id = "lesson-result-wrap";
    resultWrap.className = "lesson-result-wrap";
    if (resultScreen) resultScreen.appendChild(resultWrap);
  }

  resultScreen.classList.add("active");
  resultWrap.style.display = "block";

  showDoneScreen("lesson-result-wrap", {
    correct,
    wrong,
    total,
    xp,
    btnMainLabel: "Ulangi Pelajaran",
    btnMainFn: "lessonRetry",
    btnSecLabel: "Kembali",
    btnSecFn: "lessonClose",
    showDots: true,
    showBurst: true,
    animateCounters: true,
  });

  const bonusTotal = lessonState.combo5Bonus + lessonState.combo10Bonus;
  if (bonusTotal > 0) {
    const xpRow = document.querySelector("#lesson-result-wrap .ds-xp-row");
    if (xpRow && !xpRow.querySelector(".ds-xp-bonus")) {
      const bonusDiv = document.createElement("div");
      bonusDiv.className = "ds-xp-bonus";
      bonusDiv.style.cssText =
        "color:var(--gold); margin-top:4px; font-size:11px;";
      bonusDiv.textContent = `🔥 Combo Bonus +${bonusTotal} XP`;
      xpRow.appendChild(bonusDiv);
    }
  }

  const bonusLabel =
    bonusTotal > 0 ? "Lesson Selesai (+Bonus Combo)" : "Lesson Selesai";
  showXPToast(xp, bonusLabel);

  saveLessonScore();

  screenEnter(resultScreen, { preset: "slideUp" });
}

// ============================================================
// UI HELPERS
// ============================================================
export function updateProgress() {
  const current = lessonState.currentIdx;
  const total = lessonState.questions.length;
  const pct = total > 0 ? (current / total) * 100 : 0;

  const progTop = document.querySelector(".lesson-progress-top");
  if (progTop && !progTop.querySelector(".lesson-progress-fill-top")) {
    progTop.innerHTML = `
      <button class="lesson-progress-close" onclick="lessonAskClose()">✕</button>
      <div class="lesson-progress-fill-top">
        <div id="lessonProgressFillTop" style="width:0%"></div>
      </div>`;
  }

  const fill = document.getElementById("lessonProgressFillTop");
  if (fill) fill.style.width = pct + "%";

  let reviewBadge = document.getElementById("lessonReviewBadge");
  if (!reviewBadge) {
    reviewBadge = document.createElement("div");
    reviewBadge.id = "lessonReviewBadge";
    reviewBadge.className = "lesson-review-badge";
    reviewBadge.textContent = "";
    document.getElementById("lesson-screen")?.appendChild(reviewBadge);
  }
  reviewBadge.style.display = lessonState._isReviewRound ? "" : "none";
}

export function _animateProgressTo100() {
  const fill = document.getElementById("lessonProgressFillTop");
  if (fill) {
    fill.style.transition = "width 0.35s ease";
    fill.style.width = "100%";
  }
}

export function resetFeedback() {
  const panel = document.getElementById("lessonFeedbackPanel");
  if (panel) {
    panel.className = "lesson-feedback-panel";
    panel.style.maxHeight = "";
    panel.style.padding = "";
  }
}

export function setBtnReady(ready) {
  const btn = document.getElementById("lessonBtnCek");
  if (lessonState.answered || !btn) return;
  btn.className = "lesson-btn-cek " + (ready ? "ready" : "");
}

export function showFeedback(isCorrect, answerHtml) {
  const panel = document.getElementById("lessonFeedbackPanel");
  const status = document.getElementById("lessonFeedbackStatus");
  const answer = document.getElementById("lessonFeedbackAnswer");
  if (!panel || !status || !answer) return;

  panel.className = `lesson-feedback-panel show ${isCorrect ? "correct" : "wrong"}`;
  status.innerText = isCorrect ? "✓ Benar!" : "✗ Salah";
  answer.innerHTML = isCorrect
    ? answerHtml || "<div>Bagus! Pertahankan.</div>"
    : `<div style="margin-bottom:8px;">Jawaban benar:</div>${answerHtml}`;

  playSFX(isCorrect ? "correct" : "wrong");
  playHaptic(isCorrect ? "correct" : "wrong");

  if (
    isCorrect &&
    !lessonState._isReviewRound &&
    lessonState.correctCount === 1
  ) {
    playBurst();
  }
}

// ============================================================
// NAVIGATION
// ============================================================
export function lessonRetry() {
  lessonState.currentIdx = 0;
  lessonState.answered = false;
  lessonState.correctCount = 0;
  lessonState.wrongCount = 0;
  lessonState.selectedOption = null;
  lessonState.arrangeAnswer = [];
  lessonState.matchDoneCount = 0;
  lessonState.matchAllCorrect = false;
  lessonState.currentStreak = 0;
  lessonState.combo5Bonus = 0;
  lessonState.combo10Bonus = 0;
  lessonState._wrongQueue = [];
  lessonState._isReviewRound = false;
  lessonState._lastWasWrong = false;
  lessonState._originalTotal = 0;
  lessonState._originalCorrect = 0;
  lessonState._originalWrong = 0;
  lessonState._vocabIdx = 0;
  setMatchTemp({ type: null, idx: null });

  // Restore soal original, bukan soal review yang tersisa
  if (lessonState._originalQuestions?.length > 0) {
    lessonState.questions = [...lessonState._originalQuestions];
  }

  const actionBar = document.querySelector(".lesson-action-bar");
  const progressTop = document.querySelector(".lesson-progress-top");
  if (actionBar) actionBar.style.removeProperty("display");
  if (progressTop) progressTop.style.removeProperty("display");

  const container = document.querySelector(".lesson-screen-container");
  if (container) {
    container.style.removeProperty("padding-top");
    void container.offsetHeight;
  }

  document.getElementById("lesson-screen-result")?.classList.remove("active");

  const progTop = document.querySelector(".lesson-progress-top");
  if (progTop) progTop.innerHTML = "";

  const vocabWrap = document.getElementById("lesson-vocab-wrap");
  if (vocabWrap) {
    vocabWrap.style.display = "";
    vocabWrap.style.transform = "";
    vocabWrap.style.opacity = "";
  }

  _lessonInstallBackHandler();

  if (lessonState._vocabList.length > 0) {
    renderVocabIntro();
  } else {
    renderQuestion();
  }
}

export function lessonClose() {
  const doneScreen = document.getElementById("lesson-screen-result");
  _lessonRemoveBackHandler();
  _vocabRemoveSwipe();
  clearLessonStateFromStorage();

  // Sembunyikan bar SEBELUM animasi dimulai — mencegah flicker saat screenLeave
  const actionBarEarly = document.querySelector(".lesson-action-bar");
  const progressTopEarly = document.querySelector(".lesson-progress-top");
  if (actionBarEarly)
    actionBarEarly.style.setProperty("display", "none", "important");
  if (progressTopEarly)
    progressTopEarly.style.setProperty("display", "none", "important");

  const executeExit = async () => {
    cancelTTS();
    _stopLessonMic();

    document.getElementById("lesson-screen-vocab")?.classList.remove("active");
    document.getElementById("lesson-screen-result")?.classList.remove("active");
    document
      .getElementById("lesson-screen-question")
      ?.classList.remove("active");

    const container = document.querySelector(".lesson-screen-container");
    if (container) {
      container.style.removeProperty("padding-top");
      void container.offsetHeight;
    }

    const vocabWrap = document.getElementById("lesson-vocab-wrap");
    if (vocabWrap) {
      vocabWrap.innerHTML = "";
      vocabWrap.style.display = "none";
      vocabWrap.style.transform = "";
      vocabWrap.style.opacity = "";
    }

    const needsRefresh = lessonState._needsMapRefresh;
    lessonState._needsMapRefresh = false;

    if (needsRefresh) {
      if (typeof window.invalidatePetualanganCache === "function") {
        window.invalidatePetualanganCache();
      }
      if (typeof window.renderPetualanganPath === "function") {
        await window.renderPetualanganPath();
      }
    }

    showScreen("dash");
  };

  if (doneScreen?.classList.contains("active")) {
    screenLeave(doneScreen, executeExit);
  } else {
    executeExit();
  }
}

export function lessonAskClose() {
  const resultActive = document
    .getElementById("lesson-screen-result")
    ?.classList.contains("active");
  const vocabActive = _lessonIsVocabActive();

  if (
    resultActive ||
    (lessonState.currentIdx === 0 && !lessonState.answered && !vocabActive)
  ) {
    lessonClose();
    return;
  }

  document.getElementById("lesson-exit-modal")?.remove();

  const modal = document.createElement("div");
  modal.id = "lesson-exit-modal";
  modal.className = "lesson-exit-modal";
  modal.innerHTML = `
    <div class="modal-card" id="lesson-exit-card">
      <div style="font-size:40px;margin-bottom:12px;">🚪</div>
      <div style="font-size:18px;font-weight:700;color:var(--txt,#f0f0f0);margin-bottom:8px;">Keluar dari Lesson?</div>
      <div style="font-size:13px;color:var(--txt2,#aaa);margin-bottom:24px;line-height:1.5;">Progresmu di lesson ini akan hilang. Yakin ingin keluar?</div>
      <div style="display:flex;gap:10px;">
        <button class="modal-continue-btn" onclick="_lessonModalClose()">Lanjutkan</button>
        <button class="modal-exit-btn" onclick="_lessonModalExit()">Keluar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const card = document.getElementById("lesson-exit-card");
  if (card) screenEnter(card, { preset: "pop" });
}

export function _lessonModalClose() {
  const card = document.getElementById("lesson-exit-card");
  const modal = document.getElementById("lesson-exit-modal");
  if (card) {
    screenLeave(card, () => modal?.remove());
  } else {
    modal?.remove();
  }
}

export function _lessonModalExit() {
  const card = document.getElementById("lesson-exit-card");
  const modal = document.getElementById("lesson-exit-modal");
  if (card) {
    screenLeave(card, () => {
      modal?.remove();
      lessonClose();
    });
  } else {
    modal?.remove();
    lessonClose();
  }
}

// ── _stopLessonMic dipanggil di sini tapi didefinisikan di mic.js
// pakai window call untuk hindari circular
function _stopLessonMic() {
  window._stopLessonMic?.();
}

// ============================================================
// EXPOSE GLOBALS
// ============================================================
window.lessonRetry = lessonRetry;
window.lessonClose = lessonClose;
window.lessonAskClose = lessonAskClose;
window._lessonModalClose = _lessonModalClose;
window._lessonModalExit = _lessonModalExit;
// Expose helpers yang dipanggil via _callNav dari render.js
window.updateProgress = updateProgress;
window.resetFeedback = resetFeedback;
window.setBtnReady = setBtnReady;
// window.handleCek diset oleh check.js
