/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   LESSON/MIC.JS — Speaking / Mic recognition untuk soal speaking
   ============================================================ */

import { lessonState } from "./state.js";
import { cancelTTS } from "../utilities/tts.js";
import { SVG_MIC, SVG_MIC_REC } from "../../assets/icon.js";
import { showFeedback, _updateStreakBar, setBtnReady } from "./nav.js";

let _lessonMicActive = false;
let _lessonMicRecog = null;
let _lessonAudioCtx = null;
let _lessonAnalyser = null;
let _lessonWaveRAF = null;

export function toggleLessonMic() {
  _lessonMicActive ? _stopLessonMic() : _startLessonMic();
}

function _lessonFallbackSimilarity(a, b) {
  if (!a || !b) return 0;
  a = a.replace(/\s/g, "");
  b = b.replace(/\s/g, "");
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  const curr = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = [...curr];
  }
  return Math.max(0, Math.round((1 - prev[b.length] / maxLen) * 100));
}

function _updateMicBtn(active) {
  const btn = document.getElementById("lessonMicBtn");
  if (!btn) return;
  if (active) {
    btn.classList.add("speak-btn--recording");
    btn.innerHTML =
      SVG_MIC_REC + '<span id="lessonMicLabel">Mendengarkan...</span>';
  } else {
    btn.classList.remove("speak-btn--recording");
    btn.innerHTML = SVG_MIC + '<span id="lessonMicLabel">Coba Ucapkan</span>';
  }
}

function _setLessonSpkFb(type, msg) {
  const el = document.getElementById("lessonSpkFb");
  if (!el) return;
  el.className =
    "lesson-spk-feedback" + (type ? " lesson-spk-fb--" + type : "");
  el.textContent = msg;
}

function _startLessonMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    _setLessonSpkFb("err", "Browser tidak mendukung. Gunakan Chrome/Edge.");
    return;
  }

  cancelTTS();

  const q = lessonState.questions[lessonState.currentIdx];

  _lessonMicActive = true;
  _updateMicBtn(true);
  _setLessonSpkFb("", "");

  const wave = document.getElementById("lessonMicWave");
  if (wave) wave.classList.add("dictation-wave--playing");

  _lessonMicRecog = new SR();
  _lessonMicRecog.lang = "zh-CN";
  _lessonMicRecog.continuous = false;
  _lessonMicRecog.interimResults = true;
  _lessonMicRecog.maxAlternatives = 3;

  let _ended = false;
  const _done = () => {
    if (_ended) return;
    _ended = true;
    _stopLessonMic();
    const wave = document.getElementById("lessonMicWave");
    if (wave) wave.classList.remove("dictation-wave--playing");
  };

  _lessonMicRecog.onresult = (e) => {
    const result = e.results[0];

    if (!result.isFinal) {
      _setLessonSpkFb("interim", `"${result[0].transcript}" ...`);
      return;
    }

    const alternatives = Array.from({ length: result.length }, (_, i) =>
      result[i].transcript.trim(),
    );
    const first = alternatives[0];
    const hz = q.question?.hanzi || "";

    let bestScore = 0;
    alternatives.forEach((t) => {
      // _spkSimilarity masih di window (dari speaking.js yang belum dimigrasikan)
      const sc =
        typeof window._spkSimilarity === "function"
          ? window._spkSimilarity(t, hz)
          : _lessonFallbackSimilarity(t, hz);
      if (sc > bestScore) bestScore = sc;
    });

    if (bestScore >= 80)
      _setLessonSpkFb("ok", `✓ Bagus! ${bestScore}% — "${first}"`);
    else if (bestScore >= 55)
      _setLessonSpkFb("warn", `${bestScore}% — Hampir! "${first}"`);
    else _setLessonSpkFb("err", `${bestScore}% — Coba lagi? "${first}"`);

    lessonState.selectedOption = bestScore;
    lessonState.answered = true;

    const isCorrect = bestScore >= 55;
    const correctHtml = `
      <div class="feedback-answer-box">
        <div class="fb-hanzi">${q.question.hanzi}</div>
        <div class="fb-pinyin">${q.question.pinyin}</div>
        <div class="fb-meaning">${q.question.meaning}</div>
        <div style="font-size:12px;margin-top:6px;color:var(--dim);">${bestScore}% — "${first}"</div>
      </div>`;
    showFeedback(isCorrect, correctHtml);

    if (isCorrect) {
      lessonState.correctCount++;
      lessonState.currentStreak++;
      lessonState._lastWasWrong = false;
      if (lessonState.currentStreak > 0 && lessonState.currentStreak % 5 === 0)
        lessonState.combo5Bonus += 6;
      if (lessonState.correctCount > 0 && lessonState.correctCount % 10 === 0)
        lessonState.combo10Bonus += 10;
    } else {
      lessonState.wrongCount++;
      lessonState.currentStreak = 0;
      lessonState._lastWasWrong = true;
    }
    _updateStreakBar();

    const btn = document.getElementById("lessonBtnCek");
    if (btn) {
      btn.style.display = "block";
      const isLast = lessonState.currentIdx >= lessonState.questions.length - 1;
      btn.textContent = isLast ? "Lihat Hasil" : "Berikutnya";
      btn.className =
        "lesson-btn-cek " + (isCorrect ? "correct-state" : "wrong-state");
    }

    _done();
  };

  _lessonMicRecog.onerror = (e) => {
    const msg =
      e.error === "not-allowed"
        ? "Izinkan akses mikrofon."
        : e.error === "no-speech"
          ? "Tidak ada suara, coba lagi."
          : "Error: " + e.error;
    _setLessonSpkFb("err", msg);
    _done();
  };

  _lessonMicRecog.onend = () => _done();
  _lessonMicRecog.start();
}

export function _stopLessonMic() {
  _lessonMicActive = false;
  if (_lessonWaveRAF) {
    cancelAnimationFrame(_lessonWaveRAF);
    _lessonWaveRAF = null;
  }
  if (_lessonAudioCtx) {
    try {
      _lessonAudioCtx.close();
    } catch (_) {}
    _lessonAudioCtx = null;
  }
  _lessonAnalyser = null;
  if (_lessonMicRecog) {
    try {
      _lessonMicRecog.stop();
    } catch (_) {}
    _lessonMicRecog = null;
  }
  _updateMicBtn(false);
}

// ============================================================
// EXPOSE GLOBALS
// ============================================================
window.toggleLessonMic = toggleLessonMic;
window._stopLessonMic = _stopLessonMic; // dipakai nav.js via window
