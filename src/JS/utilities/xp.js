/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   XP.JS — Satu sumber kebenaran semua kalkulasi XP
   Import fungsi ini di semua fitur, jangan hitung XP sendiri.
   ============================================================ */

/* ══════════════════════════════════════════════════════════════
   KONSTANTA
   Sinkron dengan get_user_stats() di Supabase SQL function!
   Kalau ubah di sini, update juga SQL-nya.
══════════════════════════════════════════════════════════════ */
export const XP = {
  // Quiz / Kalimat / Grammar — berdasarkan akurasi
  HIGH: 36, // pct >= 80
  MID: 18, // pct >= 60
  LOW: 9, // pct < 60

  // Hanzi & Cerita — flat reward
  HANZI_SELESAI: 36, // score >= 100
  CERITA_SELESAI: 36, // pct >= 95

  // Cerita Quiz
  CERITA_QUIZ_HIGH: 20, // pct >= 80
  CERITA_QUIZ_MID: 12, // pct >= 60
  CERITA_QUIZ_LOW: 6, // pct < 60

  // Nada
  NADA_BASE: 10,
  NADA_PER_BENAR: 2, // xp = 10 + (benar * 2)

  // Flashcard — per sesi review
  FC_PER_CARD: 2,
  FC_MATURE_BONUS: 5,
  FC_BASE: 10,
  FC_PER_HAFAL: 2, // done screen: 10 + (hafal * 2)

  TULIS_SELESAI: 36,

  // Speaking
  SPEAKING: 20,

  // Lesson (Petualangan)
  LESSON_BASE: 20,
  LESSON_PER_BENAR: 3,
  LESSON_COMBO5: 10, // bonus combo 5x
  LESSON_COMBO10: 20, // bonus combo 10x

  // Cap untuk session types (fc, nada, speaking)
  SESSION_CAP: 36,
};

/* ══════════════════════════════════════════════════════════════
   FUNGSI KALKULASI
══════════════════════════════════════════════════════════════ */

/** Quiz, Kalimat, Grammar — berdasarkan persentase akurasi */
export function calcXPFromPct(pct) {
  if (pct >= 80) return XP.HIGH;
  if (pct >= 60) return XP.MID;
  return XP.LOW;
}

/** Nada — 10 + (benar * 2) */
export function calcXPNada(benar) {
  return Math.round(XP.NADA_BASE + benar * XP.NADA_PER_BENAR);
}

/** Flashcard — per sesi review (dipanggil saat kartu di-review) */
export function calcXPFCSession(entries) {
  // entries: array of { isMature: boolean }
  let xp = 0;
  for (const e of entries) {
    xp += XP.FC_PER_CARD;
    if (e.isMature) xp += XP.FC_MATURE_BONUS;
  }
  return xp;
}

/** Flashcard — done screen (10 + hafal * 2) */
export function calcXPFCDone(hafal) {
  return Math.round(XP.FC_BASE + hafal * XP.FC_PER_HAFAL);
}

/** Cerita Quiz */
export function calcXPCeritaQuiz(pct) {
  if (pct >= 80) return XP.CERITA_QUIZ_HIGH;
  if (pct >= 60) return XP.CERITA_QUIZ_MID;
  return XP.CERITA_QUIZ_LOW;
}

/** Lesson (Petualangan) */
export function calcXPLesson(correct, combo5Bonus = 0, combo10Bonus = 0) {
  return (
    XP.LESSON_BASE + correct * XP.LESSON_PER_BENAR + combo5Bonus + combo10Bonus
  );
}
