/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   TIER-UNLOCK.JS — Sistem unlock tier terpusat (VERSI 6)
   
   LOGIKA UTAMA:
   - Global bypass: deck sebelum entry point → semua terbuka
   - Entry point deck: selalu terbuka tanpa syarat
   - Sequential: hanya berlaku setelah entry point
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";

/* ══════════════════════════════════════════
   KONSTANTA
══════════════════════════════════════════ */
export const TIER_ORDER = ["pemula", "menengah", "lanjut", "master", "fasih"];

export const TIER_LABEL = {
  pemula: "Tingkat Pemula",
  menengah: "Tingkat Menengah",
  lanjut: "Tingkat Lanjut",
  master: "Tingkat Master",
  fasih: "Tingkat Fasih",
};

export const TIER_HSK = {
  pemula: [1, 2],
  menengah: [3],
  lanjut: [4],
  master: [5],
  fasih: [6],
};

/* ══════════════════════════════════════════
   CACHE
══════════════════════════════════════════ */
let _tierStartDeckCache = {};

export async function loadTierStartDecks(tableName) {
  if (_tierStartDeckCache[tableName]) return _tierStartDeckCache[tableName];

  const { data, error } = await supa
    .from(tableName)
    .select("id, hsk_level")
    .order("id");

  if (error || !data) return null;

  const minByHSK = {};
  data.forEach(({ id, hsk_level }) => {
    const hsk = Number(hsk_level);
    if (!isNaN(hsk) && (!minByHSK[hsk] || id < minByHSK[hsk])) {
      minByHSK[hsk] = id;
    }
  });

  const result = {};
  TIER_ORDER.forEach((tier) => {
    const hsks = TIER_HSK[tier];
    const firstHSK = Math.min(...hsks);
    result[tier] = minByHSK[firstHSK] ?? null;
  });

  _tierStartDeckCache[tableName] = result;
  return result;
}

/* ══════════════════════════════════════════
   STATE
══════════════════════════════════════════ */
let _unlockedTiers = {
  pemula: true,
  menengah: false,
  lanjut: false,
  master: false,
  fasih: false,
};

let _tiersLoadPromise = null;
let _tiersLoaded = false;
const _unlockListeners = [];

/* ══════════════════════════════════════════
   GETTERS
══════════════════════════════════════════ */
export function getUnlockedTiers() {
  return { ..._unlockedTiers };
}

export function isTierUnlocked(tier) {
  return !!_unlockedTiers[tier];
}

export function getUnlockedHSK() {
  const levels = new Set();
  TIER_ORDER.forEach((tier) => {
    if (_unlockedTiers[tier]) {
      TIER_HSK[tier].forEach((h) => levels.add(h));
    }
  });
  return [...levels].sort((a, b) => a - b);
}

export function isHSKUnlocked(hskLevel) {
  return getUnlockedHSK().includes(Number(hskLevel));
}

export function getHighestUnlockedTier() {
  for (let i = TIER_ORDER.length - 1; i >= 0; i--) {
    if (_unlockedTiers[TIER_ORDER[i]]) return TIER_ORDER[i];
  }
  return "pemula";
}

export function getHighestUnlockedHSK() {
  const highestTier = getHighestUnlockedTier();
  return Math.max(...TIER_HSK[highestTier]);
}

export function getEntryPointDeck(tableName) {
  const highestTier = getHighestUnlockedTier();
  return _tierStartDeckCache[tableName]?.[highestTier] ?? null;
}

export function isDeckBypassed(deckIndex, tableName) {
  const entryPoint = getEntryPointDeck(tableName);
  if (!entryPoint) return false;
  return deckIndex + 1 < entryPoint;
}

export function isBypassedHSK(hskLevel) {
  return Number(hskLevel) < getHighestUnlockedHSK();
}

/* ══════════════════════════════════════════
   RESOLVE LOCK FUNCTIONS
══════════════════════════════════════════ */
export function resolveQuizLock({
  hskLevel,
  deckIndex,
  tableName,
  prevScore,
  threshold = 80,
}) {
  const hsk = Number(hskLevel);

  if (!isHSKUnlocked(hsk)) {
    return { isLocked: true, reason: "tier" };
  }

  const entryPoint = getEntryPointDeck(tableName);

  if (deckIndex + 1 < entryPoint) {
    return { isLocked: false, reason: null };
  }

  if (deckIndex + 1 === entryPoint) {
    return { isLocked: false, reason: null };
  }

  const isPrevCompleted = prevScore !== undefined && prevScore >= threshold;
  return isPrevCompleted
    ? { isLocked: false, reason: null }
    : { isLocked: true, reason: "sequential" };
}

export function resolveCumulativeLock({
  hskLevel,
  deckIndex,
  tableName,
  completedQuizCount,
  unlockAfter = 3,
}) {
  const hsk = Number(hskLevel);

  if (!isHSKUnlocked(hsk)) {
    return { isLocked: true, reason: "tier" };
  }

  const entryPoint = getEntryPointDeck(tableName);

  // Global bypass: deck sebelum entry point → bebas
  if (deckIndex + 1 < entryPoint) {
    return { isLocked: false, reason: null };
  }

  // Entry point deck: cek unlock_after jika ada, jangan auto-bypass
  // Deck pertama (deckIndex === 0) tetap harus cek sequential jika unlock_after > 0
  if (
    deckIndex + 1 === entryPoint &&
    (unlockAfter === 0 || unlockAfter == null)
  ) {
    return { isLocked: false, reason: null };
  }

  // Sequential lock
  const requiredQuizzes = (deckIndex + 1) * unlockAfter;
  const isUnlocked = (completedQuizCount || 0) >= requiredQuizzes;
  return isUnlocked
    ? { isLocked: false, reason: null }
    : { isLocked: true, reason: "sequential", requiredQuizzes };
}

export function resolveVocabLock({ hskLevel, deckIndex, tableName, prevDone }) {
  const hsk = Number(hskLevel);

  if (!isHSKUnlocked(hsk)) {
    return { isLocked: true, reason: "tier" };
  }

  const entryPoint = getEntryPointDeck(tableName);

  if (deckIndex + 1 < entryPoint) {
    return { isLocked: false, reason: null };
  }

  if (deckIndex + 1 === entryPoint || deckIndex === 0) {
    return { isLocked: false, reason: null };
  }

  return prevDone
    ? { isLocked: false, reason: null }
    : { isLocked: true, reason: "sequential" };
}

export function resolveItemLock({
  hskLevel,
  index,
  mode,
  tableName,
  prevScore,
  threshold = 80,
  doneCount,
  unlockAfter,
  prevDone,
}) {
  if (!isHSKUnlocked(hskLevel)) return { isLocked: true, reason: "tier" };
  if (mode === "score")
    return resolveQuizLock({
      hskLevel,
      deckIndex: index,
      tableName,
      prevScore,
      threshold,
    });
  if (mode === "count")
    return resolveCumulativeLock({
      hskLevel,
      deckIndex: index,
      tableName,
      completedQuizCount: doneCount,
      unlockAfter: unlockAfter || 3,
    });
  if (mode === "done")
    return resolveVocabLock({
      hskLevel,
      deckIndex: index,
      tableName,
      prevDone,
    });
  return { isLocked: false, reason: null };
}

export function lockMessage(reason, { prevTitle = "", unlockAfter = 0 } = {}) {
  if (reason === "tier") return "Selesaikan tier sebelumnya dulu!";
  if (unlockAfter > 0)
    return `Selesaikan ${unlockAfter} Quiz untuk membuka ini!`;
  if (prevTitle) return `Selesaikan "${prevTitle}" dulu!`;
  return "Selesaikan item sebelumnya dulu!";
}

/* ══════════════════════════════════════════
   LOAD DARI DB
══════════════════════════════════════════ */
export async function loadUnlockedTiers() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  if (_tiersLoaded) return;

  if (!_tiersLoadPromise) {
    _tiersLoadPromise = (async () => {
      try {
        const { data, error } = await supa
          .from("user_profile")
          .select("unlocked_tiers")
          .eq("user_id", currentUser.id)
          .maybeSingle();

        if (error) {
          console.warn("[TierUnlock] DB error:", error.message);
          return;
        }

        if (!data) {
          console.warn("[TierUnlock] user_profile row belum ada");
          return;
        }

        const rawTiers = data.unlocked_tiers ?? [];
        const tiers = Array.isArray(rawTiers)
          ? rawTiers
              .filter((t) => t !== null && t !== undefined)
              .map((t) => (typeof t === "string" ? t : String(t)))
          : [];

        const newUnlocked = {
          pemula: true,
          menengah: false,
          lanjut: false,
          master: false,
          fasih: false,
        };

        tiers.forEach((t) => {
          if (typeof t === "string" && t in newUnlocked) {
            newUnlocked[t] = true;
          }
        });

        const highestIdx = TIER_ORDER.reduce(
          (max, t, i) => (newUnlocked[t] ? i : max),
          0,
        );
        for (let i = 0; i <= highestIdx; i++) {
          newUnlocked[TIER_ORDER[i]] = true;
        }

        newUnlocked.pemula = true;
        _unlockedTiers = newUnlocked;
        _tiersLoaded = true;

        _syncToPetualangan();
      } catch (e) {
        console.warn("[TierUnlock] loadUnlockedTiers error:", e.message);
      } finally {
        _tiersLoadPromise = null;
      }
    })();
  }

  const p = _tiersLoadPromise;
  if (p) await p;
}

export function resetTiersCache() {
  _tiersLoaded = false;
  _tiersLoadPromise = null;
  _tierStartDeckCache = {};
  _unlockedTiers = {
    pemula: true,
    menengah: false,
    lanjut: false,
    master: false,
    fasih: false,
  };
}

/* ══════════════════════════════════════════
   UNLOCK TIER BARU
══════════════════════════════════════════ */
export async function unlockTier(tier) {
  const tierIdx = TIER_ORDER.indexOf(tier);
  if (tierIdx === -1) return;

  let changed = false;
  for (let i = 0; i <= tierIdx; i++) {
    if (!_unlockedTiers[TIER_ORDER[i]]) {
      _unlockedTiers[TIER_ORDER[i]] = true;
      changed = true;
    }
  }

  if (!changed) return;

  const currentUser = getCurrentUser();
  if (currentUser) {
    const unlockedArr = TIER_ORDER.filter((t) => _unlockedTiers[t]);
    const { error } = await supa
      .from("user_profile")
      .upsert(
        { user_id: currentUser.id, unlocked_tiers: unlockedArr },
        { onConflict: "user_id" },
      );

    if (error) {
      console.warn("[TierUnlock] Gagal upsert:", error.message);
    } else {
      _tiersLoaded = false;
    }
  }

  _syncToPetualangan();

  _unlockListeners.forEach((fn) => {
    try {
      fn(tier, getUnlockedHSK());
    } catch (e) {
      console.error(e);
    }
  });
  _refreshAllFeatures(tier);
}

export function onTierUnlock(fn) {
  if (typeof fn === "function") _unlockListeners.push(fn);
}

/* ══════════════════════════════════════════
   SYNC & REFRESH
══════════════════════════════════════════ */
function _syncToPetualangan() {
  if (typeof window._setTierUnlockedFromGlobal === "function") {
    window._setTierUnlockedFromGlobal({ ..._unlockedTiers });
  }
}

function _refreshAllFeatures(newTier) {
  const hsk = getUnlockedHSK();
  if (typeof window.renderPetualanganPath === "function")
    window.renderPetualanganPath();
  if (
    document.getElementById("layer-kos")?.classList.contains("active") &&
    typeof window.renderKosDeckGrid === "function"
  )
    window.renderKosDeckGrid();
  if (
    document.getElementById("layer-quiz")?.classList.contains("active") &&
    typeof window.renderQuizList === "function"
  )
    window.renderQuizList();
  if (
    document.getElementById("layer-kalimat")?.classList.contains("active") &&
    typeof window.renderKalList === "function"
  )
    window.renderKalList();
  if (
    document.getElementById("grammar-screen")?.classList.contains("active") &&
    typeof window.renderGrammarList === "function"
  )
    window.renderGrammarList();
  console.log(`[TierUnlock] Tier "${newTier}" terbuka. HSK tersedia:`, hsk);
}

export function filterByUnlockedHSK(items) {
  const unlocked = getUnlockedHSK();
  return items.filter((item) => unlocked.includes(Number(item.hsk_level)));
}

/* ══════════════════════════════════════════
   EXPOSE KE WINDOW
══════════════════════════════════════════ */
window.resetTiersCache = resetTiersCache;
window._tierUnlock = {
  getUnlockedTiers,
  isTierUnlocked,
  getUnlockedHSK,
  isHSKUnlocked,
  isBypassedHSK,
  getHighestUnlockedTier,
  getHighestUnlockedHSK,
  getEntryPointDeck,
  isDeckBypassed,
  resolveQuizLock,
  resolveCumulativeLock,
  resolveVocabLock,
  resolveItemLock,
  lockMessage,
  loadUnlockedTiers,
  loadTierStartDecks,
  resetTiersCache,
  unlockTier,
  onTierUnlock,
  filterByUnlockedHSK,
  TIER_ORDER,
  TIER_LABEL,
  TIER_HSK,
};
