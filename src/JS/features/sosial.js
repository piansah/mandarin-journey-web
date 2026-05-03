/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   SOSIAL.JS — Leaderboard & Social Features (Follow System)
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showToast } from "../utilities/helpers.js";
import { AVATAR_COLLECTION } from "./avatar.js";
import { calcXPFromRows } from "../utilities/xp.js";

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
let _activeTab = "xp";
let _activePeriod = "week";
let _leaderboardCache = null;
let _followingCache = null;
let _myRank = null;
let _tierManuallySelected = false;
let _rankList = [];
let _lastLoadedPeriod = null;
let _selectedTier = "all";
let _userProfilePrevScreen = "sosial-screen";
let _sosialInitInProgress = false; // guard: cegah concurrent init
let _leaderboardRequestId = 0;

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */
function _escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function _getAvatarChar(selectedAvatarId, displayName, customAvatarUrl) {
  if (customAvatarUrl) {
    return `<img src="${_escapeHtml(customAvatarUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="avatar">`;
  }
  if (selectedAvatarId) {
    const avatar = AVATAR_COLLECTION.find((a) => a.id === selectedAvatarId);
    if (avatar && avatar.imageUrl) {
      return `<img src="${_escapeHtml(avatar.imageUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" alt="avatar">`;
    }
  }
  if (displayName && displayName.length > 0) {
    return `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-family:var(--font-hanzi);font-size:18px;">${_escapeHtml(displayName.charAt(0).toUpperCase())}</span>`;
  }
  return `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;">?</span>`;
}

function _getGelarByXP(xp) {
  if (
    typeof calcLevel === "function" &&
    typeof window.TITLES !== "undefined" &&
    window.TITLES
  ) {
    const level = calcLevel(xp);
    let gelar = window.TITLES[0];
    for (const t of window.TITLES) {
      if (level >= t.level) gelar = t;
    }
    return { hanzi: gelar.hanzi, label: gelar.label };
  }
  return { hanzi: "初学者", label: "Pemula" };
}

function _getTierByRank(rank, xp = 0) {
  const userXP = Number(xp || 0);

  // Kasta berdasarkan gabungan Rank dan Minimal XP (Level)
  // 1. Kasta Tertinggi: Yuhuang (Naga Emas) - Harus Master
  if (rank <= 10 && userXP >= 10000) return { name: "yuhuang", icon: "🐲", label: "玉皇 Yùhuáng" };
  
  // 2. Kasta Naga: Long - Harus Mahir
  if (rank <= 30 && userXP >= 5000) return { name: "long", icon: "🐉", label: "龙 Lóng" };
  
  // 3. Kasta Buku: Shu
  if (rank <= 60 && userXP >= 3000) return { name: "shu", icon: "📜", label: "书 Shū" };
  
  // 4. Kasta Bunga: Hua
  if (rank <= 100 && userXP >= 2000) return { name: "hua", icon: "🌸", label: "花 Huā" };
  
  // 5. Kasta Bambu: Zhu
  if (rank <= 150 && userXP >= 1500) return { name: "zhu", icon: "🎋", label: "竹 Zhú" };
  
  // 6. Kasta Singa: Shi
  if (rank <= 200 && userXP >= 1000) return { name: "shi", icon: "🦁", label: "狮 Shī" };
  
  // 7. Kasta Tinta: Mo
  if (rank <= 250 && userXP >= 500) return { name: "mo", icon: "✍️", label: "墨 Mò" };

  // 8. Kasta Dasar: Miao (Tunas) - Untuk user baru atau XP rendah
  return { name: "miao", icon: "🌱", label: "苗 Miáo" };
}

/* ══════════════════════════════════════════════════════════════
   LIGA TIER COLOR
══════════════════════════════════════════════════════════════ */
const _tierColorMap = {
  "🌱": { r: 101, g: 223, b: 77 },
  "✍️": { r: 96, g: 165, b: 250 },
  "🦁": { r: 251, g: 191, b: 36 },
  "🎋": { r: 74, g: 222, b: 128 },
  "🌸": { r: 244, g: 114, b: 182 },
  "📜": { r: 167, g: 139, b: 250 },
  "🐉": { r: 249, g: 115, b: 22 },
  "🐲": { r: 232, g: 201, b: 109 },
};

function _getLigaColor(icon) {
  const key = [...icon][0];
  return _tierColorMap[key] || { r: 102, g: 102, b: 170 };
}

function _applyLigaColor(bannerEl, icon) {
  const { r, g, b } = _getLigaColor(icon);
  bannerEl.style.background = `rgba(${r},${g},${b},0.08)`;
  bannerEl.style.borderColor = `rgba(${r},${g},${b},0.22)`;
  const iconEl = bannerEl.querySelector(".liga-icon");
  if (iconEl) {
    iconEl.style.background = `rgba(${r},${g},${b},0.14)`;
    iconEl.style.borderColor = `rgba(${r},${g},${b},0.32)`;
  }
  const nameEl = bannerEl.querySelector(".liga-name");
  const cr = Math.min(r + 40, 220),
    cg = Math.min(g + 40, 220),
    cb = Math.min(b + 40, 220);
  const accent = `rgb(${cr},${cg},${cb})`;
  if (nameEl) nameEl.style.color = accent;
  const btnEl = bannerEl.querySelector(".liga-btn");
  if (btnEl) {
    btnEl.style.background = `rgba(${r},${g},${b},0.12)`;
    btnEl.style.borderColor = `rgba(${r},${g},${b},0.28)`;
    btnEl.style.color = accent;
  }
}

/* ══════════════════════════════════════════════════════════════
   STREAK CALCULATOR
══════════════════════════════════════════════════════════════ */
function _calcStreak(dateStrings) {
  if (!dateStrings || dateStrings.length === 0) return 0;
  const todayWIB = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Jakarta" }),
  );
  todayWIB.setHours(0, 0, 0, 0);
  const sorted = [...new Set(dateStrings)].sort((a, b) => b.localeCompare(a));
  let streak = 0;
  let expected = new Date(todayWIB);
  for (const d of sorted) {
    const dd = new Date(d);
    dd.setHours(0, 0, 0, 0);
    const diff = Math.round((expected - dd) / 86400000);
    if (diff === 0 || diff === 1) {
      streak++;
      expected = new Date(dd);
      expected.setDate(expected.getDate() - 1);
    } else break;
  }
  return streak;
}

/* ══════════════════════════════════════════════════════════════
   LOAD FOLLOWING LIST
══════════════════════════════════════════════════════════════ */
async function _loadMyFollowing() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    _followingCache = new Set();
    return;
  }
  const { data } = await supa
    .from("follows")
    .select("following_id")
    .eq("follower_id", currentUser.id);
  _followingCache = new Set((data || []).map((r) => r.following_id));
}

function _isFollowing(userId) {
  return _followingCache?.has(userId) ?? false;
}

/* ══════════════════════════════════════════════════════════════
   ENTRY POINT
══════════════════════════════════════════════════════════════ */
export async function initSosialScreen() {
  if (_sosialInitInProgress) return;
  _sosialInitInProgress = true;

  if (window.appReadyPromise) {
    await Promise.race([
      window.appReadyPromise,
      new Promise(r => setTimeout(r, 2000))
    ]).catch(() => {});
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    _renderGuest();
    _sosialInitInProgress = false;
    return;
  }

  _leaderboardCache = null;
  _myRank = null;
  _rankList = [];
  _lastLoadedPeriod = null;

  try {
    _ensureXPDOM();
    _renderSkeleton();

    // Jalankan fetch dengan timeout 15 detik
    await Promise.race([
      (async () => {
        await _loadMyFollowing();
        await _loadXPLeaderboard(_activePeriod);
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Fetch Timeout")), 15000))
    ]);
  } catch (e) {
    console.error("initSosialScreen error:", e);
    // Bug #6: Only write to DOM if screen is still active
    if (document.getElementById("sosial-screen")?.classList.contains("active")) {
      const listEl = document.getElementById("xp-leaderboard-list");
      if (listEl) {
        listEl.innerHTML = `
          <div class="sosial-empty">
            <div class="sosial-empty-icon">⚠️</div>
            <div>Gagal memuat data sosial.<br><small>Pastikan koneksi internet stabil.</small></div>
            <button class="sosial-guest-btn" style="margin-top:20px;" onclick="window.retrySosialInit()">Coba Lagi</button>
          </div>`;
      }
    }
  } finally {
    _sosialInitInProgress = false;
  }
}

export function retrySosialInit() {
  _sosialInitInProgress = false;
  initSosialScreen();
}


/* ══════════════════════════════════════════════════════════════
   DOM STRUCTURE
══════════════════════════════════════════════════════════════ */
function _ensureXPDOM() {
  const bannersEl = document.getElementById("sosial-banners");
  if (bannersEl) bannersEl.style.display = "";
  const scroll = document.getElementById("sosial-scroll");
  if (!scroll) return;
  const followContent = document.getElementById("sosial-follow-content");
  if (followContent) followContent.remove();
  if (document.getElementById("xp-leaderboard-list")) return;
  const listWrap = document.createElement("div");
  listWrap.id = "xp-list-wrap";
  listWrap.innerHTML = `
    <div class="sosial-leaderboard-header">
      <div class="lb-hd-title">LIGA SAAT INI</div>
      <div class="sosial-tier-selector">
        <button class="tier-selector-btn" onclick="window.toggleTierDropdown()">
          <span class="tier-dot"></span>
          <span id="selected-tier-name">🌱 苗 Miáo</span>
          <span class="tier-selector-arrow">▾</span>
        </button>
        <div id="tier-dropdown" class="tier-dropdown" style="display:none;">
          <div class="tier-dropdown-item" data-tier="miao" onclick="window.selectTier('miao')">🌱 苗 Miáo</div>
          <div class="tier-dropdown-item" data-tier="mo" onclick="window.selectTier('mo')">✍️ 墨 Mò</div>
          <div class="tier-dropdown-item" data-tier="shu" onclick="window.selectTier('shu')">📜 书 Shū</div>
          <div class="tier-dropdown-item" data-tier="hua" onclick="window.selectTier('hua')">🌸 花 Huā</div>
          <div class="tier-dropdown-item" data-tier="zhu" onclick="window.selectTier('zhu')">🎋 竹 Zhú</div>
          <div class="tier-dropdown-item" data-tier="shi" onclick="window.selectTier('shi')">🦁 狮 Shī</div>
          <div class="tier-dropdown-item" data-tier="long" onclick="window.selectTier('long')">🐉 龙 Lóng</div>
          <div class="tier-dropdown-item" data-tier="yuhuang" onclick="window.selectTier('yuhuang')">🐲 玉皇 Yùhuáng</div>
        </div>
      </div>
    </div>
    <div id="xp-leaderboard-list"></div>`;
  scroll.appendChild(listWrap);
}

function _ensureFollowDOM() {
  const scroll = document.getElementById("sosial-scroll");
  if (!scroll) return;
  const bannersEl = document.getElementById("sosial-banners");
  if (bannersEl) bannersEl.style.display = "none";
  scroll.innerHTML = `<div id="sosial-follow-content"></div>`;
}

/* ══════════════════════════════════════════════════════════════
   TAB SWITCHING
══════════════════════════════════════════════════════════════ */
export function sosialSwitchTab(tab) {
  _activeTab = tab;
  document.querySelectorAll(".sosial-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  const bannersEl = document.getElementById("sosial-banners");
  if (bannersEl) bannersEl.style.display = tab === "follow" ? "none" : "";
  if (tab === "xp") {
    _ensureXPDOM();
    const needReload =
      !_leaderboardCache || _lastLoadedPeriod !== _activePeriod;
    if (needReload) {
      _renderSkeleton();
      _loadXPLeaderboard(_activePeriod);
    } else _renderXPLeaderboard();
  } else if (tab === "follow") {
    _ensureFollowDOM();
    _renderFollowTabs("following");
  }
}

export function sosialSwitchPeriod(period, el) {
  _activePeriod = period;
  document.querySelectorAll(".period-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.period === period);
  });
  if (_activeTab === "xp") {
    _ensureXPDOM();
    _renderSkeleton();
    _loadXPLeaderboard(period);
  }
}

/* ══════════════════════════════════════════════════════════════
   FOLLOW TABS
══════════════════════════════════════════════════════════════ */
function _renderFollowTabs(activeSubTab = "following") {
  const container = document.getElementById("sosial-follow-content");
  if (!container) return;
  container.innerHTML = `
    <div class="follow-tabs">
      <button class="follow-tab-btn ${activeSubTab === "following" ? "active" : ""}" onclick="window._switchFollowTab('following')">Mengikuti</button>
      <button class="follow-tab-btn ${activeSubTab === "followers" ? "active" : ""}" onclick="window._switchFollowTab('followers')">Pengikut</button>
    </div>
    <div id="follow-list-content">
      <div class="sosial-loading"><span class="spinner"></span> Memuat...</div>
    </div>`;
  _loadFollowList(activeSubTab);
}

export function _switchFollowTab(subTab) {
  document.querySelectorAll(".follow-tab-btn").forEach((btn) => {
    btn.classList.toggle(
      "active",
      btn.textContent
        .toLowerCase()
        .includes(subTab === "following" ? "mengikuti" : "pengikut"),
    );
  });
  const content = document.getElementById("follow-list-content");
  if (content)
    content.innerHTML =
      '<div class="sosial-loading"><span class="spinner"></span> Memuat...</div>';
  _loadFollowList(subTab);
}

async function _loadFollowList(subTab) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  const content = document.getElementById("follow-list-content");
  if (!content) return;
  try {
    let userIds = [];
    if (subTab === "following") {
      const { data } = await supa
        .from("follows")
        .select("following_id")
        .eq("follower_id", currentUser.id);
      userIds = (data || []).map((r) => r.following_id);
    } else {
      const { data } = await supa
        .from("follows")
        .select("follower_id")
        .eq("following_id", currentUser.id);
      userIds = (data || []).map((r) => r.follower_id);
    }
    if (userIds.length === 0) {
      content.innerHTML = `<div class="sosial-empty"><div class="sosial-empty-icon">${subTab === "following" ? "🔍" : "👥"}</div><div>${subTab === "following" ? "Belum mengikuti siapapun.<br>Cari pengguna di leaderboard." : "Belum ada yang mengikutimu."}</div></div>`;
      return;
    }
    const [{ data: profiles }, { data: scores }, { data: streakRows }] =
      await Promise.all([
        supa
          .from("user_profile")
          .select("user_id, display_name, selected_avatar, custom_avatar_url")
          .in("user_id", userIds),
        supa
          .from("user_scores")
          .select("user_id, score, type")
          .in("user_id", userIds),
        supa
          .from("daily_streaks")
          .select("user_id, date")
          .in("user_id", userIds)
          .order("date", { ascending: false }),
      ]);
    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const rowsByUser = new Map();
    (scores || []).forEach((s) => {
      if (!rowsByUser.has(s.user_id)) rowsByUser.set(s.user_id, []);
      rowsByUser.get(s.user_id).push({ type: s.type, score: s.score });
    });
    const datesByUser = new Map();
    (streakRows || []).forEach((r) => {
      if (!datesByUser.has(r.user_id)) datesByUser.set(r.user_id, []);
      datesByUser.get(r.user_id).push(r.date);
    });
    const users = userIds
      .map((uid) => {
        const profile = profileMap.get(uid) || {};
        return {
          user_id: uid,
          display_name: profile.display_name || "Pelajar",
          selected_avatar: profile.selected_avatar || null,
          custom_avatar_url: profile.custom_avatar_url || null,
          xp: calcXPFromRows(rowsByUser.get(uid) || []),
          streak: _calcStreak(datesByUser.get(uid) || []),
        };
      })
      .sort((a, b) => b.xp - a.xp);

    let html = `<div class="sosial-friends-section">`;
    users.forEach((u, idx) => {
      const avatarHtml = _getAvatarChar(
        u.selected_avatar,
        u.display_name,
        u.custom_avatar_url,
      );
      const gelar = _getGelarByXP(u.xp);
      const streakPill =
        u.streak > 0
          ? `<span class="streak-pill"><span class="streak-pill-dot"></span>${u.streak} hari streak</span>`
          : `<span class="streak-pill cold"><span class="streak-pill-dot"></span>Bergabung</span>`;
      const isMe = u.user_id === currentUser?.id;
      const isFollowingUser = _isFollowing(u.user_id);
      const followBtn = isMe
        ? ""
        : isFollowingUser
          ? `<button class="sfl-follow-btn following" onclick="event.stopPropagation();window._toggleFollowFromList('${u.user_id}', true, this)">✓ Mengikuti</button>`
          : `<button class="sfl-follow-btn add" onclick="event.stopPropagation();window._toggleFollowFromList('${u.user_id}', false, this)">＋ Ikuti</button>`;
      html += `<div class="sosial-f-card ${isMe ? "is-me-card" : ""}" ${isMe ? "" : `onclick="window._openUserPopup('${u.user_id}')"`}>
        <div class="sosial-f-rank">${idx + 1}</div>
        <div class="sosial-f-avatar">${avatarHtml}</div>
        <div class="sosial-f-info">
            <div class="sosial-list-name-row"><span class="sosial-f-name">${_escapeHtml(u.display_name)}</span><span class="sosial-list-gelar">${gelar?.hanzi || "初学者"}</span></div>
            <div class="sosial-f-sub">${streakPill}</div>
        </div>
        ${followBtn}
        </div>`;
    });
    html += `</div>`;
    content.innerHTML = html;
  } catch (err) {
    console.error("_loadFollowList:", err);
    content.innerHTML = `<div class="sosial-empty"><div class="sosial-empty-icon">⚠️</div><div>Gagal memuat.</div></div>`;
  }
}

/* ══════════════════════════════════════════════════════════════
   TIER FILTER
══════════════════════════════════════════════════════════════ */
export function toggleTierDropdown() {
  const dropdown = document.getElementById("tier-dropdown");
  const btn = document.querySelector(".tier-selector-btn");
  if (!dropdown || !btn) return;
  const isOpen = dropdown.style.display === "block";
  dropdown.style.display = isOpen ? "none" : "block";
  btn.classList.toggle("open", !isOpen);
}

document.addEventListener("click", function (e) {
  const selector = document.querySelector(".sosial-tier-selector");
  if (!selector || selector.contains(e.target)) return;
  const dropdown = document.getElementById("tier-dropdown");
  const btn = document.querySelector(".tier-selector-btn");
  if (dropdown) dropdown.style.display = "none";
  if (btn) btn.classList.remove("open");
});

const _tierLabelMap = {
  yuhuang: "🐲 玉皇 Yùhuáng",
  long: "🐉 龙 Lóng",
  shi: "🦁 狮 Shī",
  zhu: "🎋 竹 Zhú",
  hua: "🌸 花 Huā",
  shu: "📜 书 Shū",
  mo: "✍️ 墨 Mò",
  miao: "🌱 苗 Miáo",
};

function _updateTierSelectorUI(tierObj) {
  const nameSpan = document.getElementById("selected-tier-name");
  if (nameSpan)
    nameSpan.textContent = _tierLabelMap[tierObj.name] || "🌱 苗 Miáo";
  document.querySelectorAll(".tier-dropdown-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.tier === tierObj.name);
  });
}

export function selectTier(tier) {
  _selectedTier = tier;
  _tierManuallySelected = true;
  _updateTierSelectorUI({ name: tier });
  const dropdown = document.getElementById("tier-dropdown");
  const btn = document.querySelector(".tier-selector-btn");
  if (dropdown) dropdown.style.display = "none";
  if (btn) btn.classList.remove("open");
  _renderXPLeaderboard();
}

function _getUsersInTier(tier) {
  if (!_leaderboardCache) return [];
  return _leaderboardCache.filter(
    (item) => _getTierByRank(item.rank, item.xp).name === tier,
  );
}

function _getTop3ForTier(tier) {
  return _getUsersInTier(tier).slice(0, 3);
}
function _getFilteredList() {
  return _getUsersInTier(_selectedTier).slice(3);
}

/* ══════════════════════════════════════════════════════════════
   LOAD XP LEADERBOARD
══════════════════════════════════════════════════════════════ */
async function _loadXPLeaderboard(period) {
  const requestId = ++_leaderboardRequestId;
  try {
    let startDate = null;
    const now = new Date();
    if (period === "week") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
    } else if (period === "month") {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
    }
    let query = supa
      .from("user_scores")
      .select("user_id, score, updated_at, type");
    if (startDate) query = query.gte("updated_at", startDate.toISOString());
    const { data: scores, error } = await query;
    if (error) throw error;

    const currentUser = getCurrentUser();
    const userScoresMap = new Map();
    if (scores) {
      scores.forEach((s) => {
        if (!userScoresMap.has(s.user_id)) userScoresMap.set(s.user_id, []);
        userScoresMap.get(s.user_id).push({ type: s.type, score: s.score });
      });
    }

    const userXPMap = new Map();
    for (const [userId, userScores] of userScoresMap.entries()) {
      userXPMap.set(userId, calcXPFromRows(userScores));
    }

    // Paksa masukkan diri sendiri jika belum ada di map (XP 0)
    if (currentUser && !userXPMap.has(currentUser.id)) {
      userXPMap.set(currentUser.id, 0);
    }

    const userIds = Array.from(userXPMap.keys());
    if (userIds.length === 0) {
      if (requestId !== _leaderboardRequestId) return;
      _leaderboardCache = [];
      _myRank = null;
      _rankList = [];
      _lastLoadedPeriod = period;
      _renderXPLeaderboardEmpty();
      return;
    }

    const [{ data: profiles }, streakData] = await Promise.all([
      supa
        .from("user_profile")
        .select("user_id, display_name, selected_avatar, custom_avatar_url")
        .in("user_id", userIds),
      supa
        .from("daily_streaks")
        .select("user_id, date")
        .in("user_id", userIds)
        .order("date", { ascending: false }),
    ]);
    const profileMap = new Map();
    (profiles || []).forEach((p) => profileMap.set(p.user_id, p));
    const streakMap = new Map();
    if (streakData.data && streakData.data.length > 0) {
      const datesByUser = new Map();
      streakData.data.forEach((r) => {
        if (!datesByUser.has(r.user_id)) datesByUser.set(r.user_id, []);
        datesByUser.get(r.user_id).push(r.date);
      });
      for (const [uid, dates] of datesByUser.entries())
        streakMap.set(uid, _calcStreak(dates));
    }

    const leaderboard = [];
    for (const [userId, totalXP] of userXPMap.entries()) {
      const profile = profileMap.get(userId);
      leaderboard.push({
        user_id: userId,
        xp: totalXP,
        display_name: profile?.display_name || "Pelajar",
        selected_avatar: profile?.selected_avatar || null,
        custom_avatar_url: profile?.custom_avatar_url || null,
        streak: streakMap.get(userId) || 0,
        isMe: userId === currentUser?.id,
      });
    }
    leaderboard.sort((a, b) => b.xp - a.xp);
    leaderboard.forEach((item, idx) => (item.rank = idx + 1));
    if (requestId !== _leaderboardRequestId) return;
    _leaderboardCache = leaderboard;
    _lastLoadedPeriod = period;
    _myRank = leaderboard.find((item) => item.isMe) || null;
    _rankList = leaderboard;
    if (_myRank && !_tierManuallySelected) {
      const myTier = _getTierByRank(_myRank.rank, _myRank.xp);
      _selectedTier = myTier.name;
      _updateTierSelectorUI(myTier);
    }
    _renderXPLeaderboard();
  } catch (err) {
    if (requestId !== _leaderboardRequestId) return;
    console.error("_loadXPLeaderboard:", err);
    const listEl = document.getElementById("xp-leaderboard-list");
    if (listEl)
      listEl.innerHTML = `<div class="sosial-empty"><div class="sosial-empty-icon">⚠️</div><div>Gagal memuat leaderboard.<br><small>${_escapeHtml(err.message)}</small></div></div>`;
  }
}

/* ══════════════════════════════════════════════════════════════
   RENDER XP LEADERBOARD
══════════════════════════════════════════════════════════════ */
function _renderXPLeaderboard() {
  if (!_leaderboardCache || _leaderboardCache.length === 0) {
    _renderXPLeaderboardEmpty();
    return;
  }
  const ligaEl = document.querySelector("#sosial-banners .liga-banner");
  if (ligaEl && _myRank) {
    const tier = _getTierByRank(_myRank.rank, _myRank.xp);
    const periodLabel = _activePeriod === "week" ? "minggu ini" : "bulan ini";
    const tierUsers = _getUsersInTier(tier.name);
    ligaEl.innerHTML = `<div class="liga-icon">${tier.icon}</div><div class="liga-body"><div class="liga-name">Liga ${tier.label}</div><div class="liga-sub">${periodLabel} · Rank #${_myRank.rank} · dari ${tierUsers.length} di tier ini</div></div>`;
    _applyLigaColor(ligaEl, tier.icon);
  } else if (ligaEl) {
    ligaEl.innerHTML = "";
    ligaEl.removeAttribute("style");
  }

  const podiumEl = document.querySelector("#sosial-banners .sosial-podium");
  if (podiumEl) {
    const tierTop3 = _getTop3ForTier(_selectedTier);
    const [rank1, rank2, rank3] = [
      tierTop3[0] || null,
      tierTop3[1] || null,
      tierTop3[2] || null,
    ];
    const renderPodiumItem = (item, rankClass, medal) => {
      if (!item)
        return `<div class="podium-item ${rankClass} empty"><div class="podium-medal">${medal}</div><div class="podium-ring"><div class="podium-avatar"></div></div><div class="podium-name">—</div><div class="podium-xp">—</div><div class="podium-bar"></div></div>`;
      const avatarHtml = _getAvatarChar(
        item.selected_avatar,
        item.display_name,
        item.custom_avatar_url,
      );
      return `<div class="podium-item ${rankClass}" onclick="window._openUserPopup('${item.user_id}')"><div class="podium-medal">${medal}</div><div class="podium-ring"><div class="podium-avatar">${avatarHtml}</div></div><div class="podium-name">${_escapeHtml(item.display_name)}</div><div class="podium-xp">${item.xp.toLocaleString()} XP</div><div class="podium-bar"></div></div>`;
    };
    podiumEl.innerHTML =
      renderPodiumItem(rank2, "r2", "") +
      renderPodiumItem(rank1, "r1", "") +
      renderPodiumItem(rank3, "r3", "");
  }

  const listEl = document.getElementById("xp-leaderboard-list");
  if (!listEl) return;
  const filtered = _getFilteredList();
  if (filtered.length === 0) {
    listEl.innerHTML = `<div class="sosial-empty"><div class="sosial-empty-icon">🔍</div><div>Tidak ada pengguna di tier ini.</div></div>`;
    return;
  }
  let html = "";
  filtered.forEach((item, idx) => {
    const localRank = idx + 4;
    const avatarHtml = _getAvatarChar(
      item.selected_avatar,
      item.display_name,
      item.custom_avatar_url,
    );
    const gelar = _getGelarByXP(item.xp);
    const streakPill =
      item.streak > 0
        ? `<span class="streak-pill"><span class="streak-pill-dot"></span>${item.streak} hari streak</span>`
        : `<span class="streak-pill cold"><span class="streak-pill-dot"></span>Bergabung</span>`;
    html += `<div class="sosial-list-item ${item.isMe ? "is-me" : ""}" onclick="${item.isMe ? "" : `window._openUserPopup('${item.user_id}')`}">
      <div class="sosial-rank-num">${localRank}</div>
      <div class="sosial-av-wrap"><div class="sosial-list-avatar">${avatarHtml}</div></div>
      <div class="sosial-list-info">
        <div class="sosial-list-name-row"><span class="sosial-list-name">${_escapeHtml(item.display_name)}</span><span class="sosial-list-gelar">${gelar?.hanzi || "初学者"}</span></div>
        <div class="sosial-list-sub">${streakPill}</div>
      </div>
      <div class="sosial-list-right"><div class="sosial-list-xp-num">${item.xp.toLocaleString()}</div><div class="sosial-list-xp-lbl">XP</div></div>
    </div>`;
  });
  listEl.innerHTML = html;
}

function _renderXPLeaderboardEmpty() {
  const ligaEl = document.querySelector("#sosial-banners .liga-banner");
  const podiumEl = document.querySelector("#sosial-banners .sosial-podium");
  if (ligaEl) ligaEl.innerHTML = "";
  if (podiumEl) podiumEl.innerHTML = "";
  const listEl = document.getElementById("xp-leaderboard-list");
  if (listEl)
    listEl.innerHTML = `<div class="sosial-empty"><div class="sosial-empty-icon">📊</div><div>Belum ada data peringkat untuk periode ini.<br>Terus belajar untuk masuk leaderboard!</div></div>`;
}

function _renderSkeleton() {
  const listEl = document.getElementById("xp-leaderboard-list");
  if (!listEl) return;
  listEl.innerHTML = Array(8)
    .fill(0)
    .map(
      () =>
        `<div class="sosial-skeleton-item"><div style="width:16px;height:11px;border-radius:4px;background:var(--sur3)"></div><div style="width:38px;height:38px;border-radius:50%;background:var(--sur3)"></div><div style="flex:1"><div style="width:110px;height:11px;border-radius:4px;background:var(--sur3)"></div><div style="width:70px;height:9px;border-radius:4px;background:var(--sur3);margin-top:5px"></div></div><div style="width:32px;height:13px;border-radius:4px;background:var(--sur3)"></div></div>`,
    )
    .join("");
}

/* ══════════════════════════════════════════════════════════════
   USER PROFILE SCREEN
══════════════════════════════════════════════════════════════ */
async function _openUserPopup(userId) {
  const currentUser = getCurrentUser();
  if (!userId || userId === currentUser?.id) return;

  _userProfilePrevScreen =
    document.querySelector(".screen.active")?.id || "sosial-screen";

  const scroll = document.getElementById("user-prof-scroll");
  const titleEl = document.getElementById("user-profile-screen-title");
  const tierEl = document.getElementById("uprof-header-tier");
  if (!scroll) return;

  scroll.innerHTML = `<div class="sosial-loading" style="padding:80px 0;"><span class="spinner"></span> Memuat profil...</div>`;
  if (titleEl) titleEl.textContent = "Profile";
  const subtitleEl = document.getElementById("user-profile-screen-subtitle");
  if (subtitleEl) subtitleEl.textContent = "个人资料 — Profil Pengguna";
  if (tierEl) tierEl.innerHTML = "";

  window.showScreen("user-profile-screen");

  const isFollowing = _isFollowing(userId);
  let userData = null;
  const fromLB = _leaderboardCache?.find((u) => u.user_id === userId);
  if (fromLB) {
    userData = {
      user_id: fromLB.user_id,
      display_name: fromLB.display_name,
      selected_avatar: fromLB.selected_avatar,
      custom_avatar_url: fromLB.custom_avatar_url,
      xp: fromLB.xp,
      streak: fromLB.streak,
      rank: fromLB.rank,
      badges: [],
      kosakataCount: null,
      sesiCount: null,
      akurasi: 0,
    };
  }

  try {
    const [
      { data: prof },
      { data: scores },
      { data: streakRows },
      { count: kosakataCount },
      { count: sesiCount },
    ] = await Promise.all([
      supa
        .from("user_profile")
        .select("display_name, selected_avatar, custom_avatar_url, badges")
        .eq("user_id", userId)
        .maybeSingle(),
      supa.from("user_scores").select("score, type").eq("user_id", userId),
      supa
        .from("daily_streaks")
        .select("date")
        .eq("user_id", userId)
        .order("date", { ascending: false }),
      supa
        .from("user_card_progress")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("srs_level", 1),
      supa
        .from("user_scores")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("type", [
          "quiz",
          "kal",
          "grammar",
          "cerita_quiz",
          "hanzi",
          "cerita",
          "fc_session",
          "nada_session",
          "speaking_session",
          "tulis_session",
        ]),
    ]);

    const quizScores = (scores || []).filter((s) =>
      ["quiz", "kal", "grammar", "cerita_quiz"].includes(s.type),
    );
    const akurasi =
      quizScores.length > 0
        ? Math.round(
          quizScores.reduce((a, s) => a + (s.score || 0), 0) /
          quizScores.length,
        )
        : 0;

    if (!userData) {
      userData = {
        user_id: userId,
        display_name: prof?.display_name || "Pelajar",
        selected_avatar: prof?.selected_avatar || null,
        custom_avatar_url: prof?.custom_avatar_url || null,
        badges: prof?.badges || [],
        xp: calcXPFromRows(scores || []),
        streak: _calcStreak((streakRows || []).map((r) => r.date)),
        kosakataCount: kosakataCount ?? 0,
        sesiCount: sesiCount ?? 0,
        akurasi,
        rank: null,
      };
    } else {
      userData.badges = prof?.badges || [];
      userData.kosakataCount = kosakataCount ?? 0;
      userData.sesiCount = sesiCount ?? 0;
      userData.akurasi = akurasi;
    }
  } catch (e) {
    if (!userData) {
      userData = {
        user_id: userId,
        display_name: "Pelajar",
        selected_avatar: null,
        custom_avatar_url: null,
        badges: [],
        xp: 0,
        streak: 0,
        kosakataCount: 0,
        sesiCount: 0,
        akurasi: 0,
        rank: null,
      };
    }
  }

  let followersCount = 0,
    followingCount = 0;
  try {
    const [{ count: fc }, { count: fgc }] = await Promise.all([
      supa
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", userId),
      supa
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", userId),
    ]);
    followersCount = fc || 0;
    followingCount = fgc || 0;
  } catch (e) {
    /* ignore */
  }

  // Update header: title + tier badge
  if (titleEl) titleEl.textContent = "Profile";
  if (tierEl) {
    const tierInfo = userData.rank ? _getTierByRank(userData.rank, userData.xp) : null;
    tierEl.innerHTML = tierInfo
      ? `<span class="uprof-tier-badge">${tierInfo.icon} Liga ${tierInfo.label}</span>`
      : "";
  }

  _renderUserProfileScreen(
    scroll,
    userData,
    isFollowing,
    followersCount,
    followingCount,
  );
}

function _renderUserProfileScreen(
  scroll,
  userData,
  isFollowing,
  followersCount,
  followingCount,
) {
  const gelar = _getGelarByXP(userData.xp);
  const avatarHtml = _getAvatarChar(
    userData.selected_avatar,
    userData.display_name,
    userData.custom_avatar_url,
  );
  const userLevel =
    typeof calcLevel === "function" ? calcLevel(userData.xp) : 1;

  const SVG = {
    xp: window.SVG_STAR_XP || "⭐",
    streak: window.SVG_STREAK || "🔥",
    rank: window.SVG_RANK || "🏆",
    book: window.SVG_BOOK || "📖",
    trophy: window.SVG_TROPHY || "🥇",
    target: window.SVG_TARGET || "🎯",
  };

  const xpForNext = 500;
  const xpPrev = (userLevel - 1) * 500;
  const xpPct = Math.min(
    Math.round(((userData.xp - xpPrev) / xpForNext) * 100),
    100,
  );
  const xpLeft = xpPrev + xpForNext - userData.xp;

  const CAT_LABELS = {
    streak: "Streak",
    kosakata: "Kosakata",
    sesi: "Sesi Belajar",
    xp: "XP Level",
  };
  const unlockedIds = new Set(userData.badges || []);
  const groups = {};
  for (const b of window.BADGES || []) {
    if (!groups[b.cat]) groups[b.cat] = [];
    groups[b.cat].push(b);
  }
  let badgesHtml = "";
  for (const [cat, badges] of Object.entries(groups)) {
    const hasEarned = badges.some((b) => unlockedIds.has(b.id));
    if (!hasEarned) continue;
    badgesHtml += `<div class="prof-badge-cat-label">${CAT_LABELS[cat] || cat}</div><div class="prof-badge-row">`;
    for (const b of badges) {
      const earned = unlockedIds.has(b.id);
      badgesHtml += `<div class="prof-badge ${earned ? "earned" : "locked"}"><div class="prof-badge-icon">${b.hanzi}</div><div class="prof-badge-info"><div class="prof-badge-name">${_escapeHtml(b.label)}</div><div class="prof-badge-desc">${_escapeHtml(b.desc)}</div></div>${earned ? '<div class="prof-badge-dot"></div>' : ""}</div>`;
    }
    badgesHtml += `</div>`;
  }
  if (!badgesHtml)
    badgesHtml = `<div class="prof-badge-placeholder"><div class="prof-badge-placeholder-icon">🏅</div><div class="prof-badge-placeholder-text">Belum ada lencana diraih</div><div class="prof-badge-placeholder-sub">Pengguna ini belum memiliki lencana.</div></div>`;

  const earnedCount = (window.BADGES || []).filter((b) =>
    unlockedIds.has(b.id),
  ).length;
  const totalBadges = (window.BADGES || []).length;
  const badgeCountHtml =
    earnedCount > 0
      ? `<span class="prof-badge-count">${earnedCount} / ${totalBadges}</span>`
      : "";

  const followBtnHtml = isFollowing
    ? `<button class="upop-follow-btn following" onclick="window._userProfileUnfollow('${userData.user_id}')">✓ Mengikuti</button>`
    : `<button class="upop-follow-btn add" onclick="window._userProfileFollow('${userData.user_id}')">＋ Ikuti</button>`;

  // Hero: TANPA badge tier (sudah ada di header)
  scroll.innerHTML = `
    <div class="prof-hero">
      <div class="prof-avatar-wrap" style="cursor:default;">
        <div class="prof-avatar-ring">
          <div class="prof-avatar-inner">${avatarHtml}</div>
        </div>
        <div class="prof-level-badge">Lv ${userLevel}</div>
      </div>
      <div class="prof-name-wrap">
        <div class="prof-name" style="cursor:default;">${_escapeHtml(userData.display_name)}</div>
      </div>
      <div class="prof-gelar">${gelar?.hanzi || "初学者"} — ${gelar?.label || "Pemula"}</div>
      <div class="prof-follow-counts">
        <div class="prof-follow-stat" onclick="window._openOtherFollowSheet('${userData.user_id}', 'following')">
          <div class="prof-follow-num">${followingCount.toLocaleString()}</div>
          <div class="prof-follow-lbl">Mengikuti</div>
        </div>
        <div class="prof-follow-divider"></div>
        <div class="prof-follow-stat" onclick="window._openOtherFollowSheet('${userData.user_id}', 'followers')">
          <div class="prof-follow-num">${followersCount.toLocaleString()}</div>
          <div class="prof-follow-lbl">Pengikut</div>
        </div>
      </div>
      <div class="uprof-follow-btn-wrap">${followBtnHtml}</div>
    </div>

    <div class="prof-xp-section">
      <div class="prof-xp-label-row">
        <span class="prof-xp-label">XP Progress</span>
        <span class="prof-xp-val">${userData.xp.toLocaleString()} XP</span>
      </div>
      <div class="prof-xp-bar">
        <div class="prof-xp-fill" id="uprof-xp-fill" style="width:0%"></div>
      </div>
      <div class="prof-xp-next">${xpLeft > 0 ? `${xpLeft.toLocaleString()} XP lagi ke Level ${userLevel + 1}` : "Level Maksimum 🎉"}</div>
    </div>

    <div class="prof-stats-grid">
      <div class="prof-stat-cell"><div class="prof-stat-icon">${SVG.streak}</div><div class="prof-stat-num">${userData.streak}</div><div class="prof-stat-lbl">Hari Streak</div></div>
      <div class="prof-stat-cell"><div class="prof-stat-icon">${SVG.book}</div><div class="prof-stat-num blue">${userData.kosakataCount ?? "—"}</div><div class="prof-stat-lbl">Kosakata</div></div>
      <div class="prof-stat-cell"><div class="prof-stat-icon">${SVG.trophy}</div><div class="prof-stat-num">${userData.sesiCount ?? "—"}</div><div class="prof-stat-lbl">Sesi Belajar</div></div>
      <div class="prof-stat-cell"><div class="prof-stat-icon">${SVG.rank}</div><div class="prof-stat-num">${userData.rank ? "#" + userData.rank : "—"}</div><div class="prof-stat-lbl">Peringkat</div></div>
    </div>

    <div class="prof-section" style="border-bottom:none;">
      <div class="prof-section-header">
        <div class="prof-section-title">Lencana Diraih</div>
        ${badgeCountHtml}
      </div>
      <div class="prof-badge-grid">${badgesHtml}</div>
    </div>
    <div style="height:24px;"></div>`;

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const fill = document.getElementById("uprof-xp-fill");
      if (fill) fill.style.width = xpPct + "%";
    }),
  );
}

function _closeUserProfileScreen() {
  window.showScreen(_userProfilePrevScreen);
}

async function _userProfileFollow(userId) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  try {
    const { error } = await supa
      .from("follows")
      .insert({ follower_id: currentUser.id, following_id: userId });
    if (error) throw error;
    _followingCache?.add(userId);
    showToast("Berhasil mengikuti!", "ok");
    const btn = document.querySelector(
      ".uprof-follow-btn-wrap .upop-follow-btn",
    );
    if (btn) {
      btn.className = "upop-follow-btn following";
      btn.textContent = "✓ Mengikuti";
      btn.setAttribute("onclick", `window._userProfileUnfollow('${userId}')`);
    }
    // Update angka pengikut di profil yang sedang dibuka
    const statsEls = document.querySelectorAll(".prof-follow-stat");
    statsEls.forEach((el) => {
      if (el.querySelector(".prof-follow-lbl")?.textContent === "Pengikut") {
        const numEl = el.querySelector(".prof-follow-num");
        if (numEl)
          numEl.textContent = (
            parseInt(numEl.textContent) + 1
          ).toLocaleString();
      }
    });
    if (_activeTab === "follow") _renderFollowTabs("following");
  } catch (e) {
    showToast("Gagal mengikuti.", "err");
  }
}

async function _userProfileUnfollow(userId) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  try {
    const { error } = await supa
      .from("follows")
      .delete()
      .eq("follower_id", currentUser.id)
      .eq("following_id", userId);
    if (error) throw error;
    _followingCache?.delete(userId);
    showToast("Berhenti mengikuti.", "ok");
    const btn = document.querySelector(
      ".uprof-follow-btn-wrap .upop-follow-btn",
    );
    if (btn) {
      btn.className = "upop-follow-btn add";
      btn.textContent = "＋ Ikuti";
      btn.setAttribute("onclick", `window._userProfileFollow('${userId}')`);
    }
    // Update angka pengikut di profil yang sedang dibuka
    const statsEls = document.querySelectorAll(".prof-follow-stat");
    statsEls.forEach((el) => {
      if (el.querySelector(".prof-follow-lbl")?.textContent === "Pengikut") {
        const numEl = el.querySelector(".prof-follow-num");
        if (numEl)
          numEl.textContent = Math.max(
            0,
            parseInt(numEl.textContent) - 1,
          ).toLocaleString();
      }
    });
    if (_activeTab === "follow") _renderFollowTabs("following");
  } catch (e) {
    showToast("Gagal berhenti mengikuti.", "err");
  }
}

/* ══════════════════════════════════════════════════════════════
   OTHER USER FOLLOW SHEET
══════════════════════════════════════════════════════════════ */
async function _openOtherFollowSheet(userId, subTab = "following") {
  const old = document.getElementById("other-follow-sheet");
  if (old) old.remove();
  const sheet = document.createElement("div");
  sheet.id = "other-follow-sheet";
  sheet.innerHTML = `
    <div class="user-popup-backdrop" onclick="window._closeOtherFollowSheet()"></div>
    <div class="user-popup-box" style="max-height:80dvh;overflow-y:auto;">
      <div class="user-popup-drag-bar"></div>
      <div class="follow-tabs" style="padding:0 16px 12px;">
        <button class="follow-tab-btn ${subTab === "following" ? "active" : ""}" onclick="window._reloadOtherFollowSheet('${userId}', 'following')">Mengikuti</button>
        <button class="follow-tab-btn ${subTab === "followers" ? "active" : ""}" onclick="window._reloadOtherFollowSheet('${userId}', 'followers')">Pengikut</button>
      </div>
      <div id="other-follow-list"><div class="sosial-loading"><span class="spinner"></span> Memuat...</div></div>
    </div>`;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add("visible"));
  await _loadOtherFollowList(userId, subTab);
}

function _closeOtherFollowSheet() {
  const sheet = document.getElementById("other-follow-sheet");
  if (!sheet) return;
  sheet.classList.remove("visible");
  setTimeout(() => sheet.remove(), 280);
}

async function _reloadOtherFollowSheet(userId, subTab) {
  document
    .querySelectorAll("#other-follow-sheet .follow-tab-btn")
    .forEach((btn) => {
      const isFollowing = btn.textContent.includes("Mengikuti");
      btn.classList.toggle(
        "active",
        subTab === "following" ? isFollowing : !isFollowing,
      );
    });
  const listEl = document.getElementById("other-follow-list");
  if (listEl)
    listEl.innerHTML =
      '<div class="sosial-loading"><span class="spinner"></span> Memuat...</div>';
  await _loadOtherFollowList(userId, subTab);
}

async function _loadOtherFollowList(userId, subTab) {
  const currentUser = getCurrentUser();
  const listEl = document.getElementById("other-follow-list");
  if (!listEl) return;
  try {
    let userIds = [];
    if (subTab === "following") {
      const { data } = await supa
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId);
      userIds = (data || []).map((r) => r.following_id);
    } else {
      const { data } = await supa
        .from("follows")
        .select("follower_id")
        .eq("following_id", userId);
      userIds = (data || []).map((r) => r.follower_id);
    }
    if (userIds.length === 0) {
      listEl.innerHTML = `<div class="sosial-empty" style="padding:32px 20px;"><div class="sosial-empty-icon">${subTab === "following" ? "🔍" : "👥"}</div><div>${subTab === "following" ? "Belum mengikuti siapapun." : "Belum ada pengikut."}</div></div>`;
      return;
    }
    const [{ data: profiles }, { data: scores }, { data: streakRows }] =
      await Promise.all([
        supa
          .from("user_profile")
          .select("user_id, display_name, selected_avatar, custom_avatar_url")
          .in("user_id", userIds),
        supa
          .from("user_scores")
          .select("user_id, score, type")
          .in("user_id", userIds),
        supa
          .from("daily_streaks")
          .select("user_id, date")
          .in("user_id", userIds)
          .order("date", { ascending: false }),
      ]);
    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
    const rowsByUser = new Map();
    (scores || []).forEach((s) => {
      if (!rowsByUser.has(s.user_id)) rowsByUser.set(s.user_id, []);
      rowsByUser.get(s.user_id).push({ type: s.type, score: s.score });
    });
    const datesByUser = new Map();
    (streakRows || []).forEach((r) => {
      if (!datesByUser.has(r.user_id)) datesByUser.set(r.user_id, []);
      datesByUser.get(r.user_id).push(r.date);
    });
    const users = userIds.map((uid) => {
      const profile = profileMap.get(uid) || {};
      return {
        user_id: uid,
        display_name: profile.display_name || "Pelajar",
        selected_avatar: profile.selected_avatar || null,
        custom_avatar_url: profile.custom_avatar_url || null,
        xp: calcXPFromRows(rowsByUser.get(uid) || []),
        streak: _calcStreak(datesByUser.get(uid) || []),
      };
    });

    let html = `<div style="display:flex;flex-direction:column;gap:4px;padding:0 16px 20px;">`;
    users.forEach((u) => {
      const avatarHtml = _getAvatarChar(
        u.selected_avatar,
        u.display_name,
        u.custom_avatar_url,
      );
      const gelar = _getGelarByXP(u.xp);
      const streakPill =
        u.streak > 0
          ? `<span class="streak-pill"><span class="streak-pill-dot"></span>${u.streak} hari streak</span>`
          : `<span class="streak-pill cold"><span class="streak-pill-dot"></span>Bergabung</span>`;
      const isMe = u.user_id === currentUser?.id;
      const isFollowingUser = _isFollowing(u.user_id);
      const followBtn = isMe
        ? ""
        : isFollowingUser
          ? `<button class="sfl-follow-btn following" onclick="event.stopPropagation();window._toggleFollowFromList('${u.user_id}', true, this)">✓ Mengikuti</button>`
          : `<button class="sfl-follow-btn add" onclick="event.stopPropagation();window._toggleFollowFromList('${u.user_id}', false, this)">＋ Ikuti</button>`;
      html += `<div class="sosial-f-card ${isMe ? "is-me-card" : ""}" ${isMe ? "" : `onclick="window._closeOtherFollowSheet();setTimeout(()=>window._openUserPopup('${u.user_id}'),300)"`}>
        <div class="sosial-f-avatar">${avatarHtml}</div>
        <div class="sosial-f-info">
            <div class="sosial-list-name-row"><span class="sosial-f-name">${_escapeHtml(u.display_name)}</span><span class="sosial-list-gelar">${gelar?.hanzi || "初学者"}</span></div>
            <div class="sosial-f-sub">${streakPill}</div>
        </div>
        ${followBtn}
        </div>`;
    });
    html += `</div>`;
    listEl.innerHTML = html;
  } catch (e) {
    console.error("_loadOtherFollowList:", e);
    listEl.innerHTML = `<div class="sosial-empty" style="padding:32px;">⚠️ Gagal memuat.</div>`;
  }
}

async function _toggleFollowFromList(userId, isCurrentlyFollowing, btnEl) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  try {
    if (isCurrentlyFollowing) {
      const { error } = await supa
        .from("follows")
        .delete()
        .eq("follower_id", currentUser.id)
        .eq("following_id", userId);
      if (error) throw error;
      _followingCache?.delete(userId);
      showToast("Berhenti mengikuti.", "ok");
      btnEl.className = "sfl-follow-btn add";
      btnEl.textContent = "＋ Ikuti";
      btnEl.setAttribute(
        "onclick",
        `event.stopPropagation();window._toggleFollowFromList('${userId}', false, this)`,
      );
    } else {
      const { error } = await supa
        .from("follows")
        .insert({ follower_id: currentUser.id, following_id: userId });
      if (error) throw error;
      _followingCache?.add(userId);
      showToast("Berhasil mengikuti!", "ok");
      btnEl.className = "sfl-follow-btn following";
      btnEl.textContent = "✓ Mengikuti";
      btnEl.setAttribute(
        "onclick",
        `event.stopPropagation();window._toggleFollowFromList('${userId}', true, this)`,
      );
    }
  } catch (e) {
    showToast("Gagal.", "err");
  }
}

/* ══════════════════════════════════════════════════════════════
   GUEST
══════════════════════════════════════════════════════════════ */
function _renderGuest() {
  const container = document.getElementById("sosial-scroll");
  if (!container) return;
  container.innerHTML = `<div class="sosial-guest-wrap"><div class="sosial-guest-icon">🏆</div><div class="sosial-guest-title">Papan Peringkat</div><div class="sosial-guest-sub">Login untuk melihat peringkatmu,<br>bergabung dengan komunitas, dan mengikuti pengguna lain.</div><button class="sosial-guest-btn" onclick="window.openAuthModal()">Login / Daftar</button></div>`;
}

/* ══════════════════════════════════════════════════════════════
   EXPOSE KE WINDOW
══════════════════════════════════════════════════════════════ */
window.initSosialScreen = initSosialScreen;
window.retrySosialInit = retrySosialInit;
window.sosialSwitchTab = sosialSwitchTab;
window.sosialSwitchPeriod = sosialSwitchPeriod;
window.toggleTierDropdown = toggleTierDropdown;
window.selectTier = selectTier;
window._openUserPopup = _openUserPopup;
window._closeUserProfileScreen = _closeUserProfileScreen;
window._userProfileFollow = _userProfileFollow;
window._userProfileUnfollow = _userProfileUnfollow;
window._openOtherFollowSheet = _openOtherFollowSheet;
window._closeOtherFollowSheet = _closeOtherFollowSheet;
window._toggleFollowFromList = _toggleFollowFromList;
window._reloadOtherFollowSheet = _reloadOtherFollowSheet;
window._switchFollowTab = _switchFollowTab;
window._calcXPFromRows = calcXPFromRows;
window._calcStreak = _calcStreak;
window._getGelarByXP = _getGelarByXP;
window._isFollowing = _isFollowing;
window._getAvatarChar = _getAvatarChar; // ← BELUM ADA

window._debugSosial = {
  getMyRank: () => _myRank,
  getRankList: () => _rankList,
  getLeaderboard: () => _leaderboardCache,
};
