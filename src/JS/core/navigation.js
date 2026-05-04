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
const _layerRenderState = new Map();

// Flag: history sudah diinit atau belum
let _historyReady = false;

const _NAVBAR_SCREENS = [
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

  // Sync Bug Report FAB (Only on Profile Screen and no layers open)
  const isProfile = activeScreen === "profile-screen";
  if (typeof window.toggleBugReportFAB === "function") {
    window.toggleBugReportFAB(isProfile && !anyLayerOpen);
  }
}

export function updateNavbar(_screenId) {
  _syncNavbar();
}

export function bnavGoTo(screenId) {
  showScreen(screenId);
}

export function initNavbar() {
  _syncNavbar();
}

function _cleanupCurrentScreen() {
  const active = document.querySelector(".screen.active");
  const layers = document.querySelectorAll(".layer.active");

  // 1. Cleanup Layers (Feature Lifecycle)
  layers.forEach((l) => {
    const lid = l.id;
    if (lid === "layer-quiz" && window.destroyQuiz) window.destroyQuiz();
    if (lid === "layer-kalimat" && window.destroyKalimat) window.destroyKalimat();
    if (lid === "layer-hanzi" && window.destroyHanzi) window.destroyHanzi();
    if ((lid === "layer-kos" || lid === "layer-kos-deck" || lid === "layer-kos-word") && window.destroyKosakata)
      window.destroyKosakata();
    if (lid === "layer-grammar" && window.destroyGrammar) window.destroyGrammar();
    if (lid === "layer-cerita" && window.destroyCerita) window.destroyCerita();
  });

  if (!active) return;
  cancelTTS();

  // 2. Cleanup Screens (Main Feature Engine)
  const sid = active.id;
  if (sid === "dash" && window.destroyDashboard) window.destroyDashboard();
  if (sid === "quiz-screen" && window.destroyQuiz) window.destroyQuiz();
  if (sid === "kalimat-screen" && window.destroyKalimat) window.destroyKalimat();
  if (sid === "cerita-screen" && window.destroyCerita) window.destroyCerita();
  if (sid === "nada-screen" && window.destroyNada) window.destroyNada();
  if (sid === "hanzi-screen" && window.destroyHanzi) window.destroyHanzi();
  if (sid === "grammar-screen" && window.destroyGrammar) window.destroyGrammar();
  if (sid === "flashcard-screen" && window.destroyFlashcard) window.destroyFlashcard();
  if (sid === "tulis-hanzi-screen" && window.destroyTulisHanzi) window.destroyTulisHanzi();
  if (sid === "search-screen" && window.destroyKosakata) window.destroyKosakata();
  if (sid === "hanzi-speaking-screen" && window.destroyHanzi) window.destroyHanzi();

  // 3. Global Cleanup
  if (window.destroySpeaking) window.destroySpeaking();
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
    "layer-personal-themes": "renderThemes",
    "layer-personal-decks": "renderDecks",
    "layer-personal-cards": "renderCards",
    "layer-favorites": "renderFavorites",
  };
  const fnName = renderMap[id];
  if (!fnName) return;

  const run = () => {
    const fn = window[fnName];
    if (typeof fn !== "function") return false;

    const current = _layerRenderState.get(id);
    if (current?.running) {
      current.pending = true;
      return true;
    }

    const state = { running: true, pending: false };
    _layerRenderState.set(id, state);

    Promise.resolve()
      .then(() => fn())
      .catch((err) => console.error(`[navigation] ${fnName} failed:`, err))
      .finally(() => {
        state.running = false;
        if (state.pending) {
          state.pending = false;
          setTimeout(run, 0);
        } else if (_layerRenderState.get(id) === state) {
          _layerRenderState.delete(id);
        }
      });
    return true;
  };

  if (!run()) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const success = run();
      if (success || attempts > 12) { // Max 12 attempts (3.6s)
        clearInterval(interval);
        if (!success) {
          console.warn(`[navigation] Layer ${id} failed to render: function not found in window.`);
          const target = document.getElementById(id);
          if (target) {
            const body = target.querySelector(".layer-body") || target;
            if (!body.innerHTML.trim() || body.innerHTML.includes("spinner")) {
               body.innerHTML = '<div style="text-align:center;padding:48px;color:var(--dim);">Gagal memuat konten. Harap muat ulang aplikasi.</div>';
            }
          }
        }
      }
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
  if (!_suppressHistory && _appHistIdx > 0) {
    // Jika kita menutup layer yang ada di history, lebih baik back()
    // Tapi kita perlu cek apakah state saat ini memang layer tersebut
    const snap = _appHistory[_appHistIdx];
    if (snap && snap.activeLayers.includes(id)) {
      history.back();
      return;
    }
  }

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
  // Auto-focus removed as per user request to avoid auto-active keyboard
}

export function backToDash() {
  if (_appHistIdx > 0) {
    history.back();
  } else {
    // Fallback jika tidak ada history
    _cleanupCurrentScreen();
    document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
    const dash = document.getElementById("dash");
    dash.classList.add("active");
    dash.scrollTop = _screenScrollPos["dash"] ?? 0;
    _navStack = [{ type: "dash" }];
    setFabVisible(true);
    _syncNavbar();
  }
}

export function backToLayer(id) {
  if (_appHistIdx > 0) {
    const prevSnap = _appHistory[_appHistIdx - 1];
    if (prevSnap && prevSnap.activeLayers.includes(id)) {
      history.back();
      return;
    }
  }

  _cleanupCurrentScreen();
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.querySelectorAll(".layer").forEach((l) => l.classList.remove("active"));
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

/* Mouse back/forward biarkan default browser menangani history */

/* ── Expose ke window (dipanggil dari HTML onclick) ── */
window.bnavGoTo = bnavGoTo;
window.showScreen = showScreen;
window.openLayer = openLayer;
window.closeLayer = closeLayer;
window.backToDash = backToDash;
window.backToLayer = backToLayer;
window.initAppHistory = initAppHistory;
window.appBack = () => history.back();
