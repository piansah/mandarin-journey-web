/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   PETUALANGAN.JS — Core: state, fetch, snake path, render utama
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showScreen } from "../core/navigation.js";

import {
  _renderCheckpointNode,
  _renderPracticeNode,
  _renderReviewNode,
  _renderChallengeNode,
} from "./petualangan-nodes.js";
import {
  _petUnitStart,
  _pickLesson,
  _petCancelLoadingOverlay,
  _petShowLoadingOverlay,
} from "./petualangan-overlay.js";
import { _showLessonPicker, _closeLessonPicker } from "./petualangan-picker.js";
import {
  getCurrentTier,
  getTierUnlocked,
  setCurrentTier,
  setTierUnlocked,
  _syncDropdownState,
  _petToggleDropdown,
  _petDropdownOutside,
  _closeDropdown,
  _petSwitchTier,
  _petSkipCancel,
  _petSkipConfirm,
  _applyTierSwitch,
} from "./petualangan-tier.js";
import {
  _getTooltipEl,
  _hideTooltip,
  _onPetualanganScroll,
  _petTooltipToggle,
  _petOutsideClick,
} from "./petualangan-tooltip.js";
import {
  unlockTier,
  loadUnlockedTiers,
  isTierUnlocked,
  getUnlockedTiers,
  TIER_ORDER,
} from "../utilities/tier-unlock.js";

/* ══════════════════════════════════════════
   STATE (internal ke file ini)
══════════════════════════════════════════ */
let _allSectionsData = [];
let _rendering = false;
const _allUnits = {};
const _allSections = {};

window._allUnits = _allUnits;
window._allSections = _allSections;

// TIER_ORDER diimport dari tier-unlock.js

// _unlockTier digantikan oleh unlockTier() dari tier-unlock.js
// yang juga sync ke semua fitur lain (kosakata, quiz, kalimat, grammar)
window._unlockTier = unlockTier;

/* ══════════════════════════════════════════
   FETCH DATA
══════════════════════════════════════════ */
async function fetchPetualanganData() {
  const currentUser = getCurrentUser();
  const currentTier = getCurrentTier();
  let tierUnlocked = getTierUnlocked();

  // ✅ Fetch sections & units hanya untuk tier aktif
  const { data: sections, error: errS } = await supa
    .from("adv_sections")
    .select("*")
    .eq("tier", currentTier)
    .order("order");

  if (errS) {
    console.error("sections fetch error:", errS);
    return null;
  }

  const sectionIds = sections.map((s) => s.id);

  const { data: units, error: errU } = await supa
    .from("adv_units")
    .select("*")
    .in("section_id", sectionIds)
    .order("order");

  if (errU) {
    console.error("units fetch error:", errU);
    return null;
  }

  // ✅ FIX #1: pakai kolom total_lessons langsung
  const lessonMaxMap = {};
  units.forEach((u) => {
    lessonMaxMap[u.id] = u.total_lessons || 0;
  });

  const progressMap = {};
  if (currentUser) {
    // ✅ Hanya ambil progress untuk unit yang relevan
    const unitIds = units.map((u) => u.id);
    const { data: progressRows, error: errP } = await supa
      .from("user_lesson_progress")
      .select("unit_id, completed_lesson_order")
      .eq("user_id", currentUser.id)
      .in("unit_id", unitIds);

    if (!errP) {
      (progressRows || []).forEach(({ unit_id, completed_lesson_order }) => {
        progressMap[unit_id] = completed_lesson_order;
      });
    }

    await loadUnlockedTiers();
    const loaded = getUnlockedTiers();
    setTierUnlocked(loaded);
    tierUnlocked = loaded;
  }

  if (!tierUnlocked.pemula) {
    setTierUnlocked({ ...tierUnlocked, pemula: true });
    tierUnlocked = { ...tierUnlocked, pemula: true };
  }

  const sortedUnits = [...units].sort((a, b) => {
    const secA = sections.find((s) => s.id === a.section_id);
    const secB = sections.find((s) => s.id === b.section_id);
    if (secA?.order !== secB?.order)
      return (secA?.order ?? 0) - (secB?.order ?? 0);
    return a.order - b.order;
  });

  const computedStatus = {};
  const tiersToUnlock = [];

  // ✅ Hanya proses tier aktif, bukan semua tier
  const tierUnits = sortedUnits; // sudah difilter by sectionIds
  for (let i = 0; i < tierUnits.length; i++) {
    const u = tierUnits[i];
    const total = lessonMaxMap[u.id] || 0;
    const done = progressMap[u.id] || 0;
    const isCompleted = total > 0 && done >= total;

    if (isCompleted) {
      computedStatus[u.id] = "completed";
    } else if (i === 0 && tierUnlocked[currentTier]) {
      computedStatus[u.id] = "available";
    } else if (i > 0 && computedStatus[tierUnits[i - 1].id] === "completed") {
      computedStatus[u.id] = "available";
    } else {
      computedStatus[u.id] = "locked";
    }
  }

  const allDone =
    tierUnits.length > 0 &&
    tierUnits.every((u) => computedStatus[u.id] === "completed");
  if (allDone) {
    const nextTier = TIER_ORDER[TIER_ORDER.indexOf(currentTier) + 1];
    if (nextTier) tiersToUnlock.push(nextTier);
  }

  // fire-and-forget
  tiersToUnlock.forEach((tier) => unlockTier(tier));

  const getCompleted = (id) => progressMap[id] || 0;
  const getNextLesson = (id) => (progressMap[id] || 0) + 1;

  const tierSectionsData = sections.map((sec) => ({
    ...sec,
    colorClass: `section-${sec.id}`,
    units: units
      .filter((u) => u.section_id === sec.id)
      .sort((a, b) => a.order - b.order)
      .map((u) => ({
        ...u,
        status: computedStatus[u.id] || "locked",
        totalLessons: lessonMaxMap[u.id] || 0,
        completedLessons: getCompleted(u.id),
        nextLessonOrder: getNextLesson(u.id),
      })),
  }));

  // ✅ Simpan ke cache per tier, bukan replace semua
  _allSectionsData = [
    ..._allSectionsData.filter((s) => s.tier !== currentTier),
    ...tierSectionsData,
  ];

  tierSectionsData.forEach((section) => {
    section.units.forEach((unit) => {
      _allUnits[unit.id] = unit;
      _allSections[unit.id] = section;
    });
  });

  _syncDropdownState();

  return tierSectionsData;
}

/* ══════════════════════════════════════════
   REFRESH
══════════════════════════════════════════ */
async function refreshPetualangan() {
  _allSectionsData = [];
  _rendering = false;
  setCurrentTier("pemula");
  setTierUnlocked({
    pemula: true,
    menengah: false,
    lanjut: false,
    master: false,
    fasih: false,
  });
  if (typeof window._setTierUnlockedFromGlobal === "function") {
    window._setTierUnlockedFromGlobal({
      pemula: true,
      menengah: false,
      lanjut: false,
      master: false,
      fasih: false,
    });
  }
  Object.keys(_allUnits).forEach((k) => delete _allUnits[k]);
  Object.keys(_allSections).forEach((k) => delete _allSections[k]);
  await renderPetualanganPath();
}

/* ══════════════════════════════════════════
   SNAKE PATH — kurva statis, node ikut kurva
══════════════════════════════════════════ */

// Evaluasi titik cubic bezier pada t ∈ [0,1]
function _cubicBezier(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return (
    mt * mt * mt * p0 +
    3 * mt * mt * t * p1 +
    3 * mt * t * t * p2 +
    t * t * t * p3
  );
}

// Control points kurva statis — pakai koordinat absolut (bukan rasio canvasH)
// supaya kurva tidak berubah bentuk tergantung jumlah node.
// Kurva: mulai kanan atas → melengkung ke kiri tengah → balik kanan bawah
function _getCurveCP(canvasW, startY, endY) {
  const midX = canvasW * 0.5;
  const spanY = endY - startY;
  return {
    x: [midX, midX - canvasW * 0.55, midX + canvasW * 0.55, midX], // ← dibalik
    y: [startY, startY + spanY * 0.35, startY + spanY * 0.65, endY],
  };
}

// Posisi node ke-idx: t distributed merata 0→1 sepanjang kurva
function _nodePos(idx, total, canvasW, startY, endY) {
  const t = total <= 1 ? 0.5 : idx / (total - 1);
  const cp = _getCurveCP(canvasW, startY, endY);
  return {
    x: _cubicBezier(cp.x[0], cp.x[1], cp.x[2], cp.x[3], t),
    y: _cubicBezier(cp.y[0], cp.y[1], cp.y[2], cp.y[3], t),
  };
}

// SVG path kurva — pakai posisi node pertama & terakhir sebagai anchor
function _buildSnakePath(canvasW, startPos, endPos) {
  const cp = _getCurveCP(canvasW, startPos.y, endPos.y);
  return `M ${startPos.x.toFixed(1)} ${startPos.y.toFixed(1)} C ${cp.x[1].toFixed(1)} ${cp.y[1].toFixed(1)}, ${cp.x[2].toFixed(1)} ${cp.y[2].toFixed(1)}, ${endPos.x.toFixed(1)} ${endPos.y.toFixed(1)}`;
}
/* ══════════════════════════════════════════
   SECTION BANNER STYLE
══════════════════════════════════════════ */
function _getSectionBannerStyle(icon) {
  const code = (icon || "").codePointAt(0) || 0;
  const hue1 = code % 360;
  const hue2 = (hue1 + 40) % 360;
  return `background:linear-gradient(135deg,hsl(${hue1},70%,60%,0.13),hsl(${hue2},70%,60%,0.13));border:1.5px solid hsl(${hue1},70%,60%,0.27);`;
}

/* ══════════════════════════════════════════
   ULANGI
══════════════════════════════════════════ */
function _petUlangi(unitId) {
  _hideTooltip();
  setTimeout(() => _showLessonPicker(unitId), 160);
}

/* ══════════════════════════════════════════
   RENDER UTAMA
══════════════════════════════════════════ */
async function renderPetualanganPath() {
  if (_rendering) return;
  _rendering = true;

  const container = document.getElementById("petualangan-path");
  if (!container) {
    _rendering = false;
    return;
  }

  if (window._tooltipEl) {
    window._tooltipEl.remove();
    window._tooltipEl = null;
  }
  window._activeTooltipId = null;

  const screenEl = document.getElementById("petualangan-screen");
  if (screenEl) screenEl.removeEventListener("scroll", _onPetualanganScroll);
  document.removeEventListener("click", _petOutsideClick);

  let sections;
  try {
    if (_allSectionsData.length > 0) {
      sections = _allSectionsData.filter((s) => s.tier === getCurrentTier());
      if (sections.length === 0) {
        _allSectionsData = [];
        sections = await fetchPetualanganData();
      }
    } else {
      sections = await fetchPetualanganData();
      if (!sections) {
        container.innerHTML = `<p class="path-error">Gagal memuat data. Coba lagi.</p>`;
        _rendering = false;
        return;
      }
    }
  } catch (e) {
    console.error("renderPetualanganPath fetch error:", e);
    _rendering = false;
    return;
  }

  // ✅ FIX #3: cache offsetWidth sekali sebelum loop, hindari reflow berulang
  const canvasW = Math.min(container.offsetWidth || 320, 360);

  let html = "";

  sections.forEach((section, sectionIdx) => {
    const pathUnits = section.units.filter((u) => u.type !== "challenge");
    const challengeUnit =
      section.units.find((u) => u.type === "challenge") || null;

    if (challengeUnit) {
      const checkpointUnit = pathUnits.find((u) => u.type === "checkpoint");
      challengeUnit.status =
        challengeUnit.status === "completed"
          ? "completed"
          : checkpointUnit?.status === "completed"
            ? "available"
            : "locked";
    }

    const completed = pathUnits.filter((u) => u.status === "completed").length;
    const total = pathUnits.length;

    const nodeR = 46;
    const spacing = 95;
    const padTop = nodeR + 8;
    const padBot = nodeR + 8;
    const startY = padTop;
    const endY = padTop + (Math.max(total, 1) - 1) * spacing;
    const canvasH = endY + padBot;

    const nodePoints = pathUnits.map((_, idx) =>
      _nodePos(idx, total, canvasW, startY, endY),
    );

    const snakePath =
      total >= 2
        ? _buildSnakePath(
            canvasW,
            nodePoints[0],
            nodePoints[nodePoints.length - 1],
          )
        : "";

    let greenSegments = "";
    for (let i = 0; i < pathUnits.length - 1; i++) {
      if (pathUnits[i].status === "completed") {
        const t0 = total <= 1 ? 0 : i / (total - 1);
        const t1 = total <= 1 ? 1 : (i + 1) / (total - 1);
        const cp = _getCurveCP(canvasW, startY, endY);
        const sx = _cubicBezier(cp.x[0], cp.x[1], cp.x[2], cp.x[3], t0);
        const sy = _cubicBezier(cp.y[0], cp.y[1], cp.y[2], cp.y[3], t0);
        const ex = _cubicBezier(cp.x[0], cp.x[1], cp.x[2], cp.x[3], t1);
        const ey = _cubicBezier(cp.y[0], cp.y[1], cp.y[2], cp.y[3], t1);
        const dt = t1 - t0;
        const cp1x = sx + (_cubicBezierDerivX(cp.x, t0) * dt) / 3;
        const cp1y = sy + (_cubicBezierDerivY(cp.y, t0) * dt) / 3;
        const cp2x = ex - (_cubicBezierDerivX(cp.x, t1) * dt) / 3;
        const cp2y = ey - (_cubicBezierDerivY(cp.y, t1) * dt) / 3;
        greenSegments += `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${ex.toFixed(1)} ${ey.toFixed(1)}" fill="none" stroke="rgba(232,201,109,0.5)" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    }

    html += `
      <div class="path-section-banner" style="${_getSectionBannerStyle(section.icon)}">
        <div class="psb-icon">${section.icon}</div>
        <div class="psb-text">
          <div class="psb-title">${section.title}</div>
          <div class="psb-sub">HSK ${section.hsk_level} · ${total} Materi</div>
        </div>
        <div class="psb-progress">${completed}/${total}</div>
      </div>
    `;

    html += `<div class="snake-canvas-wrap" style="width:${canvasW}px; height:${canvasH}px; position:relative; margin:0 auto;">`;

    html += `
    <svg class="snake-path-svg" width="${canvasW}" height="${canvasH}"
        viewBox="0 0 ${canvasW} ${canvasH}"
        style="position:absolute;top:0;left:0;pointer-events:none;">
      <path d="${snakePath}" fill="none" stroke="var(--bdr)" stroke-width="10" stroke-linecap="round"/>
      ${greenSegments}
    </svg>
    `;

    if (challengeUnit) {
      const cp = _getCurveCP(canvasW, startY, endY);
      const isTop = sectionIdx % 2 === 0;
      const t = isTop ? 0.24 : 0.76;
      const chx = _cubicBezier(cp.x[0], cp.x[1], cp.x[2], cp.x[3], t);
      const chy = _cubicBezier(cp.y[0], cp.y[1], cp.y[2], cp.y[3], t);
      const offsetX = isTop ? canvasW * 0.36 : -canvasW * 0.36;
      const challengePos = { x: chx + offsetX, y: chy };
      html += _renderChallengeNode(challengeUnit, challengePos, canvasW, "0ms");
    }

    pathUnits.forEach((unit, idx) => {
      const pos = nodePoints[idx];
      const delay = idx * 70 + "ms";
      const type = unit.type || "practice";

      if (type === "review") {
        html += _renderReviewNode(unit, pos, canvasW, delay);
      } else if (type === "checkpoint") {
        html += _renderCheckpointNode(unit, pos, canvasW, delay);
      } else {
        html += _renderPracticeNode(unit, pos, canvasW, delay);
      }
    });

    html += `</div>`;
    html += `<div style="height:16px"></div>`;
  });

  if (sections.length === 0) {
    const currentTier = getCurrentTier();
    const TIER_LABEL = {
      pemula: "Tingkat Pemula",
      menengah: "Tingkat Menengah",
      lanjut: "Tingkat Lanjut",
      master: "Tingkat Master",
      fasih: "Tingkat Fasih",
    };
    html += `
      <div class="path-empty-tier">
        <div class="path-empty-icon">🚧</div>
        <div class="path-empty-label">Konten ${TIER_LABEL[currentTier]} segera hadir…</div>
      </div>
    `;
  }

  html += `
    <div class="path-coming-soon">
      <div class="path-coming-circle">✨</div>
      <div class="path-coming-label">Lebih banyak unit segera hadir…</div>
    </div>
  `;

  const isRefresh = container.children.length > 0;
  if (isRefresh) container.classList.add("no-pop-anim");

  container.innerHTML = html;

  if (!isRefresh) {
    if (screenEl) screenEl.scrollTop = 0;
    requestAnimationFrame(() => {
      const firstAvail = container.querySelector(
        ".node-circle.available, .node-review-shape.available",
      );
      if (firstAvail) {
        const node = firstAvail.closest(".snake-node");
        if (node) {
          const nodeTop = node.offsetTop;
          const screenH = screenEl?.clientHeight || 600;
          const targetScroll = Math.max(0, nodeTop - screenH * 0.65);
          if (screenEl)
            screenEl.scrollTo({ top: targetScroll, behavior: "smooth" });
        }
      }
    });
  }

  if (isRefresh) {
    requestAnimationFrame(() => container.classList.remove("no-pop-anim"));
  }

  setTimeout(() => {
    document.addEventListener("click", _petOutsideClick, { passive: true });
    const scr = document.getElementById("petualangan-screen");
    if (scr)
      scr.addEventListener("scroll", _onPetualanganScroll, { passive: true });
  }, 100);

  _rendering = false;
}

/* ══════════════════════════════════════════
   HELPER: turunan cubic bezier untuk green segment
══════════════════════════════════════════ */
function _cubicBezierDerivX(xArr, t) {
  const mt = 1 - t;
  return (
    3 * mt * mt * (xArr[1] - xArr[0]) +
    6 * mt * t * (xArr[2] - xArr[1]) +
    3 * t * t * (xArr[3] - xArr[2])
  );
}
function _cubicBezierDerivY(yArr, t) {
  const mt = 1 - t;
  return (
    3 * mt * mt * (yArr[1] - yArr[0]) +
    6 * mt * t * (yArr[2] - yArr[1]) +
    3 * t * t * (yArr[3] - yArr[2])
  );
}

/* ══════════════════════════════════════════
   EXPOSE KE WINDOW
══════════════════════════════════════════ */
window.renderPetualanganPath = renderPetualanganPath;
window.refreshPetualangan = refreshPetualangan;
window._petUlangi = _petUlangi;
window._petUnitStart = _petUnitStart;
window._pickLesson = _pickLesson;
window._petCancelLoadingOverlay = _petCancelLoadingOverlay;
window._showLessonPicker = _showLessonPicker;
window._closeLessonPicker = _closeLessonPicker;
window._petToggleDropdown = _petToggleDropdown;
window._petSwitchTier = _petSwitchTier;
window._petSkipCancel = _petSkipCancel;
window._petSkipConfirm = _petSkipConfirm;
window._petTooltipToggle = _petTooltipToggle;
window._hideTooltip = _hideTooltip;
