/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   LEVEL.JS — Level System, Titles (Gelar), Badges (Lencana)
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";

/* ══════════════════════════════════════════════
   1. LEVEL THRESHOLDS
══════════════════════════════════════════════ */

export const XP_PER_LEVEL = 500;

export function calcLevel(userXP) {
  if (!userXP || userXP <= 0) return 1;
  return Math.floor(userXP / XP_PER_LEVEL) + 1;
}

export function getXPProgress(userXP) {
  const level = calcLevel(userXP);
  const xpPrev = (level - 1) * XP_PER_LEVEL;
  const xpInLevel = userXP - xpPrev;
  const pct = Math.floor((xpInLevel / XP_PER_LEVEL) * 100);
  const xpLeft = XP_PER_LEVEL - xpInLevel;
  return { level, xpInLevel, xpPrev, xpNext: XP_PER_LEVEL, pct, xpLeft };
}

/* ══════════════════════════════════════════════
   2. TIER SYSTEM — warna level di stat card
══════════════════════════════════════════════ */

export const TIERS = [
  { minLevel: 1, label: "Pemula", color: "#9999bb" },
  { minLevel: 21, label: "Pelajar", color: "#60a5fa" },
  { minLevel: 41, label: "Mahir", color: "#4ade80" },
  { minLevel: 61, label: "Ahli", color: "#e8c96d" },
  { minLevel: 81, label: "Master", color: "#f97316" },
];

export function calcTier(level) {
  let tier = TIERS[0];
  for (const t of TIERS) {
    if (level >= t.minLevel) tier = t;
  }
  return tier;
}

/* ══════════════════════════════════════════════
   3. GELAR — 10 gelar, unlock tiap 10 level
══════════════════════════════════════════════ */

export const TITLES = [
  {
    level: 10,
    id: "t1",
    hanzi: "初学者",
    pinyin: "Chūxuézhě",
    label: "Pemula",
    desc: "Langkah pertama selalu yang paling berani.",
  },
  {
    level: 20,
    id: "t2",
    hanzi: "学习者",
    pinyin: "Xuéxízhě",
    label: "Pelajar",
    desc: "Konsisten adalah kunci segala kemajuan.",
  },
  {
    level: 30,
    id: "t3",
    hanzi: "进步者",
    pinyin: "Jìnbùzhě",
    label: "Berkembang",
    desc: "Setiap hari sedikit lebih baik dari kemarin.",
  },
  {
    level: 40,
    id: "t4",
    hanzi: "熟练者",
    pinyin: "Shúliànzhě",
    label: "Terlatih",
    desc: "Tangan yang sering berlatih tidak pernah lupa.",
  },
  {
    level: 50,
    id: "t5",
    hanzi: "中坚者",
    pinyin: "Zhōngjiānzhě",
    label: "Menengah",
    desc: "Separuh perjalanan — yang paling berharga.",
  },
  {
    level: 60,
    id: "t6",
    hanzi: "精通者",
    pinyin: "Jīngtōngzhě",
    label: "Mahir",
    desc: "Kata-kata mulai mengalir seperti air.",
  },
  {
    level: 70,
    id: "t7",
    hanzi: "通晓者",
    pinyin: "Tōngxiǎozhě",
    label: "Ahli",
    desc: "Nuansa bahasa yang halus mulai terasa.",
  },
  {
    level: 80,
    id: "t8",
    hanzi: "卓越者",
    pinyin: "Zhuóyuèzhě",
    label: "Unggul",
    desc: "Melampaui batas yang pernah kamu bayangkan.",
  },
  {
    level: 90,
    id: "t9",
    hanzi: "大师级",
    pinyin: "Dàshī jí",
    label: "Pakar",
    desc: "Selangkah lagi menuju puncak.",
  },
  {
    level: 100,
    id: "t10",
    hanzi: "华语大师",
    pinyin: "Huáyǔ Dàshī",
    label: "Master Mandarin",
    desc: "万里长城，一步一步。",
  },
];

/* ══════════════════════════════════════════════
   4. BADGE / LENCANA — 19 badge berbasis aktivitas
══════════════════════════════════════════════ */

export const BADGES = [
  {
    id: "s1",
    hanzi: "火",
    label: "Api Kecil",
    desc: "7 hari streak berturut-turut.",
    cat: "streak",
    check: (s) => s.streak >= 7,
  },
  {
    id: "s2",
    hanzi: "炎",
    label: "Kobaran Api",
    desc: "14 hari streak berturut-turut.",
    cat: "streak",
    check: (s) => s.streak >= 14,
  },
  {
    id: "s3",
    hanzi: "焰",
    label: "Api Abadi",
    desc: "21 hari streak berturut-turut.",
    cat: "streak",
    check: (s) => s.streak >= 21,
  },
  {
    id: "v1",
    hanzi: "字",
    label: "Mengenal Huruf",
    desc: "Hafal 100 kosakata.",
    cat: "kosakata",
    check: (s) => s.kosakata >= 100,
  },
  {
    id: "v2",
    hanzi: "词",
    label: "Pelajar Kata",
    desc: "Hafal 300 kosakata.",
    cat: "kosakata",
    check: (s) => s.kosakata >= 300,
  },
  {
    id: "v3",
    hanzi: "语",
    label: "Kaya Kosakata",
    desc: "Hafal 500 kosakata.",
    cat: "kosakata",
    check: (s) => s.kosakata >= 500,
  },
  {
    id: "v4",
    hanzi: "文",
    label: "Cakap Berbahasa",
    desc: "Hafal 1.000 kosakata.",
    cat: "kosakata",
    check: (s) => s.kosakata >= 1000,
  },
  {
    id: "v5",
    hanzi: "典",
    label: "Kamus Berjalan",
    desc: "Hafal 2.000 kosakata.",
    cat: "kosakata",
    check: (s) => s.kosakata >= 2000,
  },
  {
    id: "v6",
    hanzi: "博",
    label: "Penguasa Kata",
    desc: "Hafal 3.600 kosakata.",
    cat: "kosakata",
    check: (s) => s.kosakata >= 3600,
  },
  {
    id: "v7",
    hanzi: "圣",
    label: "Maestro Leksikon",
    desc: "Hafal 5.400 kosakata.",
    cat: "kosakata",
    check: (s) => s.kosakata >= 5400,
  },
  {
    id: "e1",
    hanzi: "晨",
    label: "Fajar Rajin",
    desc: "10 sesi belajar.",
    cat: "sesi",
    check: (s) => s.sesi >= 10,
  },
  {
    id: "e2",
    hanzi: "勤",
    label: "Tekun Belajar",
    desc: "25 sesi belajar.",
    cat: "sesi",
    check: (s) => s.sesi >= 25,
  },
  {
    id: "e3",
    hanzi: "恒",
    label: "Tak Kenal Lelah",
    desc: "50 sesi belajar.",
    cat: "sesi",
    check: (s) => s.sesi >= 50,
  },
  {
    id: "e4",
    hanzi: "毅",
    label: "Pejuang Sejati",
    desc: "100 sesi belajar.",
    cat: "sesi",
    check: (s) => s.sesi >= 100,
  },
  {
    id: "x1",
    hanzi: "星",
    label: "Bintang Baru",
    desc: "Raih 500 XP.",
    cat: "xp",
    check: (s) => s.xp >= 500,
  },
  {
    id: "x2",
    hanzi: "月",
    label: "Cahaya Bulan",
    desc: "Raih 1.000 XP.",
    cat: "xp",
    check: (s) => s.xp >= 1000,
  },
  {
    id: "x3",
    hanzi: "日",
    label: "Sinar Matahari",
    desc: "Raih 2.000 XP.",
    cat: "xp",
    check: (s) => s.xp >= 2000,
  },
  {
    id: "x4",
    hanzi: "龙",
    label: "Naga Muda",
    desc: "Raih 3.000 XP.",
    cat: "xp",
    check: (s) => s.xp >= 3000,
  },
  {
    id: "x5",
    hanzi: "仙",
    label: "Pendekar",
    desc: "Raih 5.000 XP.",
    cat: "xp",
    check: (s) => s.xp >= 5000,
  },
];

/* ══════════════════════════════════════════════
   5. CEK & SIMPAN UNLOCK KE user_profile
══════════════════════════════════════════════ */

let _profileCache = null;
let _profileFetchDone = false;

async function _loadUserProfile() {
  const currentUser = getCurrentUser();
  if (!currentUser) return null;
  if (_profileCache) return _profileCache;
  const { data, error } = await supa
    .from("user_profile")
    .select("badges, title_id, selected_avatar")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error) {
    console.error("_loadUserProfile:", error);
    return null;
  }
  _profileCache = data || { badges: [], title_id: null, selected_avatar: null };
  // HAPUS akses ke window._activeAvatarId — biarkan avatar.js yang mengelola sendiri
  return _profileCache;
}

async function _saveUserProfile(patch) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  _profileCache = { ..._profileCache, ...patch };
  await supa.from("user_profile").upsert(
    {
      user_id: currentUser.id,
      ...patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

function _showUnlockToast(type, item) {
  const existing = document.getElementById("unlock-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "unlock-toast";

  if (type === "badge") {
    toast.innerHTML = `
      <div class="unlock-toast-icon" style="font-family:var(--font-hanzi);font-size:32px;line-height:1;color:var(--gold)">${item.hanzi}</div>
      <div class="unlock-toast-body">
        <div class="unlock-toast-tag">Lencana Baru!</div>
        <div class="unlock-toast-name">${item.label}</div>
        <div class="unlock-toast-desc">${item.desc}</div>
      </div>`;
  } else {
    toast.innerHTML = `
      <div class="unlock-toast-icon" style="font-family:var(--font-hanzi);font-size:28px;line-height:1">${item.hanzi.slice(0, 1)}</div>
      <div class="unlock-toast-body">
        <div class="unlock-toast-tag">Gelar Baru!</div>
        <div class="unlock-toast-name">${item.label}</div>
        <div class="unlock-toast-desc">${item.pinyin}</div>
      </div>`;
  }

  document.body.appendChild(toast);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => toast.classList.add("show")),
  );
  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, 3500);
}

let _badgeCheckTs = 0;

export async function checkBadgeUnlock(userXP, extraStats) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const now = Date.now();
  if (now - _badgeCheckTs < 10_000) return;
  _badgeCheckTs = now;

  const level = calcLevel(userXP);
  const stats = {
    xp: userXP || 0,
    streak:
      extraStats?.streak ??
      (typeof window._currentStreak !== "undefined"
        ? window._currentStreak
        : 0),
    kosakata: extraStats?.kosakata ?? 0,
    sesi: extraStats?.sesi ?? 0,
  };

  if (!_profileFetchDone) {
    _profileFetchDone = true;
    await _loadUserProfile();
  }
  if (!_profileCache) return;

  const unlockedBadges = new Set(_profileCache.badges || []);
  let newBadge = null;
  let newTitle = null;
  let dirty = false;

  for (const badge of BADGES) {
    if (badge.check(stats) && !unlockedBadges.has(badge.id)) {
      unlockedBadges.add(badge.id);
      newBadge = badge;
      dirty = true;
    }
  }

  let currentTitleId = _profileCache.title_id;
  let highestTitle = null;
  for (const title of TITLES) {
    if (level >= title.level) highestTitle = title;
  }
  if (highestTitle && highestTitle.id !== currentTitleId) {
    currentTitleId = highestTitle.id;
    newTitle = highestTitle;
    dirty = true;
  }

  if (dirty) {
    await _saveUserProfile({
      badges: [...unlockedBadges],
      title_id: currentTitleId,
    });
    if (newTitle) _showUnlockToast("title", newTitle);
    else if (newBadge) _showUnlockToast("badge", newBadge);
  }

  _renderTitleBadgeUI(level, [...unlockedBadges], currentTitleId);
}

function _renderTitleBadgeUI(level, unlockedBadgeIds, currentTitleId) {
  _renderActiveTitle(currentTitleId);
  _renderBadgeRow(unlockedBadgeIds, level);
}

function _renderActiveTitle(titleId) {
  const oldEl = document.getElementById("stat-title-label");
  if (oldEl) {
    oldEl.textContent = "";
    oldEl.style.display = "none";
  }

  const el = document.getElementById("stat-level-title");
  if (!el) return;
  if (!titleId) {
    el.textContent = "";
    return;
  }
  const title = TITLES.find((t) => t.id === titleId);
  if (!title) return;
  el.textContent = `· ${title.hanzi} ${title.label}`;
  el.title = title.pinyin;
}

function _renderBadgeRow(unlockedBadgeIds, level) {
  const wrap = document.getElementById("badge-row-wrap");
  const sec = document.querySelector(".badge-sec");
  if (!wrap) return;

  const unlockedSet = new Set(unlockedBadgeIds);
  const unlockedBadges = BADGES.filter((b) => unlockedSet.has(b.id));

  if (unlockedBadges.length === 0) {
    if (sec) sec.style.display = "none";
    wrap.innerHTML = "";
    return;
  }
  if (sec) sec.style.display = "";

  wrap.innerHTML = unlockedBadges
    .map(
      (b) => `
    <div class="badge-chip badge-unlocked" title="${b.label}&#10;${b.desc}">
      <span class="badge-chip-icon">${b.hanzi}</span>
      <span class="badge-chip-label">${b.label.split(" ")[0]}</span>
    </div>`,
    )
    .join("");
  wrap.style.display = "";

  if (typeof window._renderProfileBadges === "function")
    window._renderProfileBadges(unlockedBadges);
}

export function resetLevelCache() {
  _profileCache = null;
  _profileFetchDone = false;
}

window.BADGES = BADGES;
window.TITLES = TITLES;

/* ── Expose ke window untuk dipanggil dari HTML ── */
window.calcLevel = calcLevel;
window.calcTier = calcTier;
window.checkBadgeUnlock = checkBadgeUnlock;
window.getXPProgress = getXPProgress;
window.resetLevelCache = resetLevelCache;
