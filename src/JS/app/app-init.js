/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   APP/APP-INIT.JS — Theme Init & App Entry Point
   ============================================================ */
import { initApp } from "../core/config.js";

/* ── Theme Toggle ── */
(function () {
  const saved = localStorage.getItem("hsk_theme");
  if (saved === "light") {
    document.body.classList.add("light");
    const btn = document.getElementById("theme-toggle-btn");
    if (btn) btn.textContent = "☀️";
  }
})();

export function toggleTheme() {
  const isLight = document.body.classList.toggle("light");
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) btn.textContent = isLight ? "☀️" : "🌙";
  localStorage.setItem("hsk_theme", isLight ? "light" : "dark");
}

/* ── App Entry Point ── */
const _appReadyFallback = setTimeout(() => {
  document.body.classList.add("app-ready");
}, 3000);

async function _initAppWrapped() {
  try {
    // Bersihkan sisa resume state dari sesi sebelumnya
    window.clearLessonStateFromStorage?.();
    await initApp();
    
    // Background cache initialization
    if (window.initExtractedWordsCache) {
      window.initExtractedWordsCache();
    }
  } finally {
    clearTimeout(_appReadyFallback);
    document.body.classList.add("app-ready");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _initAppWrapped);
} else {
  _initAppWrapped();
}

window.toggleTheme = toggleTheme;
