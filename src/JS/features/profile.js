/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   PROFILE.JS — Profile Screen
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser, doLogout, validateDisplayName } from "../core/auth.js";
import { getActiveAvatarUrl, initAvatarSystem } from "./avatar.js";
import { calcLevel, TITLES, BADGES } from "../core/level.js";
import { showToast } from "../utilities/helpers.js";
import { fetchUserStats } from "../utilities/stats-api.js";

import {
  SVG_CAMERA,
  SVG_STREAK,
  SVG_STAR_XP,
  SVG_BOOK,
  SVG_TROPHY,
  SVG_TARGET,
  SVG_RANK,
  SVG_LOGOUT,
} from "../../assets/icon.js";

/* ── State ── */
let _profLoaded = false;
let _profInitInProgress = false; // guard: cegah concurrent init
let _profData = null;
let _profStats = {};
let _profFollowCounts = { followers: 0, following: 0 };

/* ══════════════════════════════════════════
   ENTRY POINT
══════════════════════════════════════════ */
export async function initProfileScreen() {
  if (_profInitInProgress) return; // cegah concurrent init
  _profInitInProgress = true;

  // Tunggu app init selesai agar auth & keys siap
  try {
    if (window.appReadyPromise) {
      // Timeout 10 detik untuk app ready
      await Promise.race([
        window.appReadyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error("App Ready Timeout")), 10000))
      ]);
    }
  } catch (e) {
    console.error("Profile: App ready timeout/error", e);
  }

  _profSetHeaderLogoutBtn();
  const currentUser = getCurrentUser();
  if (!currentUser) {
    _renderProfileGuest();
    _profInitInProgress = false;
    return;
  }

  _renderProfileSkeleton();

  try {
    // Gunakan timeout untuk keseluruhan fetch agar tidak stuck skeleton
    await Promise.race([
      Promise.all([
        _loadProfileData(),
        _loadProfileStats(),
        _loadFollowCounts(),
        initAvatarSystem(),
      ]),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Fetch Timeout")), 12000))
    ]);
  } catch (e) {
    console.error("initProfileScreen error:", e);
    // Jika error, pastikan stats minimal terisi agar tidak crash saat render
    if (!_profStats.xp) {
      _profStats = { xp: 0, level: 1, kosakataCount: 0, sesiCount: 0, akurasi: 0, rank: "--", streak: 0 };
    }
  } finally {
    _profInitInProgress = false;
    _renderProfileFull();
  }
}

/* ══════════════════════════════════════════
   DATA LOADING
══════════════════════════════════════════ */

async function _loadProfileData() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  try {
    const { data, error } = await supa
      .from("user_profile")
      .select("display_name, selected_avatar, badges, title_id") // tambah badges & title_id
      .eq("user_id", currentUser.id)
      .maybeSingle();
    _profData = !error && data ? data : {};

    // Sync ke window._profileCache supaya _buildBadgesHTML bisa baca
    if (!window._profileCache) window._profileCache = {};
    window._profileCache.badges = _profData.badges || [];
    window._profileCache.title_id = _profData.title_id || null;
  } catch (e) {
    console.error("_loadProfileData:", e);
    _profData = {};
  }
}
async function _loadProfileStats() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  try {
    const stats = await fetchUserStats();

    if (!stats) {
      _profStats = {
        xp: 0,
        level: 1,
        kosakataCount: 0,
        sesiCount: 0,
        akurasi: 0,
        rank: "--",
        streak: 0,
      };
      return;
    }

    const { xp, rank, akurasi, sesiCount, kosakataCount } = stats;
    const level = calcLevel(xp);
    const streak =
      typeof window._currentStreak !== "undefined" ? window._currentStreak : 0;

    _profStats = {
      xp,
      level,
      kosakataCount,
      sesiCount,
      akurasi,
      rank: rank > 0 ? `#${rank}` : "--",
      streak,
    };
  } catch (e) {
    console.error("_loadProfileStats:", e);
    _profStats = {
      xp: 0,
      level: 1,
      kosakataCount: 0,
      sesiCount: 0,
      akurasi: 0,
      rank: "--",
      streak: 0,
    };
  }
}

async function _loadFollowCounts() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  try {
    const [{ count: followers }, { count: following }] = await Promise.all([
      supa
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", currentUser.id),
      supa
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", currentUser.id),
    ]);
    _profFollowCounts = {
      followers: followers || 0,
      following: following || 0,
    };
  } catch (e) {
    console.error("_loadFollowCounts:", e);
  }
}

/* ══════════════════════════════════════════
   RENDER HELPERS
══════════════════════════════════════════ */

function _renderProfileGuest() {
  const scroll = document.getElementById("prof-scroll");
  if (!scroll) return;
  scroll.innerHTML = `
    <div class="prof-guest-wrap">
      <div class="prof-guest-icon">🌟</div>
      <div class="prof-guest-title">Belum Login</div>
      <div class="prof-guest-sub">Login untuk melihat profil, lencana,<br>dan progress belajarmu.</div>
      <button class="prof-guest-btn" onclick="window.openAuthModal()">Login / Daftar</button>
    </div>`;
}

function _renderProfileSkeleton() {
  const scroll = document.getElementById("prof-scroll");
  if (!scroll) return;
  scroll.innerHTML = `
    <div class="prof-hero">
      <div style="width:76px;height:76px;border-radius:50%;" class="prof-skeleton"></div>
      <div style="width:120px;height:18px;margin-top:8px;" class="prof-skeleton"></div>
      <div style="width:160px;height:12px;" class="prof-skeleton"></div>
    </div>
    <div class="prof-xp-section">
      <div style="width:100%;height:6px;" class="prof-skeleton"></div>
    </div>
    <div class="prof-stats-grid">
      ${Array(6).fill('<div class="prof-stat-cell"><div style="width:40px;height:16px;" class="prof-skeleton"></div><div style="width:56px;height:10px;margin-top:4px;" class="prof-skeleton"></div></div>').join("")}
    </div>`;
}

function _renderProfileFull() {
  const scroll = document.getElementById("prof-scroll");
  if (!scroll) return;

  const { xp, level, kosakataCount, sesiCount, akurasi, rank, streak } =
    _profStats;
  const currentUser = getCurrentUser();
  const displayName =
    _profData?.display_name || currentUser?.email?.split("@")[0] || "Pelajar";
  const email = currentUser?.email || "";
  const avatarUrl = getActiveAvatarUrl();

  const titleId = window._profileCache?.title_id || null;
  const gelar =
    titleId && TITLES
      ? TITLES.find((t) => t.id === titleId) || TITLES[0]
      : TITLES?.[0] || { hanzi: "初学者", pinyin: "Chūxuézhě" };

  const { xpForNext, xpPrev } = _xpProgressInfo(level, xp);
  const xpPct =
    xpForNext > 0 ? Math.round(((xp - xpPrev) / xpForNext) * 100) : 100;
  const xpLeft = xpForNext > 0 ? xpPrev + xpForNext - xp : 0;

  const { followers, following } = _profFollowCounts;

  scroll.innerHTML = `
    <div class="prof-hero">
      <div class="prof-avatar-wrap" onclick="window.openAvatarPicker()">
        <div class="prof-avatar-ring">
          <div class="prof-avatar-inner" id="prof-avatar-inner">
            ${avatarUrl ? `<img src="${avatarUrl}" alt="Avatar">` : `<span>${gelar?.hanzi?.[0] || "初"}</span>`}
            <div class="prof-avatar-overlay">${SVG_CAMERA}</div>
          </div>
        </div>
        <div class="prof-level-badge">Lv ${level}</div>
      </div>
      <div class="prof-name-wrap">
        <div class="prof-name" id="prof-name" onclick="window._profStartEditName()">${_escHtml(displayName)}</div>
        <input type="text" class="prof-name-input" id="prof-name-input" value="${_escHtml(displayName)}" onkeydown="if(event.key==='Enter')window._profSaveName()" maxlength="30">
        <button class="prof-name-save" id="prof-name-save" onclick="window._profSaveName()">✓</button>
      </div>
      <div class="prof-email">${_escHtml(email)}</div>
      <div class="prof-gelar">${gelar?.hanzi || "初心者"} — ${gelar?.label || "Pemula"}</div>
      <div class="prof-follow-counts">
        <div class="prof-follow-stat" onclick="window._openFollowSheet('following')">
          <div class="prof-follow-num">${following.toLocaleString()}</div>
          <div class="prof-follow-lbl">Mengikuti</div>
        </div>
        <div class="prof-follow-divider"></div>
        <div class="prof-follow-stat" onclick="window._openFollowSheet('followers')">
          <div class="prof-follow-num">${followers.toLocaleString()}</div>
          <div class="prof-follow-lbl">Pengikut</div>
        </div>
      </div>
    </div>

    <div class="prof-xp-section">
      <div class="prof-xp-label-row">
        <span class="prof-xp-label">XP Progress</span>
        <span class="prof-xp-val">${xp.toLocaleString()} XP</span>
      </div>
      <div class="prof-xp-bar">
        <div class="prof-xp-fill" id="prof-xp-fill" style="width:0%"></div>
      </div>
      <div class="prof-xp-next">${xpLeft > 0 ? `${xpLeft.toLocaleString()} XP lagi ke Level ${level + 1}` : "Level Maksimum 🎉"}</div>
    </div>

    <div class="prof-stats-grid">
      <div class="prof-stat-cell"><div class="prof-stat-icon">${SVG_STREAK}</div><div class="prof-stat-num">${streak}</div><div class="prof-stat-lbl">Hari Streak</div></div>
      <div class="prof-stat-cell"><div class="prof-stat-icon">${SVG_STAR_XP}</div><div class="prof-stat-num gold">${xp.toLocaleString()}</div><div class="prof-stat-lbl">Total XP</div></div>
      <div class="prof-stat-cell"><div class="prof-stat-icon">${SVG_BOOK}</div><div class="prof-stat-num blue">${kosakataCount}</div><div class="prof-stat-lbl">Kosakata</div></div>
      <div class="prof-stat-cell"><div class="prof-stat-icon">${SVG_TROPHY}</div><div class="prof-stat-num">${sesiCount}</div><div class="prof-stat-lbl">Sesi Belajar</div></div>
      <div class="prof-stat-cell"><div class="prof-stat-icon">${SVG_TARGET}</div><div class="prof-stat-num">${akurasi > 0 ? akurasi + "%" : "--"}</div><div class="prof-stat-lbl">Akurasi Quiz</div></div>
      <div class="prof-stat-cell"><div class="prof-stat-icon">${SVG_RANK}</div><div class="prof-stat-num">${rank}</div><div class="prof-stat-lbl">Peringkat</div></div>
    </div>

    <div class="prof-section" style="border-bottom:none">
      <div class="prof-section-header">
        <div class="prof-section-title">Lencana Diraih</div>
        ${_buildBadgeCountHTML()}
      </div>
      <div class="prof-badge-grid" id="prof-badge-grid">${_buildBadgesHTML()}</div>
    </div>
    <div style="height:16px;"></div>`;

  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const fill = document.getElementById("prof-xp-fill");
      if (fill) fill.style.width = Math.min(xpPct, 100) + "%";
    }),
  );
}

/* ══════════════════════════════════════════
   FOLLOW SHEET — daftar following/followers
══════════════════════════════════════════ */

export async function _openFollowSheet(subTab = "following") {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const old = document.getElementById("prof-follow-sheet");
  if (old) old.remove();

  const sheet = document.createElement("div");
  sheet.id = "prof-follow-sheet";
  sheet.innerHTML = `
    <div class="user-popup-backdrop" onclick="window._closeFollowSheet()"></div>
    <div class="user-popup-box" style="max-height:80dvh;overflow-y:auto;">
      <div class="user-popup-drag-bar"></div>
      <div class="follow-tabs" style="padding:0 16px 12px;">
        <button class="follow-tab-btn ${subTab === "following" ? "active" : ""}" onclick="window._reloadFollowSheet('following')">Mengikuti</button>
        <button class="follow-tab-btn ${subTab === "followers" ? "active" : ""}" onclick="window._reloadFollowSheet('followers')">Pengikut</button>
      </div>
      <div id="prof-follow-list"><div class="sosial-loading"><span class="spinner"></span> Memuat...</div></div>
    </div>`;
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add("visible"));

  await _loadFollowSheetList(subTab);
}

export function _closeFollowSheet() {
  const sheet = document.getElementById("prof-follow-sheet");
  if (!sheet) return;
  sheet.classList.remove("visible");
  setTimeout(() => sheet.remove(), 280);
}

export async function _reloadFollowSheet(subTab) {
  document
    .querySelectorAll("#prof-follow-sheet .follow-tab-btn")
    .forEach((btn) => {
      const isFollowing = btn.textContent.includes("Mengikuti");
      btn.classList.toggle(
        "active",
        subTab === "following" ? isFollowing : !isFollowing,
      );
    });
  const listEl = document.getElementById("prof-follow-list");
  if (listEl)
    listEl.innerHTML =
      '<div class="sosial-loading"><span class="spinner"></span> Memuat...</div>';
  await _loadFollowSheetList(subTab);
}

async function _loadFollowSheetList(subTab) {
  const currentUser = getCurrentUser();
  const listEl = document.getElementById("prof-follow-list");
  if (!listEl || !currentUser) return;

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
      listEl.innerHTML = `<div class="sosial-empty" style="padding:32px 20px;">
        <div class="sosial-empty-icon">${subTab === "following" ? "🔍" : "👥"}</div>
        <div>${subTab === "following" ? "Belum mengikuti siapapun." : "Belum ada pengikut."}</div>
      </div>`;
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
      const p = profileMap.get(uid) || {};
      const xp = window._calcXPFromRows
        ? window._calcXPFromRows(rowsByUser.get(uid) || [])
        : 0;
      const streak = window._calcStreak
        ? window._calcStreak(datesByUser.get(uid) || [])
        : 0;
      return {
        user_id: uid,
        display_name: p.display_name || "Pelajar",
        selected_avatar: p.selected_avatar || null,
        custom_avatar_url: p.custom_avatar_url || null,
        xp,
        streak,
      };
    });

    let html = `<div style="display:flex;flex-direction:column;gap:4px;padding:0 16px 20px;">`;
    users.forEach((u) => {
      const avatarHtml = window._getAvatarChar
        ? window._getAvatarChar(
            u.selected_avatar,
            u.display_name,
            u.custom_avatar_url,
          )
        : `<span>${(u.display_name || "?")[0]}</span>`;
      const gelar = window._getGelarByXP ? window._getGelarByXP(u.xp) : null;
      const streakPill =
        u.streak > 0
          ? `<span class="streak-pill"><span class="streak-pill-dot"></span>${u.streak} hari streak</span>`
          : `<span class="streak-pill cold"><span class="streak-pill-dot"></span>Bergabung</span>`;
      const isFollowingUser = window._isFollowing
        ? window._isFollowing(u.user_id)
        : false;
      const followBtn = isFollowingUser
        ? `<button class="sfl-follow-btn following" onclick="event.stopPropagation();window._toggleFollowFromList('${u.user_id}', true, this)">✓ Mengikuti</button>`
        : `<button class="sfl-follow-btn add" onclick="event.stopPropagation();window._toggleFollowFromList('${u.user_id}', false, this)">＋ Ikuti</button>`;
      html += `<div class="sosial-f-card" onclick="window._closeFollowSheet();setTimeout(()=>window._openUserPopup('${u.user_id}'),300)">
        <div class="sosial-f-avatar">${avatarHtml}</div>
        <div class="sosial-f-info">
          <div class="sosial-list-name-row">
            <span class="sosial-f-name">${_escHtml(u.display_name)}</span>
            <span class="sosial-list-gelar">${gelar?.hanzi || "初学者"}</span>
          </div>
          <div class="sosial-f-sub">${streakPill}</div>
        </div>
        ${followBtn}
      </div>`;
    });
    html += `</div>`;
    listEl.innerHTML = html;
  } catch (e) {
    console.error("_loadFollowSheetList:", e);
    if (listEl)
      listEl.innerHTML = `<div class="sosial-empty" style="padding:32px;">⚠️ Gagal memuat.</div>`;
  }
}

/* ══════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════ */

function _xpProgressInfo(level, xp) {
  if (typeof window.XP_PER_LEVEL !== "undefined") {
    const xpPrev = window.XP_PER_LEVEL[level - 1] || 0;
    const xpNext = window.XP_PER_LEVEL[level] || 0;
    return { xpForNext: xpNext - xpPrev, xpPrev };
  }
  const xpPrev = (level - 1) * 500;
  return { xpForNext: 500, xpPrev };
}

function _buildBadgeCountHTML() {
  if (!BADGES || !Array.isArray(BADGES)) return "";
  const unlockedIds = new Set(window._profileCache?.badges || []);
  const earned = BADGES.filter((b) => unlockedIds.has(b.id)).length;
  if (earned === 0) return "";
  return `<span class="prof-badge-count">${earned} / ${BADGES.length}</span>`;
}

function _buildBadgesHTML() {
  if (!BADGES || !Array.isArray(BADGES)) {
    return '<div class="prof-empty">Data lencana tidak tersedia.</div>';
  }

  const unlockedIds = new Set(window._profileCache?.badges || []);
  const earnedCount = BADGES.filter((b) => unlockedIds.has(b.id)).length;

  if (earnedCount === 0) {
    return `<div class="prof-badge-placeholder"><div class="prof-badge-placeholder-icon">🏅</div><div class="prof-badge-placeholder-text">Belum ada lencana diraih</div><div class="prof-badge-placeholder-sub">Terus belajar untuk membuka lencana pertamamu!</div></div>`;
  }

  const CAT_LABELS = {
    streak: "Streak",
    kosakata: "Kosakata",
    sesi: "Sesi Belajar",
    xp: "XP Level",
  };

  const groups = {};
  for (const b of BADGES) {
    if (!groups[b.cat]) groups[b.cat] = [];
    groups[b.cat].push(b);
  }

  let html = "";
  for (const [cat, badges] of Object.entries(groups)) {
    const hasEarned = badges.some((b) => unlockedIds.has(b.id));
    if (!hasEarned) continue;
    html += `<div class="prof-badge-cat-label">${CAT_LABELS[cat] || cat}</div>`;
    html += '<div class="prof-badge-row">';
    for (const b of badges) {
      const earned = unlockedIds.has(b.id);
      html += `<div class="prof-badge ${earned ? "earned" : "locked"}" title="${b.label}: ${b.desc}"><div class="prof-badge-icon">${b.hanzi}</div><div class="prof-badge-info"><div class="prof-badge-name">${b.label}</div><div class="prof-badge-desc">${b.desc}</div></div>${earned ? '<div class="prof-badge-dot"></div>' : ""}</div>`;
    }
    html += "</div>";
  }
  return html;
}

function _escHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ══════════════════════════════════════════
   EDIT NAMA INLINE
══════════════════════════════════════════ */

export function _profStartEditName() {
  const nameEl = document.getElementById("prof-name");
  const inputEl = document.getElementById("prof-name-input");
  const saveEl = document.getElementById("prof-name-save");
  if (!nameEl || !inputEl) return;
  nameEl.style.display = "none";
  inputEl.style.display = "block";
  saveEl.style.display = "block";
  inputEl.value = nameEl.textContent.trim();
  inputEl.focus();
  inputEl.select();
}

export async function _profSaveName() {
  const currentUser = getCurrentUser();
  const nameEl = document.getElementById("prof-name");
  const inputEl = document.getElementById("prof-name-input");
  const saveEl = document.getElementById("prof-name-save");
  if (!inputEl || !currentUser) return;

  const validation = validateDisplayName(inputEl.value);
  if (!validation.ok) {
    showToast(validation.message, "warn");
    return;
  }
  const newName = validation.value;

  if (nameEl) nameEl.textContent = newName;
  inputEl.style.display = "none";
  saveEl.style.display = "none";
  if (nameEl) nameEl.style.display = "block";

  try {
    const { error } = await supa.from("user_profile").upsert(
      {
        user_id: currentUser.id,
        display_name: newName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) throw error;
    showToast("Nama disimpan!", "ok");
  } catch (e) {
    console.error("_profSaveName:", e);
    showToast("Gagal menyimpan nama.", "err");
  }
}

/* ══════════════════════════════════════════
   LOGOUT
══════════════════════════════════════════ */

function _profDoLogout() {
  _profShowLogoutConfirm();
}

function _profShowLogoutConfirm() {
  const old = document.getElementById("prof-logout-modal");
  if (old) old.remove();

  const modal = document.createElement("div");
  modal.id = "prof-logout-modal";
  modal.innerHTML = `
    <div class="prof-modal-backdrop" onclick="window._profHideLogoutConfirm()"></div>
    <div class="prof-modal-box">
      <div class="prof-modal-icon">${SVG_LOGOUT}</div>
      <div class="prof-modal-title">Keluar?</div>
      <div class="prof-modal-sub">Kamu yakin ingin logout dari akun ini?</div>
      <div class="prof-modal-actions">
        <button class="prof-modal-cancel" onclick="window._profHideLogoutConfirm()">Batal</button>
        <button class="prof-modal-confirm" onclick="window._profConfirmLogout()">Logout</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("visible"));
}

function _profHideLogoutConfirm() {
  const modal = document.getElementById("prof-logout-modal");
  if (!modal) return;
  modal.classList.remove("visible");
  setTimeout(() => modal.remove(), 200);
}

function _profConfirmLogout() {
  _profHideLogoutConfirm();
  doLogout();
}

function _profSetHeaderLogoutBtn() {
  const btn = document.querySelector("#profile-screen .prof-edit-btn");
  if (!btn) return;
  btn.title = "Logout";
  btn.setAttribute("onclick", "window._profDoLogout()");
  btn.innerHTML = SVG_LOGOUT;
}

/* ══════════════════════════════════════════
   RESET SAAT LOGOUT
══════════════════════════════════════════ */

export function resetProfileCache() {
  _profLoaded = false;
  _profInitInProgress = false;
  _profData = null;
  _profStats = {};
  _profFollowCounts = { followers: 0, following: 0 };
}

/* ── Expose ke window ── */
window.initProfileScreen = initProfileScreen;
window.resetProfileCache = resetProfileCache;
window._profDoLogout = _profDoLogout;
window._profShowLogoutConfirm = _profShowLogoutConfirm;
window._profHideLogoutConfirm = _profHideLogoutConfirm;
window._profConfirmLogout = _profConfirmLogout;
window._profStartEditName = _profStartEditName;
window._profSaveName = _profSaveName;
window._openFollowSheet = _openFollowSheet;
window._closeFollowSheet = _closeFollowSheet;
window._reloadFollowSheet = _reloadFollowSheet;
