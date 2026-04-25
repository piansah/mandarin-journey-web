/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   PETUALANGAN-NODES.JS — Node rendering: checkpoint, practice, review, stars, arcs
   ============================================================ */

import {
  SVG_CHECK_DUOLINGO_LARGE,
} from "../../assets/icon";

export function _renderSegmentArcs(status, totalLessons, completedLessons) {
  const r = 42;
  const cx = 46;
  const cy = 46;

  const total = totalLessons > 0 ? totalLessons : 4;
  const gapDeg = total <= 4 ? 10 : total <= 6 ? 7 : 5;
  const sliceDeg = 360 / total;
  const arcDeg = sliceDeg - gapDeg;

  const COLOR_DONE = "#e8c96d";
  const COLOR_ACTIVE = "rgba(232,201,109,0.45)";
  const COLOR_LOCKED = "#2a2a2a";

  let paths = "";
  for (let i = 0; i < total; i++) {
    const startDeg = -90 + i * sliceDeg + gapDeg / 2;
    const endDeg = startDeg + arcDeg;

    const x1 = cx + r * Math.cos((startDeg * Math.PI) / 180);
    const y1 = cy + r * Math.sin((startDeg * Math.PI) / 180);
    const x2 = cx + r * Math.cos((endDeg * Math.PI) / 180);
    const y2 = cy + r * Math.sin((endDeg * Math.PI) / 180);

    const largeArc = arcDeg > 180 ? 1 : 0;

    let color;
    if (status === "locked") {
      color = COLOR_LOCKED;
    } else if (i < completedLessons) {
      color = COLOR_DONE;
    } else if (i === completedLessons && status === "available") {
      color = COLOR_ACTIVE;
    } else {
      color = COLOR_LOCKED;
    }

    paths += `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`;
  }

  if (status === "locked") return "";
  return `<svg class="node-seg-svg" viewBox="0 0 92 92" width="92" height="92"><g>${paths}</g></svg>`;
}

export function _renderNodeStars(completedLessons, totalLessons) {
  const count = Math.min(completedLessons, totalLessons || completedLessons);
  if (count <= 0) return "";

  const cx = 44;
  const cy = 44;
  const orbitR = 40;

  const startDeg = 15;
  const endDeg = 90;
  const maxStars = totalLessons || count;

  let stars = "";
  for (let i = 0; i < count; i++) {
    const deg =
      maxStars <= 1
        ? startDeg
        : startDeg + (i / (maxStars - 1)) * (endDeg - startDeg);
    const rad = (deg * Math.PI) / 180;
    const x = (cx + orbitR * Math.cos(rad)).toFixed(1);
    const y = (cy + orbitR * Math.sin(rad)).toFixed(1);
    stars += `<span class="node-star-orbit" style="left:${x}px;top:${y}px;">⭐</span>`;
  }

  return `<span class="node-stars-wrap">${stars}</span>`;
}

export function _renderReviewNode(unit, pos, canvasW, delay) {
  const nodeR = 46;
  const left = pos.x - nodeR;
  const top = pos.y - nodeR;
  const st = unit.status;

  const isCompleted = st === "completed";
  const isAvailable = st === "available";

  const iconContent = isCompleted
    ? `<span class="node-review-icon">${SVG_CHECK_DUOLINGO_LARGE}</span>`
    : isAvailable
      ? `<span class="node-review-icon">⭐</span>`
      : `<span class="node-review-icon" style="opacity:0.25;">⭐</span>`;

  const tagClass = isCompleted
    ? "completed"
    : isAvailable
      ? "available"
      : "locked";

  return `
    <div class="snake-node"
         style="left:${left}px; top:${top}px; animation-delay:${delay};"
         id="pnode-${unit.id}"
         onclick="_petTooltipToggle(${unit.id})">
      <div class="node-review-wrap">
        <div class="node-review-ring ${st}"></div>
        <div class="node-review-shape ${st}">
          ${iconContent}
        </div>
      </div>
      <div class="node-review-tag ${tagClass}"></div>
      <div class="node-label" style="top: 30px;"></div>
    </div>
  `;
}

// Checkpoint node — bentuk diamond (rotate 45°), node evaluasi utama
export function _renderCheckpointNode(unit, pos, canvasW, delay) {
  const nodeR = 46;
  const left = pos.x - nodeR;
  const top = pos.y - nodeR;
  const st = unit.status;
  const labelSide = pos.x < canvasW * 0.5 ? "label-right" : "label-left";

  const isCompleted = st === "completed";
  const isAvailable = st === "available";

  // Icon tidak pakai node-practice-icon karena class itu apply rotate(-45deg)
  // Gunakan node-checkpoint-icon supaya tidak counter-rotate
  const iconContent = isCompleted
    ? `<span class="node-checkpoint-icon">${SVG_CHECK_DUOLINGO_LARGE}</span>`
    : isAvailable
      ? `<span class="node-checkpoint-icon">${unit.hanzi || "📝"}</span>`
      : `<span class="node-checkpoint-icon locked-hanzi">${unit.hanzi || "📝"}</span>`;

  return `
    <div class="snake-node"
         style="left:${left}px; top:${top}px; animation-delay:${delay};"
         id="pnode-${unit.id}"
         onclick="_petTooltipToggle(${unit.id})">
      <div class="node-practice-wrap">
        <div class="node-practice-ring ${st}"></div>
        <div class="node-practice-shape ${st}">
          ${iconContent}
        </div>
      </div>
      <div class="node-label ${labelSide}"></div>
    </div>
  `;
}

// Practice node — bentuk circle dengan segment arcs, node utama jalur belajar
export function _renderPracticeNode(unit, pos, canvasW, delay) {
  const nodeR = 46;
  const left = pos.x - nodeR;
  const top = pos.y - nodeR;
  const st = unit.status;
  const labelSide = pos.x < canvasW * 0.5 ? "label-right" : "label-left";

  const isCompleted = st === "completed";
  const isAvailable = st === "available";

  const circleInner = isCompleted
    ? `<span class="node-check">${SVG_CHECK_DUOLINGO_LARGE}</span>${_renderNodeStars(unit.completedLessons, unit.totalLessons)}`
    : isAvailable
      ? `<span class="node-hanzi">${unit.hanzi}</span>`
      : `<span class="node-hanzi">${unit.hanzi}</span>`;

  return `
    <div class="snake-node"
         style="left:${left}px; top:${top}px; animation-delay:${delay};"
         id="pnode-${unit.id}"
         onclick="_petTooltipToggle(${unit.id})">
      <div class="node-seg-wrap">
        ${_renderSegmentArcs(st, unit.totalLessons, unit.completedLessons)}
        <div class="node-circle ${st}" id="pcirc-${unit.id}">
          ${circleInner}
        </div>
      </div>
      <div class="node-label ${labelSide}"></div>
    </div>
  `;
}

// Challenge node — hexagon, di luar jalur utama, bonus
export function _renderChallengeNode(unit, pos, canvasW, delay) {
  const nodeR = 38;
  const left = pos.x - nodeR;
  const top = pos.y - nodeR;
  const st = unit.status;

  const isCompleted = st === "completed";
  const isAvailable = st === "available";

  const iconContent = isCompleted
    ? `<span class="node-challenge-icon">${SVG_CHECK_DUOLINGO_LARGE}</span>`
    : isAvailable
      ? `<span class="node-challenge-icon">⚔️</span>`
      : `<span class="node-challenge-icon" style="opacity:0.25;">⚔️</span>`;

  return `
    <div class="snake-node node-challenge-float"
         style="left:${left.toFixed(1)}px; top:${top.toFixed(1)}px; animation-delay:${delay};"
         id="pnode-${unit.id}"
         onclick="_petTooltipToggle(${unit.id})">
      <div class="node-challenge-wrap">
        <div class="node-challenge-ring ${st}"></div>
        <div class="node-challenge-shape ${st}">
          ${iconContent}
        </div>
      </div>
    </div>
  `;
}
