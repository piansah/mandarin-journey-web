/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   LESSON/CHECK.JS — checkAnswer, handleCek, selectXxx, match
   ============================================================ */

import { lessonState, matchTemp, setMatchTemp } from "./state.js";
import { renderQuestion, _lessonSpeak } from "./render.js";
import {
  nextQuestion,
  showFeedback,
  setBtnReady,
  _updateStreakBar,
  _animateProgressTo100,
} from "./nav.js";
import { XP } from "../utilities/xp.js";

// ============================================================
// CHECK ANSWER
// ============================================================
export function handleCek() {
  if (
    !lessonState.answered &&
    document.getElementById("lessonBtnCek").classList.contains("ready")
  ) {
    checkAnswer();
  } else if (lessonState.answered) {
    nextQuestion();
  }
}

function checkAnswer() {
  lessonState.answered = true;
  const q = lessonState.questions[lessonState.currentIdx];
  let isCorrect = false;
  let correctHtml = "";

  if (q.type === "mc") {
    const shuffled = lessonState._mcShuffled || [];
    const correctShuffledIdx = shuffled.findIndex(
      ({ origIdx }) => origIdx === q.answer,
    );
    isCorrect = lessonState.selectedOption === correctShuffledIdx;
    const correctOpt = q.options[q.answer];

    if (q.mode === "meaning_to_hanzi") {
      correctHtml = `
      <div class="feedback-answer-box">
        <div class="fb-hanzi">${correctOpt.hanzi}</div>
        <div class="fb-pinyin">${correctOpt.pinyin || ""}</div>
        <div class="fb-meaning">${q.question.meaning}</div>
      </div>`;
      if (isCorrect) setTimeout(() => _lessonSpeak(correctOpt.hanzi), 400);
    } else {
      const correctMeaning =
        typeof correctOpt === "string" ? correctOpt : correctOpt.meaning;
      correctHtml = `
      <div class="feedback-answer-box">
        <div class="fb-hanzi">${q.question.hanzi}</div>
        <div class="fb-pinyin">${q.question.pinyin}</div>
        <div class="fb-meaning">${correctMeaning}</div>
      </div>`;
      setTimeout(() => _lessonSpeak(q.question.hanzi), 400);
    }

    shuffled.forEach(({ origIdx }, i) => {
      const el = document.querySelector(`.option[data-idx="${i}"]`);
      if (el) {
        el.classList.remove("selected");
        if (origIdx === q.answer) el.classList.add("correct");
        else if (i === lessonState.selectedOption) el.classList.add("wrong");
      }
    });
  } else if (q.type === "tf") {
    isCorrect = lessonState.selectedOption === q.answer;
    correctHtml = `
      <div class="feedback-answer-box">
        <div class="fb-hanzi">${q.question.hanzi}</div>
        <div class="fb-pinyin">${q.question.pinyin}</div>
        <div class="fb-meaning">${q.question.meaning}</div>
      </div>`;
    const tfOpts = document.querySelectorAll(".tf-opt");
    tfOpts.forEach((el) => el.classList.remove("selected"));
    if (q.answer) tfOpts[0]?.classList.add("correct");
    else tfOpts[1]?.classList.add("correct");
    if (!isCorrect) {
      if (lessonState.selectedOption) tfOpts[0]?.classList.add("wrong");
      else tfOpts[1]?.classList.add("wrong");
    }
  } else if (q.type === "arrange") {
    if (q.mode === "arrange_meaning") {
      const userAnswer = lessonState.arrangeAnswer.map((a) => a.meaning);
      isCorrect = JSON.stringify(userAnswer) === JSON.stringify(q.answer);
      correctHtml = `
        <div class="feedback-answer-box">
          <div class="fb-hanzi">${q.question.hanzi}</div>
          <div class="fb-pinyin">${q.question.pinyin}</div>
          <div class="fb-meaning">${q.answer.join(" ")}</div>
        </div>`;
      document.querySelectorAll(".placed-word").forEach((chip) => {
        chip.classList.add(isCorrect ? "correct" : "wrong");
      });
      setTimeout(() => _lessonSpeak(q.question.hanzi), 400);
    } else {
      const userAnswer = lessonState.arrangeAnswer.map((a) => a.hanzi);
      isCorrect = JSON.stringify(userAnswer) === JSON.stringify(q.answer);
      correctHtml = `
        <div class="feedback-answer-box">
          <div class="fb-hanzi">${q.question.target_hanzi}</div>
          <div class="fb-pinyin">${q.question.target_pinyin}</div>
          <div class="fb-meaning">${q.question.target_meaning}</div>
        </div>`;
      document.querySelectorAll(".placed-word").forEach((chip) => {
        chip.classList.add(isCorrect ? "correct" : "wrong");
      });
      setTimeout(() => _lessonSpeak(q.question.target_hanzi), 400);
    }
  } else if (q.type === "match") {
    isCorrect = lessonState.matchAllCorrect;
    correctHtml = `<div class="feedback-answer-box">Semua pasangan sudah benar!</div>`;
  } else if (q.type === "fill") {
    isCorrect = lessonState.selectedOption === q.answer;
    const correct = q.options[q.answer];
    correctHtml = `
      <div class="feedback-answer-box">
        <div class="fb-hanzi">${q.question.full_hanzi}</div>
        <div class="fb-pinyin">${q.question.full_pinyin}</div>
        <div class="fb-meaning">${q.question.full_meaning}</div>
      </div>`;
    const blankSpan = document.getElementById("blankSpan");
    if (blankSpan) {
      blankSpan.textContent = correct.hanzi || correct.meaning;
      blankSpan.style.color = isCorrect ? "var(--gold)" : "var(--red)";
      blankSpan.style.borderBottomColor = isCorrect
        ? "var(--gold)"
        : "var(--red)";
    }
    q.options.forEach((opt, i) => {
      const el = document.querySelector(`.option[data-idx="${i}"]`);
      if (el) {
        el.classList.remove("selected");
        if (i === q.answer) el.classList.add("correct");
        else if (i === lessonState.selectedOption) el.classList.add("wrong");
      }
    });
    if (q.question?.full_hanzi)
      setTimeout(() => _lessonSpeak(q.question.full_hanzi), 400);
  } else if (q.type === "dictation") {
    const shuffled = lessonState._mcShuffled || [];
    const correctShuffledIdx = shuffled.findIndex(
      ({ origIdx }) => origIdx === q.answer,
    );
    isCorrect = lessonState.selectedOption === correctShuffledIdx;
    const correctOpt = q.options[q.answer];
    correctHtml = `
      <div class="feedback-answer-box">
        <div class="fb-hanzi">${correctOpt.hanzi}</div>
        <div class="fb-pinyin">${correctOpt.pinyin || ""}</div>
        <div class="fb-meaning">${correctOpt.meaning || ""}</div>
      </div>`;
    if (isCorrect) setTimeout(() => _lessonSpeak(correctOpt.hanzi), 400);
    shuffled.forEach(({ origIdx }, i) => {
      const el = document.querySelector(`.option[data-idx="${i}"]`);
      if (el) {
        el.classList.remove("selected");
        if (origIdx === q.answer) el.classList.add("correct");
        else if (i === lessonState.selectedOption) el.classList.add("wrong");
      }
    });
  } else if (q.type === "speaking") {
    const score = lessonState.selectedOption ?? 0;
    isCorrect = score >= 55;
    correctHtml = `
    <div class="feedback-answer-box">
      <div class="fb-hanzi">${q.question.hanzi}</div>
      <div class="fb-pinyin">${q.question.pinyin}</div>
      <div class="fb-meaning">${q.question.meaning}</div>
    </div>`;
  }

  // BUG #3 FIX: gunakan XP.LESSON_COMBO5 dan XP.LESSON_COMBO10 dari xp.js
  // sebelumnya hardcoded 6 dan 10 — tidak konsisten dengan konstanta (10 dan 20)
  if (q.type !== "speaking") {
    if (isCorrect) {
      lessonState.correctCount++;
      lessonState.currentStreak++;
      lessonState._lastWasWrong = false;
      if (lessonState.currentStreak > 0 && lessonState.currentStreak % 5 === 0)
        lessonState.combo5Bonus += XP.LESSON_COMBO5;
      if (lessonState.correctCount > 0 && lessonState.correctCount % 10 === 0)
        lessonState.combo10Bonus += XP.LESSON_COMBO10;
    } else {
      lessonState.wrongCount++;
      lessonState.currentStreak = 0;
      lessonState._lastWasWrong = true;
    }
  }

  _updateStreakBar();
  showFeedback(isCorrect, correctHtml);

  const isLast = lessonState.currentIdx >= lessonState.questions.length - 1;
  if (isLast) {
    _animateProgressTo100();
    setTimeout(() => {
      const btn = document.getElementById("lessonBtnCek");
      if (btn) {
        btn.textContent = "Lihat Hasil";
        btn.className =
          "lesson-btn-cek " + (isCorrect ? "correct-state" : "wrong-state");
      }
    }, 50);
  } else {
    const btn = document.getElementById("lessonBtnCek");
    if (btn) {
      btn.textContent = "Lanjut";
      btn.className =
        "lesson-btn-cek " + (isCorrect ? "correct-state" : "wrong-state");
    }
  }
}

// ============================================================
// SELECT HANDLERS
// ============================================================
export function selectOption(idx) {
  if (lessonState.answered) return;
  lessonState.selectedOption = idx;
  document.querySelectorAll(".option").forEach((el, i) => {
    el.classList.toggle("selected", i === idx);
  });
  setBtnReady(true);
}

export function selectTF(val) {
  if (lessonState.answered) return;
  lessonState.selectedOption = val;
  document
    .querySelectorAll(".tf-opt")
    .forEach((el) => el.classList.remove("selected"));
  const target = val
    ? document.querySelector(".tf-opt:first-child")
    : document.querySelector(".tf-opt:last-child");
  if (target) target.classList.add("selected");
  setBtnReady(true);
}

export function selectFill(idx) {
  if (lessonState.answered) return;
  lessonState.selectedOption = idx;
  const q = lessonState.questions[lessonState.currentIdx];
  document.querySelectorAll(".option").forEach((el, i) => {
    el.classList.toggle("selected", i === idx);
  });
  const blankSpan = document.getElementById("blankSpan");
  if (blankSpan && q.options) {
    blankSpan.textContent = q.options[idx].hanzi || q.options[idx].meaning;
    blankSpan.style.color = "var(--gold)";
  }
  setBtnReady(true);
}

export function addWord(el) {
  if (lessonState.answered || el.classList.contains("placed")) return;

  const hanzi = el.getAttribute("data-hanzi");
  const pinyin = el.getAttribute("data-pinyin");
  const meaning = el.getAttribute("data-meaning");

  const wordBankEls = Array.from(document.querySelectorAll("#wordBank .word"));
  const elIdx = wordBankEls.indexOf(el);

  lessonState.arrangeAnswer.push({ hanzi, pinyin, meaning, el, elIdx });
  el.classList.add("placed");

  const q = lessonState.questions[lessonState.currentIdx];
  if (!(q.type === "arrange" && q.mode === "arrange_meaning")) {
    _lessonSpeak(hanzi);
  }

  const drop = document.getElementById("arrangeDrop");
  const placeholder = drop.querySelector(".placeholder");
  if (placeholder) placeholder.remove();

  const chip = document.createElement("div");
  const isMeaningMode = q.type === "arrange" && q.mode === "arrange_meaning";
  if (isMeaningMode) {
    chip.className = "placed-word placed-word--meaning";
    chip.innerHTML = `<span class="placed-meaning-label">${meaning}</span>`;
  } else {
    chip.className = "placed-word";
    chip.innerHTML = `<span class="placed-hz">${hanzi}</span><span class="chip-pinyin">${pinyin}</span>`;
  }
  chip.onclick = () => removeWord(chip, el);
  drop.appendChild(chip);

  setBtnReady(lessonState.arrangeAnswer.length > 0);
}

export function removeWord(chip, origEl) {
  if (lessonState.answered) return;
  lessonState.arrangeAnswer = lessonState.arrangeAnswer.filter(
    (a) => a.el !== origEl,
  );
  chip.remove();
  origEl.classList.remove("placed");
  const drop = document.getElementById("arrangeDrop");
  if (!drop.querySelector(".placed-word")) {
    drop.innerHTML =
      '<span class="placeholder">Ketuk kata untuk menyusun...</span>';
  }
  setBtnReady(lessonState.arrangeAnswer.length > 0);
}

// ============================================================
// MATCH HANDLERS
// ============================================================
export function selectHanziWithListen(idx, hanzi) {
  const el = document.querySelector(`.hanzi-item[data-idx="${idx}"]`);
  const isMatched = el?.classList.contains("matched");

  if (lessonState.matchAllCorrect) {
    _lessonSpeak(hanzi);
    return;
  }

  _lessonSpeak(hanzi);
  if (isMatched || lessonState.answered) return;

  if (matchTemp.type === null) {
    setMatchTemp({ type: "hanzi", idx });
    el?.classList.add("selected");
  } else if (matchTemp.type === "hanzi") {
    document
      .querySelector(`.hanzi-item[data-idx="${matchTemp.idx}"]`)
      ?.classList.remove("selected");
    setMatchTemp({ type: "hanzi", idx });
    el?.classList.add("selected");
  } else {
    // matchTemp.type === "meaning" — hanzi dipilih setelah meaning
    _checkMatch(idx, matchTemp.idx);
    document
      .querySelector(`.meaning-item[data-idx="${matchTemp.idx}"]`)
      ?.classList.remove("selected");
    setMatchTemp({ type: null, idx: null });
  }
}

export function selectMeaning(idx) {
  const el = document.querySelector(`.meaning-item[data-idx="${idx}"]`);
  const isMatched = el?.classList.contains("matched");

  if (lessonState.matchAllCorrect) {
    const q = lessonState.questions[lessonState.currentIdx];
    const pair = q?.pairs?.[idx];
    if (pair?.hanzi) _lessonSpeak(pair.hanzi);
    return;
  }

  if (isMatched) {
    const q = lessonState.questions[lessonState.currentIdx];
    const pair = q?.pairs?.[idx];
    if (pair?.hanzi) _lessonSpeak(pair.hanzi);
    return;
  }
  if (lessonState.answered) return;

  if (matchTemp.type === null) {
    setMatchTemp({ type: "meaning", idx });
    el?.classList.add("selected");
  } else if (matchTemp.type === "meaning") {
    document
      .querySelector(`.meaning-item[data-idx="${matchTemp.idx}"]`)
      ?.classList.remove("selected");
    setMatchTemp({ type: "meaning", idx });
    el?.classList.add("selected");
  } else {
    // matchTemp.type === "hanzi" — meaning dipilih setelah hanzi
    _checkMatch(matchTemp.idx, idx);
    document
      .querySelector(`.hanzi-item[data-idx="${matchTemp.idx}"]`)
      ?.classList.remove("selected");
    setMatchTemp({ type: null, idx: null });
  }
}

export function selectHanzi(idx) {
  if (lessonState.answered) return;
  if (matchTemp.type === null) {
    setMatchTemp({ type: "hanzi", idx });
    document
      .querySelector(`.hanzi-item[data-idx="${idx}"]`)
      ?.classList.add("selected");
  } else if (matchTemp.type === "hanzi") {
    document
      .querySelector(`.hanzi-item[data-idx="${matchTemp.idx}"]`)
      ?.classList.remove("selected");
    setMatchTemp({ type: "hanzi", idx });
    document
      .querySelector(`.hanzi-item[data-idx="${idx}"]`)
      ?.classList.add("selected");
  } else {
    _checkMatch(idx, matchTemp.idx);
    document
      .querySelector(`.meaning-item[data-idx="${matchTemp.idx}"]`)
      ?.classList.remove("selected");
    setMatchTemp({ type: null, idx: null });
  }
}

function _checkMatch(hanziIdx, meaningIdx) {
  const hEl = document.querySelector(`.hanzi-item[data-idx="${hanziIdx}"]`);
  const mEl = document.querySelector(`.meaning-item[data-idx="${meaningIdx}"]`);

  if (hanziIdx === meaningIdx) {
    hEl?.classList.remove("selected");
    mEl?.classList.remove("selected");
    hEl?.classList.add("matched");
    mEl?.classList.add("matched");

    const q = lessonState.questions[lessonState.currentIdx];
    const pair = q?.pairs?.[hanziIdx];
    if (pair?.hanzi) setTimeout(() => _lessonSpeak(pair.hanzi), 200);

    lessonState.matchDoneCount++;
    if (lessonState.matchDoneCount === q.pairs.length) {
      lessonState.matchAllCorrect = true;
      q.pairs.forEach((p, i) => {
        setTimeout(() => _lessonSpeak(p.hanzi), 500 + i * 700);
      });
      setTimeout(() => setBtnReady(true), 600);
    }
  } else {
    hEl?.classList.add("wrong");
    mEl?.classList.add("wrong");

    setTimeout(() => {
      hEl?.classList.remove("wrong", "selected");
      mEl?.classList.remove("wrong", "selected");

      const grid = document.querySelector(".match-grid");
      if (!grid) return;

      const meaningEls = Array.from(
        grid.querySelectorAll(".meaning-item"),
      ).filter((el) => !el.classList.contains("matched"));

      if (meaningEls.length < 2) return;

      const contents = meaningEls.map((el) => el.innerHTML);
      const dataIdxs = meaningEls.map((el) => el.getAttribute("data-idx"));
      const onclicks = meaningEls.map((el) => el.getAttribute("onclick"));

      for (let i = contents.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [contents[i], contents[j]] = [contents[j], contents[i]];
        [dataIdxs[i], dataIdxs[j]] = [dataIdxs[j], dataIdxs[i]];
        [onclicks[i], onclicks[j]] = [onclicks[j], onclicks[i]];
      }

      meaningEls.forEach((el) => {
        el.style.transition = "opacity 0.15s ease, transform 0.15s ease";
        el.style.opacity = "0";
        el.style.transform = "scale(0.9)";
      });

      setTimeout(() => {
        meaningEls.forEach((el, i) => {
          el.innerHTML = contents[i];
          el.setAttribute("data-idx", dataIdxs[i]);
          el.setAttribute("onclick", onclicks[i]);
          el.style.opacity = "1";
          el.style.transform = "scale(1)";
        });
      }, 160);
    }, 400);
  }
}

// ============================================================
// EXPOSE GLOBALS (dipanggil dari onclick HTML)
// ============================================================
window.handleCek = handleCek;
window.selectOption = selectOption;
window.selectTF = selectTF;
window.selectFill = selectFill;
window.addWord = addWord;
window.selectHanzi = selectHanzi;
window.selectMeaning = selectMeaning;
window.selectHanziWithListen = selectHanziWithListen;
