/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   STATISTIC.JS — Statistics Detail Views
   Dipanggil dari profile stat cells.
   Setiap cell membuka layer-statistic dengan tab yang sesuai.
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { openLayer, closeLayer } from "../core/navigation.js";
import { colorPy } from "../utilities/pinyin.js";

/* ── State ── */
let _statTab = "streak"; // streak | kosakata | sesi | peringkat
let _statCache = {};
let _statLoadId = 0;

/* ══════════════════════════════════════════════════════════════
   OPEN STAT DETAIL — Entry point dari profile cells
══════════════════════════════════════════════════════════════ */
export function openStatDetail(tab = "streak") {
  _statTab = tab;
  const layer = document.getElementById("layer-statistic");
  if (!layer) return;

  // Update header title
  const titleMap = {
    streak: "🔥 Detail Streak",
    kosakata: "📚 Detail Kosakata",
    sesi: "⏳ Sesi Belajar",
    peringkat: "🏆 Peringkat",
  };
  const titleEl = layer.querySelector(".layer-title");
  if (titleEl) titleEl.textContent = titleMap[tab] || "Statistik";

  // Update Active Tab UI
  layer.querySelectorAll(".stat-tab").forEach(el => el.classList.remove("active"));
  const activeTab = document.getElementById(`tab-stat-${tab}`);
  if (activeTab) activeTab.classList.add("active");

  // HANYA panggil openLayer jika layer BELUM aktif
  // Supaya tidak menumpuk history stack saat ganti tab internal
  if (!layer.classList.contains("active")) {
    openLayer("layer-statistic");
  }

  _renderStatContent();
}

/* ══════════════════════════════════════════════════════════════
   RENDER — Dispatch ke tab yang sesuai
══════════════════════════════════════════════════════════════ */
async function _renderStatContent() {
  const container = document.getElementById("stat-content");
  if (!container) return;

  const myId = ++_statLoadId;
  container.innerHTML = '<div class="stat-loading"><span class="spinner"></span></div>';

  try {
    switch (_statTab) {
      case "streak":
        await _renderStreakTab(container, myId);
        break;
      case "kosakata":
        await _renderKosakataTab(container, myId);
        break;
      case "sesi":
        await _renderSesiTab(container, myId);
        break;
      case "peringkat":
        await _renderPeringkatTab(container, myId);
        break;
    }
  } catch (e) {
    if (myId !== _statLoadId) return;
    console.error("[Stat] Error:", e);
    container.innerHTML = '<div class="stat-empty"><div class="stat-empty-icon">⚠️</div>Gagal memuat data.</div>';
  }
}

/* ══════════════════════════════════════════════════════════════
   TAB 1: STREAK
══════════════════════════════════════════════════════════════ */
async function _renderStreakTab(container, myId) {
  const user = getCurrentUser();
  if (!user) { container.innerHTML = '<div class="stat-empty"><div class="stat-empty-icon">🔒</div>Login untuk melihat streak</div>'; return; }

  const { data: streakRows } = await supa
    .from("daily_streaks")
    .select("date")
    .eq("user_id", user.id)
    .order("date", { ascending: false })
    .limit(90);

  if (myId !== _statLoadId) return;

  const dates = (streakRows || []).map(r => r.date);
  const currentStreak = typeof window._currentStreak !== "undefined" ? window._currentStreak : 0;
  const bestStreak = _calcBestStreak(dates);
  const totalDays = dates.length;

  // Weekly heatmap
  const today = new Date();
  const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
  let heatmapHtml = "";
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString("en-CA");
    const active = dates.includes(dateStr);
    const isToday = i === 0;
    const lvClass = active ? "lv2" : "";
    heatmapHtml += `
      <div class="stat-heat-day">
        <div class="stat-heat-block ${lvClass}">${active ? "✓" : "—"}</div>
        <div class="stat-heat-label">${isToday ? "Hari ini" : dayNames[d.getDay()]}</div>
      </div>`;
  }

  container.innerHTML = `
    <div class="stat-hero">
      <div class="stat-hero-icon">🔥</div>
      <div class="stat-hero-num">${currentStreak}</div>
      <div class="stat-hero-label">Hari Streak Saat Ini</div>
      <div class="stat-hero-sub">Rekor terbaik: ${bestStreak} hari</div>
    </div>

    <div class="stat-section">
      <div class="stat-section-title">Aktivitas 7 Hari Terakhir</div>
      <div class="stat-heatmap">${heatmapHtml}</div>
    </div>

    <div class="stat-section">
      <div class="stat-section-title">Ringkasan</div>
      <div class="stat-cat-grid">
        <div class="stat-cat-card mature">
          <div class="stat-cat-num">${currentStreak}</div>
          <div class="stat-cat-name">Streak Aktif</div>
        </div>
        <div class="stat-cat-card learning">
          <div class="stat-cat-num">${bestStreak}</div>
          <div class="stat-cat-name">Rekor Terbaik</div>
        </div>
        <div class="stat-cat-card neww">
          <div class="stat-cat-num">${totalDays}</div>
          <div class="stat-cat-name">Total Hari Aktif</div>
        </div>
        <div class="stat-cat-card critical">
          <div class="stat-cat-num">${totalDays > 0 ? Math.round((totalDays / 90) * 100) : 0}%</div>
          <div class="stat-cat-name">Konsistensi (90 hari)</div>
        </div>
      </div>
    </div>`;
}

function _calcBestStreak(sortedDates) {
  if (!sortedDates.length) return 0;
  const dateSet = new Set(sortedDates);
  let best = 0, current = 0, prev = null;

  const sorted = [...dateSet].sort();
  for (const d of sorted) {
    const date = new Date(d);
    if (prev) {
      const diff = (date - prev) / (1000 * 60 * 60 * 24);
      current = diff === 1 ? current + 1 : 1;
    } else {
      current = 1;
    }
    best = Math.max(best, current);
    prev = date;
  }
  return best;
}

/* ══════════════════════════════════════════════════════════════
   TAB 2: KOSAKATA (Memory Health)
══════════════════════════════════════════════════════════════ */
async function _renderKosakataTab(container, myId) {
  const user = getCurrentUser();
  if (!user) { container.innerHTML = '<div class="stat-empty"><div class="stat-empty-icon">🔒</div>Login untuk melihat statistik</div>'; return; }

  // Fetch all card progress
  const { data: progress } = await supa
    .from("user_card_progress")
    .select("card_id, srs_level, interval_days, next_review, last_reviewed")
    .eq("user_id", user.id);

  if (myId !== _statLoadId) return;

  const rows = progress || [];
  const today = new Date().toLocaleDateString("en-CA");

  let mature = 0, learning = 0, critical = 0;
  const criticalCards = [];

  rows.forEach(r => {
    if (r.interval_days >= 21) {
      mature++;
    } else if (r.next_review && r.next_review < today) {
      critical++;
      criticalCards.push(r);
    } else {
      learning++;
    }
  });

  const totalCards = typeof window._globalSearchCacheCount !== "undefined"
    ? window._globalSearchCacheCount
    : (window._globalSearchCache?.length || 0);
  const newCards = Math.max(0, totalCards - rows.length);
  const reviewed = mature + learning + critical;
  const retention = reviewed > 0 ? Math.round(((mature + learning * 0.5) / reviewed) * 100) : 0;

  // Donut chart
  const C = 2 * Math.PI * 70;
  const total = mature + learning + critical + newCards || 1;

  container.innerHTML = `
    <div class="stat-donut-wrap">
      <div class="stat-donut">
        <svg viewBox="0 0 180 180">
          <circle cx="90" cy="90" r="70" stroke="var(--sur2)" stroke-width="14" fill="none"/>
          <circle id="stat-ring-mature" cx="90" cy="90" r="70" stroke="var(--green)" stroke-width="14" fill="none" stroke-dasharray="0 ${C}" stroke-linecap="round"/>
          <circle id="stat-ring-learning" cx="90" cy="90" r="70" stroke="#fb923c" stroke-width="14" fill="none" stroke-dasharray="0 ${C}" stroke-linecap="round"/>
          <circle id="stat-ring-critical" cx="90" cy="90" r="70" stroke="var(--red)" stroke-width="14" fill="none" stroke-dasharray="0 ${C}" stroke-linecap="round"/>
        </svg>
        <div class="stat-donut-center">
          <div class="stat-donut-pct">${retention}%</div>
          <div class="stat-donut-lbl">Retensi</div>
        </div>
      </div>
    </div>

    <div class="stat-section">
      <div class="stat-section-title">Kategori Kata</div>
      <div class="stat-cat-grid">
        <div class="stat-cat-card mature">
          <div class="stat-cat-num">${mature}</div>
          <div class="stat-cat-name">🟢 Matang (>21 hari)</div>
        </div>
        <div class="stat-cat-card learning">
          <div class="stat-cat-num">${learning}</div>
          <div class="stat-cat-name">🟠 Dipelajari</div>
        </div>
        <div class="stat-cat-card critical">
          <div class="stat-cat-num">${critical}</div>
          <div class="stat-cat-name">🔴 Kritis</div>
        </div>
        <div class="stat-cat-card neww">
          <div class="stat-cat-num">${newCards}</div>
          <div class="stat-cat-name">🔵 Belum Dipelajari</div>
        </div>
      </div>
    </div>

    <div class="stat-section" id="stat-critical-list"></div>`;

  // Animate donut
  requestAnimationFrame(() => {
    _setDonutRing("stat-ring-mature", 0, mature, total, C);
    _setDonutRing("stat-ring-learning", mature, learning, total, C);
    _setDonutRing("stat-ring-critical", mature + learning, critical, total, C);
  });

  // Load critical word details
  if (criticalCards.length > 0) {
    _loadCriticalWords(criticalCards.slice(0, 10), myId);
  }
}

function _setDonutRing(id, start, len, total, C) {
  const el = document.getElementById(id);
  if (!el) return;
  const dash = (len / total) * C;
  const offset = (start / total) * C;
  el.style.strokeDasharray = `${dash} ${C - dash}`;
  el.style.strokeDashoffset = `-${offset}`;
}

async function _loadCriticalWords(cards, myId) {
  const listEl = document.getElementById("stat-critical-list");
  if (!listEl || !cards.length) return;

  const cardIds = cards.map(c => c.card_id);
  const { data: cardData } = await supa
    .from("flashcard_cards")
    .select("id, hanzi, pinyin, arti")
    .in("id", cardIds);

  if (myId !== _statLoadId) return;

  if (!cardData?.length) return;

  const today = new Date();
  let html = '<div class="stat-section-title">⚠️ Perlu Review Segera</div><div class="stat-word-list">';

  cardData.forEach(card => {
    const prog = cards.find(c => c.card_id === card.id);
    const nextDate = prog?.next_review ? new Date(prog.next_review) : null;
    const daysLate = nextDate ? Math.floor((today - nextDate) / (1000 * 60 * 60 * 24)) : 0;
    const badgeClass = daysLate >= 3 ? "danger" : "warn";
    const badgeText = daysLate > 0 ? `${daysLate} hari telat` : "hari ini";

    html += `
      <div class="stat-word-row" onclick="window.searchAndOpenWord('${card.hanzi}')">
        <div class="stat-word-hz">${card.hanzi}</div>
        <div class="stat-word-info">
          <div class="stat-word-py">${colorPy(card.pinyin || "")}</div>
          <div class="stat-word-arti">${card.arti || ""}</div>
        </div>
        <div class="stat-word-badge ${badgeClass}">${badgeText}</div>
      </div>`;
  });

  html += "</div>";
  listEl.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   TAB 3: SESI BELAJAR
══════════════════════════════════════════════════════════════ */
async function _renderSesiTab(container, myId) {
  const user = getCurrentUser();
  if (!user) { container.innerHTML = '<div class="stat-empty"><div class="stat-empty-icon">🔒</div>Login untuk melihat statistik</div>'; return; }

  const { data: scores } = await supa
    .from("user_scores")
    .select("type, key, score")
    .eq("user_id", user.id);

  if (myId !== _statLoadId) return;

  const rows = scores || [];

  // Count by type
  const typeMap = {
    quiz: { label: "Quiz", icon: "📝", count: 0 },
    kal: { label: "Kalimat", icon: "📖", count: 0 },
    hanzi: { label: "Baca Hanzi", icon: "🀄", count: 0 },
    fc_session: { label: "Flashcard", icon: "🃏", count: 0 },
    grammar: { label: "Tata Bahasa", icon: "📐", count: 0 },
    cerita: { label: "Cerita", icon: "📕", count: 0 },
    nada_session: { label: "Nada", icon: "🎵", count: 0 },
    tulis_session: { label: "Tulis Hanzi", icon: "✍️", count: 0 },
    speaking_session: { label: "Speaking", icon: "🎙️", count: 0 },
  };

  let totalSesi = 0;
  rows.forEach(r => {
    if (typeMap[r.type]) {
      typeMap[r.type].count++;
      totalSesi++;
    }
  });

  const types = Object.values(typeMap).filter(t => t.count > 0);
  types.sort((a, b) => b.count - a.count);

  let typeListHtml = "";
  types.forEach(t => {
    typeListHtml += `
      <div class="stat-type-row">
        <div class="stat-type-icon">${t.icon}</div>
        <div class="stat-type-info">
          <div class="stat-type-name">${t.label}</div>
          <div class="stat-type-sub">${t.count} sesi selesai</div>
        </div>
        <div class="stat-type-num">${t.count}</div>
      </div>`;
  });

  if (!typeListHtml) {
    typeListHtml = '<div class="stat-empty"><div class="stat-empty-icon">📭</div>Belum ada sesi belajar</div>';
  }

  container.innerHTML = `
    <div class="stat-hero">
      <div class="stat-hero-icon">⏳</div>
      <div class="stat-hero-num">${totalSesi}</div>
      <div class="stat-hero-label">Total Sesi Selesai</div>
      <div class="stat-hero-sub">${types.length} jenis aktivitas</div>
    </div>

    <div class="stat-section">
      <div class="stat-section-title">Rincian per Aktivitas</div>
      <div class="stat-type-list">${typeListHtml}</div>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   TAB 4: PERINGKAT (Leaderboard mini)
══════════════════════════════════════════════════════════════ */
async function _renderPeringkatTab(container, myId) {
  const user = getCurrentUser();
  if (!user) { container.innerHTML = '<div class="stat-empty"><div class="stat-empty-icon">🔒</div>Login untuk melihat peringkat</div>'; return; }

  // Pakai cache leaderboard dari sosial.js
  let rows = window._debugSosial?.getLeaderboard?.() || [];

  // Jika cache kosong, bangun dari user_scores
  if (!rows.length) {
    const { data: scoreData } = await supa
      .from("user_scores")
      .select("user_id, score")
      .order("score", { ascending: false });

    if (myId !== _statLoadId) return;

    if (scoreData?.length) {
      // Aggregate XP per user
      const userXP = {};
      scoreData.forEach(r => { userXP[r.user_id] = (userXP[r.user_id] || 0) + r.score; });

      // Fetch display names
      const userIds = Object.keys(userXP);
      const { data: profiles } = await supa
        .from("user_profile")
        .select("user_id, display_name")
        .in("user_id", userIds.slice(0, 50));

      if (myId !== _statLoadId) return;

      const nameMap = {};
      (profiles || []).forEach(p => { nameMap[p.user_id] = p.display_name; });

      rows = Object.entries(userXP)
        .map(([uid, xp]) => ({ user_id: uid, xp, display_name: nameMap[uid] || "Pelajar" }))
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 20);
    }
  }

  if (myId !== _statLoadId) return;

  const myRank = rows.findIndex(r => r.user_id === user.id) + 1;

  let listHtml = "";
  rows.forEach((r, i) => {
    const rank = i + 1;
    const isMe = r.user_id === user.id;
    const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
    const xp = r.xp ?? r.total_xp ?? 0;
    const nameColor = isMe ? "color:var(--gold);font-weight:700;" : "";

    listHtml += `
      <div class="stat-type-row" style="${isMe ? "border:1px solid rgba(232,201,109,0.2);background:rgba(232,201,109,0.04);" : ""}">
        <div class="stat-type-icon" style="font-size:16px;min-width:32px;text-align:center;">${medal}</div>
        <div class="stat-type-info">
          <div class="stat-type-name" style="${nameColor}">${r.display_name || "Pelajar"}${isMe ? " (Kamu)" : ""}</div>
        </div>
        <div class="stat-type-num" style="font-size:13px;color:var(--gold);">${xp.toLocaleString()} XP</div>
      </div>`;
  });

  if (!listHtml) {
    listHtml = '<div class="stat-empty"><div class="stat-empty-icon">🏆</div>Belum ada data leaderboard</div>';
  }

  container.innerHTML = `
    <div class="stat-hero">
      <div class="stat-hero-icon">🏆</div>
      <div class="stat-hero-num">${myRank > 0 ? "#" + myRank : "--"}</div>
      <div class="stat-hero-label">Peringkat Kamu</div>
      <div class="stat-hero-sub">dari ${rows.length} pelajar</div>
    </div>

    <div class="stat-section">
      <div class="stat-section-title">Leaderboard</div>
      <div class="stat-type-list">${listHtml}</div>
    </div>`;
}

/* ── Expose ke window ── */
window.openStatDetail = openStatDetail;
