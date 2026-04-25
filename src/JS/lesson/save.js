/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   LESSON/SAVE.JS — saveLessonScore, updateLessonProgress
   ============================================================ */

import { lessonState } from "./state.js";
import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { calcXPLesson } from "../utilities/xp.js";
import { clearLessonStateFromStorage } from "./index.js";

export async function saveLessonScore() {
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

  const acc = total > 0 ? Math.round((correct / total) * 100) : 0;
  const totalXP = calcXPLesson(
    correct,
    lessonState.combo5Bonus,
    lessonState.combo10Bonus,
  );

  const currentUser = getCurrentUser();
  if (!currentUser) {
    console.warn("Tidak ada user yang login, skor tidak disimpan");
    return;
  }

  // BUG #4 FIX: catat daily streak setelah lesson selesai
  // fitur lain (hanzi, flashcard, nada, cerita) sudah melakukan ini — lesson terlewat
  window._recordDailyStreak?.().catch(console.error);

  const key = `unit_${lessonState.unitId}_lesson_${lessonState.currentLessonOrder}`;

  const { data: existing } = await supa
    .from("user_scores")
    .select("score")
    .eq("user_id", currentUser.id)
    .eq("type", "lesson")
    .eq("key", key)
    .maybeSingle();

  const oldScore = existing?.score ?? 0;

  // Lesson selesai — hapus resume state
  clearLessonStateFromStorage();

  if (totalXP <= oldScore) {
    console.log(`Skor tidak diperbarui: baru=${totalXP} ≤ lama=${oldScore}`);
    await updateLessonProgress();
    return;
  }

  const payload = {
    user_id: currentUser.id,
    type: "lesson",
    key,
    score: totalXP,
    meta: {
      unit_id: lessonState.unitId,
      lesson_order: lessonState.currentLessonOrder,
      total_questions: total,
      correct_count: correct,
      wrong_count: wrong,
      accuracy: acc,
      combo5_bonus: lessonState.combo5Bonus,
      combo10_bonus: lessonState.combo10Bonus,
      completed_at: new Date().toISOString(),
    },
  };

  const { error } = await supa
    .from("user_scores")
    .upsert(payload, { onConflict: "user_id,type,key" });

  if (error) {
    console.error("Gagal menyimpan skor:", error);
  } else {
    console.log(`Skor diperbarui: ${oldScore} → ${totalXP} (${key})`);
    if (typeof window.invalidateStatsCache === "function")
      window.invalidateStatsCache();
  }

  await updateLessonProgress();
}

export async function updateLessonProgress() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const { data: existing } = await supa
    .from("user_lesson_progress")
    .select("completed_lesson_order")
    .eq("user_id", currentUser.id)
    .eq("unit_id", lessonState.unitId)
    .maybeSingle();

  const oldCompleted = existing?.completed_lesson_order ?? 0;
  const newCompleted = Math.max(oldCompleted, lessonState.currentLessonOrder);

  // BUG #6 FIX: hapus spasi di onConflict — "user_id, unit_id" → "user_id,unit_id"
  // spasi ekstra bisa menyebabkan upsert gagal resolve ke UPDATE dan jatuh ke INSERT duplikat
  await supa.from("user_lesson_progress").upsert(
    {
      user_id: currentUser.id,
      unit_id: lessonState.unitId,
      completed_lesson_order: newCompleted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,unit_id" },
  );

  lessonState._needsMapRefresh = true;
}
