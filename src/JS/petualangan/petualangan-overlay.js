/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   PETUALANGAN-OVERLAY.JS — Loading overlay & unit action (mulai/ulangi)
   ============================================================ */

import { showScreen } from "../core/navigation.js";
import { lessonState } from "../lesson/state.js";

let _petOverlayCancelled = false;

export function _petUnitStart(unitId) {
  _hideTooltip();
  const unit = window._allUnits[unitId];
  const section = window._allSections[unitId];
  if (!unit || typeof window.openLesson !== "function") return;
  _petShowLoadingOverlay(
    unit,
    (resolve) => {
      window.openLesson(unitId, unit, section, resolve);
    },
    "mulai",
  );
}

export function _pickLesson(unitId, lessonOrder) {
  _closeLessonPicker();

  const unit = window._allUnits[unitId];
  const section = window._allSections[unitId];
  if (!unit || typeof window.openLesson !== "function") return;

  const unitOverride = { ...unit, nextLessonOrder: lessonOrder };

  setTimeout(() => {
    _petShowLoadingOverlay(
      unitOverride,
      (resolve) => {
        window.openLesson(unitId, unitOverride, section, resolve);
      },
      "ulangi",
    );
  }, 320);
}

/* ══════════════════════════════════════════
   CANCEL OVERLAY — dipanggil dari lessonClose()
   Mencegah onDone() terpanggil setelah lesson di-abort
   oleh back handler spurious, sehingga openLesson tidak
   terpanggil dua kali.
══════════════════════════════════════════ */
export function _petCancelLoadingOverlay() {
  _petOverlayCancelled = true;
}

/* ══════════════════════════════════════════
   LOADING OVERLAY — animasi sebelum masuk lesson
   mode: "mulai" (emas) | "ulangi" (biru)
══════════════════════════════════════════ */
export function _petShowLoadingOverlay(unit, onDone, mode) {
  document.getElementById("pet-loading-overlay")?.remove();
  _petOverlayCancelled = false;

  const unitData = { ...unit, _loadingMode: mode };

  showScreen("lesson-screen");

  // Overlay yang panggil _lessonShowLoading — satu kali, di sini
  if (typeof window._lessonShowLoading === "function") {
    window._lessonShowLoading(unitData);
  }

  const animDone = new Promise((resolve) => setTimeout(resolve, 2000));
  let fetchResolve;
  const fetchDone = new Promise((resolve) => { fetchResolve = resolve; });

  // Jalankan openLesson, passing fetchResolve sebagai onFetchDone
  onDone(fetchResolve);

  Promise.all([fetchDone, animDone]).then(() => {
    if (_petOverlayCancelled) return;

    const actionBar = document.querySelector(".lesson-action-bar");
    const progressTop = document.querySelector(".lesson-progress-top");
    if (actionBar) actionBar.style.display = "";
    if (progressTop) progressTop.style.display = "";

    // Sekarang hide loading lalu eksekusi render
    if (typeof window._lessonHideLoading === "function") {
      window._lessonHideLoading(() => {
        if (lessonState._pendingRender) {
          lessonState._pendingRender();
          lessonState._pendingRender = null;
        }
      });
    } else {
      // Fallback jika _lessonHideLoading tidak tersedia
      if (lessonState._pendingRender) {
        lessonState._pendingRender();
        lessonState._pendingRender = null;
      }
    }
  });
}

// Forward declarations untuk fungsi yang dipanggil dari file ini
// (akan diisi oleh petualangan-tooltip.js dan petualangan-picker.js via window)
function _hideTooltip() {
  if (typeof window._hideTooltip === "function") window._hideTooltip();
}

function _closeLessonPicker() {
  if (typeof window._closeLessonPicker === "function")
    window._closeLessonPicker();
}
