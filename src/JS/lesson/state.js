/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   LESSON/STATE.JS — Shared lesson state (zero dependency)
   ============================================================ */

export let lessonState = {
  _pendingRender: null,
  unitId: null,
  unitData: null,
  questions: [],
  currentIdx: 0,
  answered: false,
  correctCount: 0,
  wrongCount: 0,
  selectedOption: null,
  arrangeAnswer: [],
  matchSelected: null,
  matchDoneCount: 0,
  matchAllCorrect: false,
  currentLessonOrder: 1,
  totalLessons: 0,
  currentStreak: 0,
  combo5Bonus: 0,
  combo10Bonus: 0,
  _wrongQueue: [],
  _isReviewRound: false,
  _lastWasWrong: false,
  _needsMapRefresh: false,
  _originalTotal: 0,
  _originalCorrect: 0,
  _originalWrong: 0,
  _originalQuestions: null,
  _vocabList: [],
  _vocabIdx: 0,
};

export let matchTemp = { type: null, idx: null };

export function setMatchTemp(val) {
  matchTemp = val;
}
