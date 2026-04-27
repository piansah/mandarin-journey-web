/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   CORE/CONFIG.JS — Supabase Initialization & App Constants
   ============================================================ */

import { createClient } from "@supabase/supabase-js";

export const supa = createClient(
  import.meta.env.VITE_SUPA_URL,
  import.meta.env.VITE_SUPA_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storageKey: "hsk_supabase_session",
    },
  },
);

/* ── LocalStorage Constants ── */
export const LS_HAN = "hsk_han";
export const LS_QUIZ_STATE = "hsk_quiz_state";
export const LS_KAL_STATE = "hsk_kal_state";
export const LS_GRAM_STATE = "hsk_gram_state";
export const LS_ACTIVE_QUIZ = "hsk_active_quiz";
export const LS_ACTIVE_KAL = "hsk_active_kal";

/* ── Keys container — diisi oleh initKeys(), pakai object agar reactive ── */
export const appKeys = {
  QUIZ_KEYS: [],
  HANZI_KEYS: [],
  KALIMAT_KEYS: [],
  FC_KEYS: [],
  TOTAL_DAYS: 0,
};

/* ── Throttle ── */
const _throttleTs = {};

export function throttleOp(key, ms = 1000) {
  const now = Date.now();
  if (_throttleTs[key] && now - _throttleTs[key] < ms) return false;
  _throttleTs[key] = now;
  return true;
}

export function resetThrottle(key) {
  delete _throttleTs[key];
}

/* ── RLS Check ── */
export async function checkRLS() {
  const tables = [
    "quiz_sets",
    "hanzi_sets",
    "kalimat_sets",
    "flashcard_sets",
    "hanzi_items",
    "user_scores",
  ];
  console.group("🔒 RLS Check — Mandarin Journey");
  for (const tbl of tables) {
    const { error } = await supa.from(tbl).insert({}).select().limit(1);
    if (!error)
      console.warn(`⚠️  ${tbl}: INSERT berhasil tanpa auth — RLS mungkin OFF`);
    else if (error.code === "42501") console.log(`✅ ${tbl}: RLS aktif`);
    else if (error.code === "23502")
      console.warn(`⚠️  ${tbl}: RLS mungkin OFF — ${error.message}`);
    else console.info(`ℹ️  ${tbl}: error ${error.code} — ${error.message}`);
  }
  console.groupEnd();
  console.log("💡 Fix: Supabase Dashboard ❯❯ Authentication ❯❯ Policies");
}

/* ── initKeys ── */
let _initKeysPromise = null;

export async function initKeys() {
  if (_initKeysPromise && appKeys.QUIZ_KEYS.length > 0) return _initKeysPromise;
  _initKeysPromise = null;

  _initKeysPromise = (async () => {
    const [quizRes, hanziRes, kalRes, fcRes] = await Promise.all([
      supa
        .from("quiz_sets")
        .select("key")
        .order("sort_order", { ascending: true }),
      supa
        .from("hanzi_sets")
        .select("key")
        .order("sort_order", { ascending: true }),
      supa
        .from("kalimat_sets")
        .select("key")
        .order("sort_order", { ascending: true }),
      supa
        .from("flashcard_sets")
        .select("id")
        .order("sort_order", { ascending: true }),
    ]);

    if (quizRes.error) console.error("initKeys: quiz_sets", quizRes.error);
    if (hanziRes.error) console.error("initKeys: hanzi_sets", hanziRes.error);
    if (kalRes.error) console.error("initKeys: kalimat_sets", kalRes.error);
    if (fcRes.error) console.error("initKeys: flashcard_sets", fcRes.error);

    appKeys.QUIZ_KEYS = (quizRes.data || []).map((r) => r.key);
    appKeys.HANZI_KEYS = (hanziRes.data || []).map((r) => r.key);
    appKeys.KALIMAT_KEYS = (kalRes.data || []).map((r) => r.key);
    appKeys.FC_KEYS = (fcRes.data || []).map((r) => `fc${r.id}`);
    appKeys.TOTAL_DAYS = appKeys.QUIZ_KEYS.length;

    /* ── Sync ke window agar dashboard.js bisa baca via window.QUIZ_KEYS ── */
    window.QUIZ_KEYS = appKeys.QUIZ_KEYS;
    window.HANZI_KEYS = appKeys.HANZI_KEYS;
    window.KALIMAT_KEYS = appKeys.KALIMAT_KEYS;
    window.FC_KEYS = appKeys.FC_KEYS;
    window.TOTAL_DAYS = appKeys.TOTAL_DAYS;

    if (!appKeys.QUIZ_KEYS.length && !appKeys.HANZI_KEYS.length)
      _initKeysPromise = null;
  })();

  return _initKeysPromise;
}

// BUG #5 FIX: hapus scoresLoaded dan signalScoresLoaded dari sini
// Keduanya tidak diimport oleh modul manapun — yang aktif dipakai adalah
// window.scoresLoaded yang di-init dan di-resolve oleh dashboard.js.
// Menyimpan dua Promise terpisah dengan resolve yang berbeda menyebabkan
// race condition: signalScoresLoaded() tidak me-resolve window.scoresLoaded,
// sehingga kalimat.js yang await window.scoresLoaded bisa hang selamanya
// jika dashboard.js belum me-resolve-nya.

/* ── initApp — dipanggil dari app-init.js ── */
let _resolveAppReady;
window.appReadyPromise = new Promise((resolve) => {
  _resolveAppReady = resolve;
});

export async function initApp() {
  try {
    await initKeys();
    if (typeof window.initAuth === "function") await window.initAuth();
    if (typeof window.initNavbar === "function") window.initNavbar();
    if (typeof window.warmUpGlobalSearchCache === "function")
      window.warmUpGlobalSearchCache();
  } finally {
    _resolveAppReady(true);
  }
}
