/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   PETUALANGAN-PICKER.JS — Lesson picker bottom sheet
   ============================================================ */

export function _showLessonPicker(unitId) {
  const unit = window._allUnits[unitId];
  if (!unit) return;

  document.getElementById("lesson-picker-sheet")?.remove();

  const completedCount = unit.completedLessons;
  const total = unit.totalLessons;

  let lessonItems = "";
  for (let i = 1; i <= completedCount; i++) {
    const isDone = i < completedCount || completedCount >= total;
    const badge = isDone
      ? `<span class="lp-badge lp-done">✓ Selesai</span>`
      : `<span class="lp-badge lp-current">▶ Terakhir</span>`;

    lessonItems += `
      <div class="lp-item" onclick="window._pickLesson(${unitId}, ${i})">
        <div class="lp-num">Pelajaran ${i}</div>
        ${badge}
      </div>
    `;
  }

  const sheet = document.createElement("div");
  sheet.id = "lesson-picker-sheet";
  sheet.className = "lp-sheet";
  sheet.innerHTML = `
    <div class="lp-backdrop" onclick="window._closeLessonPicker()"></div>
    <div class="lp-panel">
      <div class="lp-handle"></div>
      <div class="lp-header">
        <span class="lp-icon">${unit.icon}</span>
        <div class="lp-title">${unit.title}</div>
        <button class="lp-close" onclick="window._closeLessonPicker()">✕</button>
      </div>
      <div class="lp-subtitle">Pilih pelajaran yang ingin diulang</div>
      <div class="lp-list">${lessonItems}</div>
    </div>
  `;

  document.body.appendChild(sheet);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => sheet.classList.add("lp-visible"));
  });
}

export function _closeLessonPicker() {
  const sheet = document.getElementById("lesson-picker-sheet");
  if (!sheet) return;
  sheet.classList.remove("lp-visible");
  setTimeout(() => sheet.remove(), 300);
}
