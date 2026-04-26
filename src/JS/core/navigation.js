/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   CORE/NAVIGATION.JS
   ============================================================ */

import { cancelTTS } from "../utilities/tts.js";
import { screenEnter } from "../utilities/screen-anim.js";

let _navStack = [];
export { _navStack };
export function setNavStack(val) {
  _navStack = val;
}
let _appHistory = [];
let _appHistIdx = -1;
let _isRestoringNav = false;
const _screenScrollPos = {};

// Flag: history sudah diinit atau belum
let _historyReady = false;

const _NAVBAR_SCREENS = [
  "petualangan-screen",
  "dash",
  "search-screen",
  "sosial-screen",
  "profile-screen",
  "user-profile-screen",
];

export function _syncNavbar() {
  const navbar = document.getElementById("bottom-navbar");
  if (!navbar) return;
  const activeScreen = document.querySelector(".screen.active")?.id || "dash";
  const anyLayerOpen = document.querySelectorAll(".layer.active").length > 0;
  const shouldShow = _NAVBAR_SCREENS.includes(activeScreen) && !anyLayerOpen;
  navbar.style.display = shouldShow ? "" : "none";
  document.querySelectorAll(".bnav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.screen === activeScreen);
  });
}

export function updateNavbar(_screenId) {
  _syncNavbar();
}

export function bnavGoTo(screenId) {
  if (screenId === "dash") {
    backToDash();
    return;
  }
  showScreen(screenId);
}

export function initNavbar() {
  _syncNavbar();
}

function _cleanupCurrentScreen() {
  const active = document.querySelector(".screen.active");
  if (!active) return;
  cancelTTS();
  if (active.id === "cerita-screen") {
    if (typeof window._ceritaStopAll === "function") window._ceritaStopAll();
  }
  const speakingDone = document.getElementById("speaking-done-screen");
  if (speakingDone) speakingDone.style.display = "none";
}

function _getSnapshot() {
  const activeScreen =
    document.querySelector(".screen.active")?.id || "dash";
  const activeLayers = [...document.querySelectorAll(".layer.active")].map(
    (l) => l.id,
  );
  return { activeScreen, activeLayers };
}

function _restoreSnapshot(snap) {
  _cleanupCurrentScreen();
  _isRestoringNav = true;
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document
    .querySelectorAll(".layer")
    .forEach((l) => l.classList.remove("active"));
  document.body.style.overflow = "";

  if (snap.activeLayers.length > 0) {
    // Ada layer aktif → base screen dash
    const dash = document.getElementById("dash");
    if (dash) dash.classList.add("active");
  } else {
    const screenEl = document.getElementById(snap.activeScreen);
    if (screenEl) screenEl.classList.add("active");
  }

  snap.activeLayers.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add("active");
      document.body.style.overflow = "hidden";
    }
  });

  if (snap.activeLayers.length > 0) {
    _navStack = snap.activeLayers.map((id) => ({ type: "layer", id }));
  } else if (snap.activeScreen === "dash") {
    _navStack = [{ type: "dash" }];
  } else {
    _navStack = [{ type: "screen", id: snap.activeScreen }];
  }

  const anyLayer = snap.activeLayers.length > 0;
  const isDash = snap.activeScreen === "dash" || anyLayer;
  setFabVisible(!anyLayer && isDash);

  // Re-render layer konten supaya tidak stuck kosong setelah back nav
  if (snap.activeLayers.length > 0) {
    _triggerLayerRender(snap.activeLayers[snap.activeLayers.length - 1]);
  }

  // Kalau restore ke screen tertentu, panggil init screen-nya
  if (snap.activeLayers.length === 0) {
    _triggerScreenInit(snap.activeScreen);
  }

  _syncNavbar();
  _isRestoringNav = false;
}

// Panggil render function untuk layer — dengan retry kalau belum siap
function _triggerLayerRender(id) {
  const renderMap = {
    "layer-quiz": "renderQuizList",
    "layer-kalimat": "renderKalList",
    "layer-hanzi": "renderHanziList",
    "layer-kos": "renderKosDeckGrid",
    "layer-kos-deck": "restoreKosDeckLayer",
    "layer-grammar": "renderGrammarList",
    "layer-cerita": "renderCeritaList",
  };
  const fnName = renderMap[id];
  if (!fnName) return;
  if (typeof window[fnName] === "function") {
    window[fnName]();
  } else {
    // Retry sekali setelah 300ms kalau modul belum siap
    setTimeout(() => {
      if (typeof window[fnName] === "function") window[fnName]();
    }, 300);
  }
}

// Panggil init screen — dengan retry kalau belum siap
// Gunakan async wrapper agar _isRestoringNav tidak di-reset sebelum init selesai
function _triggerScreenInit(id) {
  if (id === "profile-screen") {
    const fn = async () => {
      _isRestoringNav = true;
      try {
        await window.initProfileScreen?.();
      } catch (e) {
        console.error(e);
      } finally {
        _isRestoringNav = false;
      }
    };
    typeof window.initProfileScreen === "function" ? fn() : setTimeout(fn, 300);
  }
  if (id === "sosial-screen") {
    const fn = async () => {
      _isRestoringNav = true;
      try {
        await window.initSosialScreen?.();
      } catch (e) {
        console.error(e);
      } finally {
        _isRestoringNav = false;
      }
    };
    typeof window.initSosialScreen === "function" ? fn() : setTimeout(fn, 300);
  }
  if (id === "user-profile-screen") {
    // tidak perlu init, konten sudah di-render sebelum showScreen
  }
  if (id === "petualangan-screen") {
    const fn = async () => {
      _isRestoringNav = true;
      try {
        await window.renderPetualanganPath?.();
      } catch (e) {
        console.error(e);
      } finally {
        _isRestoringNav = false;
      }
    };
    typeof window.renderPetualanganPath === "function"
      ? setTimeout(fn, 50)
      : setTimeout(fn, 300);
  }
}

export function _pushAppHistory() {
  if (_isRestoringNav) return;
  if (!_historyReady) return; // Jangan push sebelum init selesai
  _appHistory = _appHistory.slice(0, _appHistIdx + 1);
  _appHistory.push(_getSnapshot());
  _appHistIdx = _appHistory.length - 1;
  history.pushState(
    { hskApp: true, idx: _appHistIdx },
    "",
    window.location.href,
  );
}

export function setFabVisible(visible) {
  const fab = document.getElementById("auth-fab");
  if (fab) fab.style.display = visible ? "" : "none";
}

export function openLayer(id) {
  document.getElementById(id).classList.add("active");
  document.body.style.overflow = "hidden";
  _triggerLayerRender(id);
  _navStack.push({ type: "layer", id });
  _pushAppHistory();
  setFabVisible(false);
  _syncNavbar();
}

export function closeLayer(id, _suppressHistory = false) {
  document.getElementById(id).classList.remove("active");
  document.body.style.overflow = "";
  _navStack = _navStack.filter((s) => !(s.type === "layer" && s.id === id));
  const anyLayerOpen = document.querySelectorAll(".layer.active").length > 0;
  const onDash = document.getElementById("dash")?.classList.contains("active");
  setFabVisible(!anyLayerOpen && !!onDash);
  if (!_suppressHistory) _pushAppHistory();
  _syncNavbar();
}

export function showScreen(id) {
  const currentScreen = document.querySelector(".screen.active");
  if (currentScreen)
    _screenScrollPos[currentScreen.id] = currentScreen.scrollTop;
  _cleanupCurrentScreen();
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  document
    .querySelectorAll(".layer")
    .forEach((l) => l.classList.remove("active"));
  const newScreen = document.getElementById(id);
  newScreen.scrollTop = _screenScrollPos[id] ?? 0;
  _navStack = [{ type: "screen", id }];
  _pushAppHistory();
  setFabVisible(id === "dash");
  _syncNavbar();
  _triggerScreenInit(id);
  if (id === "search-screen") {
    setTimeout(() => {
      const searchInput = document.querySelector(
        "#search-screen input, #search-screen .search-input",
      );
      if (searchInput) searchInput.focus();
    }, 100);
  }
}

export function backToDash() {
  const currentScreen = document.querySelector(".screen.active");
  if (currentScreen)
    _screenScrollPos[currentScreen.id] = currentScreen.scrollTop;
  _cleanupCurrentScreen();
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  const dash = document.getElementById("dash");
  dash.classList.add("active");
  dash.scrollTop = _screenScrollPos["dash"] ?? 0;
  _navStack = [{ type: "dash" }];
  _pushAppHistory();
  setFabVisible(true);
  _syncNavbar();
}

export function backToLayer(id) {
  _cleanupCurrentScreen();
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document
    .querySelectorAll(".layer")
    .forEach((l) => l.classList.remove("active"));
  document.getElementById("dash").classList.add("active");
  document.getElementById(id).classList.add("active");
  document.body.style.overflow = "hidden";
  _navStack = [{ type: "layer", id }];
  _pushAppHistory();
  setFabVisible(false);
  _syncNavbar();
  _triggerLayerRender(id);
}

/* ── Browser history init ──
   Dipanggil dari entry point (main.js / app.js) setelah semua modul siap,
   BUKAN dari setTimeout arbitrary.
   Kalau masih pakai setTimeout dari luar, pastikan dipanggil setelah
   semua screen & layer sudah ada di DOM.
── */
export function initAppHistory() {
  if (_historyReady) return; // Guard double-init

  const anyActive = document.querySelector(".screen.active");
  if (!anyActive) {
    const dash = document.getElementById("dash");
    if (dash) dash.classList.add("active");
  }

  _appHistory = [_getSnapshot()];
  _appHistIdx = 0;
  _historyReady = true;
  history.replaceState({ hskApp: true, idx: 0 }, "", window.location.href);
  initNavbar();
}

// Fallback: kalau initAppHistory tidak dipanggil dari luar,
// auto-init setelah DOMContentLoaded + sedikit delay untuk modul lain
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    // Beri waktu untuk module lain selesai assign ke window
    requestAnimationFrame(() => requestAnimationFrame(() => initAppHistory()));
  });
} else {
  // DOM sudah siap (modul di-load late)
  requestAnimationFrame(() => requestAnimationFrame(() => initAppHistory()));
}

window.addEventListener("popstate", function (e) {
  const idx = e.state?.idx;
  if (idx === undefined || idx < 0 || !_appHistory[idx]) {
    // State tidak dikenal → dorong kembali ke state terakhir yang valid
    history.pushState(
      { hskApp: true, idx: _appHistIdx },
      "",
      window.location.href,
    );
    return;
  }
  if (idx !== _appHistIdx) {
    _appHistIdx = idx;
    _restoreSnapshot(_appHistory[_appHistIdx]);
  }
});

/* ── Mouse back/forward ── */
document.addEventListener("mousedown", (e) => {
  if (e.button === 3 || e.button === 4) e.preventDefault();
});
document.addEventListener("mouseup", (e) => {
  if (e.button === 3 || e.button === 4) e.preventDefault();
});
document.addEventListener("click", (e) => {
  if (e.button === 3 || e.button === 4) e.preventDefault();
});
document.addEventListener("auxclick", (e) => {
  if (e.button === 3 || e.button === 4) {
    e.preventDefault();
    e.stopPropagation();
  }
});

/* ── Expose ke window (dipanggil dari HTML onclick) ── */
window.bnavGoTo = bnavGoTo;
window.showScreen = showScreen;
window.openLayer = openLayer;
window.closeLayer = closeLayer;
window.backToDash = backToDash;
window.backToLayer = backToLayer;
window.initAppHistory = initAppHistory;
