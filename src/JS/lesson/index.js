/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   LESSON/INDEX.JS — State, openLesson, fetchQuestions
   ============================================================ */

import { supa } from "../core/config.js";
import { lessonState, matchTemp, setMatchTemp } from "./state.js";
import {
  _lessonShowLoading,
  _lessonHideLoading,
  renderVocabIntro,
  renderQuestion,
  renderEmpty,
} from "./render.js";
import { lessonClose, lessonAskClose } from "./nav.js";
import { _vocabPrev } from "./render.js";

// ============================================================
// HARDWARE BACK BUTTON HANDLER
// ============================================================
let _lessonBackHandlerActive = false;

function _lessonPushHistoryState() {
  history.pushState({ lessonActive: true }, "", location.href);
}

export function _lessonIsVocabActive() {
  const vocabWrap = document.getElementById("lesson-vocab-wrap");
  return (
    vocabWrap &&
    vocabWrap.style.display !== "none" &&
    vocabWrap.innerHTML.trim() !== ""
  );
}

function _lessonBackHandler(e) {
  if (_lessonIsVocabActive()) {
    if (lessonState._vocabIdx === 0) {
      _lessonRemoveBackHandler();
      lessonClose();
    } else {
      _lessonPushHistoryState();
      _vocabPrev();
    }
    return;
  }

  const resultActive = document
    .getElementById("lesson-screen-result")
    ?.classList.contains("active");
  if (resultActive) {
    _lessonRemoveBackHandler();
    lessonClose();
    return;
  }

  if (lessonState.currentIdx === 0 && !lessonState.answered) {
    _lessonRemoveBackHandler();
    lessonClose();
    return;
  }

  _lessonPushHistoryState();
  lessonAskClose();
}

export function _lessonInstallBackHandler() {
  if (_lessonBackHandlerActive) return;
  _lessonBackHandlerActive = true;
  setTimeout(() => {
    _lessonPushHistoryState();
    window.addEventListener("popstate", _lessonBackHandler);
  }, 100);
}

export function _lessonRemoveBackHandler() {
  if (!_lessonBackHandlerActive) return;
  _lessonBackHandlerActive = false;
  window.removeEventListener("popstate", _lessonBackHandler);
}

// ============================================================
// OPEN LESSON
// ============================================================
export async function openLesson(unitId, unitData, sectionData, onFetchDone) {
  // BUG #8 FIX: hapus console.trace() dan debug console.log yang tertinggal
  // console.trace sangat mahal (generate stack trace) — tidak boleh ada di production

  const lessonOrder = unitData.nextLessonOrder || 1;

  lessonState.unitId = unitId;
  lessonState.unitData = unitData;
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
  lessonState.currentLessonOrder = lessonOrder;
  lessonState.totalLessons = unitData.totalLessons || 0;
  lessonState._wrongQueue = [];
  lessonState._isReviewRound = false;
  lessonState._lastWasWrong = false;
  lessonState._needsMapRefresh = false;
  lessonState._originalTotal = 0;
  lessonState._originalCorrect = 0;
  lessonState._originalWrong = 0;
  lessonState._vocabList = [];
  lessonState._vocabIdx = 0;
  lessonState._pendingRender = null;
  lessonState._originalQuestions = null;
  setMatchTemp({ type: null, idx: null });

  const actionBar = document.querySelector(".lesson-action-bar");
  const progressTop = document.querySelector(".lesson-progress-top");
  if (actionBar) actionBar.style.display = "none";
  if (progressTop) progressTop.style.display = "none";

  const vocabWrap = document.getElementById("lesson-vocab-wrap");
  if (vocabWrap) {
    vocabWrap.innerHTML = "";
    vocabWrap.style.display = "none";
  }

  _lessonInstallBackHandler();

  // _lessonShowLoading dipanggil oleh overlay sebelum openLesson —
  // tidak perlu dipanggil ulang di sini

  await fetchQuestions(unitId, lessonOrder);

  const vocabRaw = unitData.vocab_intro;
  const vocabForLesson = vocabRaw?.[String(lessonOrder)] || null;
  const hasVocab =
    vocabForLesson &&
    Array.isArray(vocabForLesson) &&
    vocabForLesson.length > 0;

  lessonState._originalQuestions = [...lessonState.questions];

  if (hasVocab) {
    lessonState._vocabList = vocabForLesson;
    lessonState._vocabIdx = 0;
  }

  // Siapkan render — akan dieksekusi oleh overlay setelah animasi selesai
  lessonState._pendingRender = () => {
    if (hasVocab) renderVocabIntro();
    else if (lessonState.questions.length > 0) renderQuestion();
    else renderEmpty();
  };

  // Beri tahu overlay bahwa fetch sudah selesai
  if (typeof onFetchDone === "function") onFetchDone();
}

// ============================================================
// FETCH FROM DB
// ============================================================
export async function fetchQuestions(unitId, lessonOrder) {
  const { data, error } = await supa
    .from("adv_lesson_questions")
    .select("*")
    .eq("unit_id", unitId)
    .eq("lesson_order", lessonOrder)
    .order("question_order");

  if (error) {
    console.error("Fetch error:", error);
    lessonState.questions = [];
    return;
  }

  lessonState.questions = data.map((q) => ({
    id: q.id,
    type: q.type,
    ...q.data,
  }));
}

// ============================================================
// LESSON RESUME — Save/Restore ke localStorage
// ============================================================
const _LS_KEY = "mj_lesson_resume";
const _RESUME_TTL = 30 * 60 * 1000; // 30 menit

export function saveLessonStateToStorage() {
  if (!lessonState.unitId) return;
  try {
    localStorage.setItem(
      _LS_KEY,
      JSON.stringify({
        unitId: lessonState.unitId,
        unitData: lessonState.unitData,
        currentIdx: lessonState.currentIdx,
        currentLessonOrder: lessonState.currentLessonOrder,
        correctCount: lessonState.correctCount,
        wrongCount: lessonState.wrongCount,
        currentStreak: lessonState.currentStreak,
        combo5Bonus: lessonState.combo5Bonus,
        combo10Bonus: lessonState.combo10Bonus,
        _isReviewRound: lessonState._isReviewRound,
        _originalTotal: lessonState._originalTotal,
        _originalCorrect: lessonState._originalCorrect,
        _originalWrong: lessonState._originalWrong,
        savedAt: Date.now(),
      }),
    );
  } catch (e) {
    console.warn("saveLessonStateToStorage:", e);
  }
}

export function clearLessonStateFromStorage() {
  localStorage.removeItem(_LS_KEY);
}

export async function tryResumeLessonFromStorage() {
  try {
    const raw = localStorage.getItem(_LS_KEY);
    if (!raw) return false;

    const saved = JSON.parse(raw);

    if (Date.now() - saved.savedAt > _RESUME_TTL) {
      localStorage.removeItem(_LS_KEY);
      return false;
    }

    if (!saved.currentIdx || saved.currentIdx === 0) {
      localStorage.removeItem(_LS_KEY);
      return false;
    }

    lessonState.unitId = saved.unitId;
    lessonState.unitData = saved.unitData;
    lessonState.currentIdx = saved.currentIdx;
    lessonState.correctCount = saved.correctCount;
    lessonState.wrongCount = saved.wrongCount;
    lessonState.currentStreak = saved.currentStreak;
    lessonState.combo5Bonus = saved.combo5Bonus;
    lessonState.combo10Bonus = saved.combo10Bonus;
    lessonState._isReviewRound = saved._isReviewRound;
    lessonState._originalTotal = saved._originalTotal;
    lessonState._originalCorrect = saved._originalCorrect;
    lessonState._originalWrong = saved._originalWrong;
    lessonState.currentLessonOrder = saved.currentLessonOrder;
    lessonState.totalLessons = saved.unitData?.totalLessons || 0;
    lessonState._wrongQueue = [];
    lessonState._vocabList = [];
    lessonState._vocabIdx = 0;
    lessonState._pendingRender = null;

    // Pastikan screen sebelumnya bersih
    document.getElementById("lesson-screen-intro")?.classList.remove("active");
    document.getElementById("lesson-screen-vocab")?.classList.remove("active");
    document.getElementById("lesson-screen-result")?.classList.remove("active");
    document
      .getElementById("lesson-screen-question")
      ?.classList.remove("active");

    const vocabWrap = document.getElementById("lesson-vocab-wrap");
    if (vocabWrap) {
      vocabWrap.innerHTML = "";
      vocabWrap.style.display = "none";
    }

    await fetchQuestions(saved.unitId, saved.currentLessonOrder);

    if (lessonState.questions.length === 0) {
      localStorage.removeItem(_LS_KEY);
      return false;
    }

    lessonState._originalQuestions = [...lessonState.questions];

    _lessonInstallBackHandler();

    // Langsung render tanpa vocab (resume selalu mulai dari soal)
    renderQuestion();

    clearLessonStateFromStorage();

    return true;
  } catch (e) {
    console.warn("tryResumeLessonFromStorage:", e);
    localStorage.removeItem(_LS_KEY);
    return false;
  }
}

// ============================================================
// EXPOSE GLOBALS
// ============================================================
window.openLesson = openLesson;
window.saveLessonStateToStorage = saveLessonStateToStorage;
window.clearLessonStateFromStorage = clearLessonStateFromStorage;
window.tryResumeLessonFromStorage = tryResumeLessonFromStorage;
