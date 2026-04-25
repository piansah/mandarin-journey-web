/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   PETUALANGAN-TOOLTIP.JS — Tooltip portal, toggle, positioning
   ============================================================ */

let _tooltipEl = null;
let _activeTooltipId = null;

export function _getTooltipEl() {
  if (!_tooltipEl) {
    _tooltipEl = document.createElement("div");
    _tooltipEl.className = "node-tooltip";
    _tooltipEl.id = "shared-pet-tooltip";
    document.body.appendChild(_tooltipEl);
  }
  return _tooltipEl;
}

export function _hideTooltip() {
  if (!_tooltipEl) return;
  _tooltipEl.classList.remove("visible");
  _activeTooltipId = null;
}

export function _onPetualanganScroll() {
  if (!_activeTooltipId || !_tooltipEl) return;
  _hideTooltip();
}

export function _petTooltipToggle(unitId) {
  const tt = _getTooltipEl();

  if (_activeTooltipId === unitId) {
    _hideTooltip();
    return;
  }

  tt.classList.remove("visible", "tooltip-above", "scroll-hidden");

  const unit = window._allUnits[unitId];
  if (!unit) return;

  const isCompleted = unit.status === "completed";
  const isAvailable = unit.status === "available";
  const isReview = unit.type === "review";
  const isPractice = unit.type === "practice";
  const isChallenge = unit.type === "challenge";
  const isCheckpoint = unit.type === "checkpoint";

  // Tentukan class dan node type
  let btnClass = "btn-start";
  let nodeType = "checkpoint";

  if (isReview) {
    btnClass = "btn-review";
    nodeType = "review";
  } else if (isPractice) {
    btnClass = "btn-practice";
    nodeType = "practice";
  } else if (isChallenge) {
    btnClass = "btn-challenge";
    nodeType = "challenge";
  } else if (isCheckpoint) {
    btnClass = "btn-start";
    nodeType = "checkpoint";
  }

  let btnHtml = "";
  if (isCompleted) {
    let ulangiClass = btnClass;
    if (isReview) ulangiClass = "btn-ulangi-review";
    else if (isPractice || isCheckpoint) ulangiClass = "btn-ulangi";
    else ulangiClass = btnClass;
    
    btnHtml = `<button class="tooltip-btn ${ulangiClass}" data-node-type="${nodeType}" onclick="window._petUlangi(${unit.id})">ULANGI</button>`;
  } else if (isAvailable) {
    btnHtml = `<button class="tooltip-btn ${btnClass}" data-node-type="${nodeType}" onclick="window._petUnitStart(${unit.id})">MULAI</button>`;
  } else {
    btnHtml = `<button class="tooltip-btn btn-locked" disabled>TERKUNCI</button>`;
  }

  let subLabel;
  if (isReview) {
    const sec = window._allSections[unitId];
    subLabel = sec?.title ? sec.title : "Ulasan Section";
  } else if (isPractice) {
    const lessonNum = Math.min(unit.completedLessons + 1, unit.totalLessons);
    subLabel = isCompleted
      ? `${unit.totalLessons} pelajaran selesai ✓`
      : unit.totalLessons > 0
        ? `Pelajaran ${lessonNum} dari ${unit.totalLessons}`
        : "Memuat data pelajaran...";
  } else if (isChallenge) {
    subLabel =
      unit.status === "locked"
        ? "Selesaikan Checkpoint dulu"
        : "Tantangan Bonus";
  } else if (unit.totalLessons > 0) {
    const lessonNum = Math.min(unit.completedLessons + 1, unit.totalLessons);
    subLabel = isCompleted
      ? `${unit.totalLessons} pelajaran selesai ✓`
      : `Pelajaran ${lessonNum} dari ${unit.totalLessons}`;
  } else {
    subLabel = "Memuat data pelajaran...";
  }

  tt.innerHTML = `
    <div class="tooltip-title">${unit.icon} ${unit.title}</div>
    <div class="tooltip-sub">${subLabel}</div>
    ${btnHtml}
    <div class="tooltip-arrow"></div>
  `;

  // ... sisa kode positioning tooltip tetap sama
  const nodeEl = document.getElementById(`pnode-${unitId}`);
  const rect = nodeEl.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const tooltipH = 150;
  const spaceBelow = viewportH - rect.bottom;

  const arrow = tt.querySelector(".tooltip-arrow");

  if (spaceBelow >= tooltipH) {
    tt.style.top = rect.bottom + 10 + "px";
    tt.style.bottom = "auto";
    tt.classList.remove("tooltip-above");
    if (arrow) {
      arrow.style.top = "-8px";
      arrow.style.bottom = "auto";
      arrow.style.borderTop = "none";
      arrow.style.borderBottom = "8px solid var(--bdr)";
    }
  } else {
    tt.style.top = "auto";
    tt.style.bottom = viewportH - rect.top + 10 + "px";
    tt.classList.add("tooltip-above");
    if (arrow) {
      arrow.style.top = "auto";
      arrow.style.bottom = "-8px";
      arrow.style.borderBottom = "none";
      arrow.style.borderTop = "8px solid var(--bdr)";
    }
  }

  const tooltipW = 200;
  const margin = 10;
  const centerX = rect.left + rect.width / 2;
  const minCenter = tooltipW / 2 + margin;
  const maxCenter = window.innerWidth - tooltipW / 2 - margin;
  const clampedCenter = Math.max(minCenter, Math.min(centerX, maxCenter));

  tt.style.left = clampedCenter + "px";

  if (arrow) {
    const arrowOffset = centerX - clampedCenter;
    arrow.style.left = `calc(50% + ${arrowOffset}px)`;
  }

  tt.classList.add("visible");
  _activeTooltipId = unitId;

  const screenEl = document.getElementById("petualangan-screen");
  if (screenEl) {
    screenEl.removeEventListener("scroll", _onPetualanganScroll);
    screenEl.addEventListener("scroll", _onPetualanganScroll, {
      passive: true,
      once: true,
    });
  }
  window.removeEventListener("scroll", _onPetualanganScroll);
  window.addEventListener("scroll", _onPetualanganScroll, {
    passive: true,
    once: true,
  });
  document.removeEventListener("scroll", _onPetualanganScroll, true);
  document.addEventListener("scroll", _onPetualanganScroll, {
    passive: true,
    capture: true,
    once: true,
  });
}

export function _petOutsideClick(e) {
  if (!_activeTooltipId) return;
  if (e.target.closest(`#pnode-${_activeTooltipId}`)) return;
  if (e.target.closest("#shared-pet-tooltip")) return;
  _hideTooltip();
}
