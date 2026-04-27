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
  // Safety fallback: Jika dalam 6 detik masih belum ready, paksa munculkan
  const forceReady = setTimeout(() => {
    document.body.classList.add("app-ready");
    console.warn("App forced ready due to init timeout");
  }, 6000);

  try {
    // Bersihkan sisa resume state dari sesi sebelumnya
    window.clearLessonStateFromStorage?.();
    await initApp();
    
    // Bug Report FAB
    window.initBugReportFAB?.();
    
    // Background cache initialization
    window.warmUpGlobalSearchCache?.();
  } catch (err) {
    console.error("Critical Init Error:", err);
  } finally {
    clearTimeout(_appReadyFallback);
    clearTimeout(forceReady);
    document.body.classList.add("app-ready");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", _initAppWrapped);
} else {
  _initAppWrapped();
}

window.toggleTheme = toggleTheme;
