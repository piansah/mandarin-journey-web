/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   UTILITIES/HELPERS.JS
   ============================================================ */

import { getCurrentUser } from "../core/auth.js";

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function lsGet(key, fallback = {}) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function lsSet(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}

// ✅ TAMBAHKAN FUNGSI lsRemove
export function lsRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

function _scopedUid() {
  return getCurrentUser()?.id || "guest";
}

export function lsGetScoped(key, fallback = {}) {
  const all = lsGet(key, {});
  return all[_scopedUid()] ?? fallback;
}

export function lsSetScoped(key, value) {
  const all = lsGet(key, {});
  all[_scopedUid()] = value;
  lsSet(key, all);
}

export function lsRemoveScoped(key) {
  const all = lsGet(key, {});
  delete all[_scopedUid()];
  lsSet(key, all);
}

let _toastTimer = null;

export function showToast(msg, type = "info") {
  const existing = document.getElementById("app-toast");
  if (existing) existing.remove();
  if (_toastTimer) clearTimeout(_toastTimer);

  const colors = {
    info: {
      bg: "rgba(30,30,50,0.97)",
      border: "rgba(232,201,109,0.25)",
      icon: "ℹ️",
    },
    warn: {
      bg: "rgba(30,30,50,0.97)",
      border: "rgba(232,201,109,0.5)",
      icon: "⚠️",
    },
    err: {
      bg: "rgba(40,20,20,0.97)",
      border: "rgba(248,113,113,0.4)",
      icon: "✕",
    },
    ok: {
      bg: "rgba(20,40,30,0.97)",
      border: "rgba(74,222,128,0.4)",
      icon: "✓",
    },
  };
  colors.success = colors.ok;
  const c = colors[type] || colors.info;

  const toast = document.createElement("div");
  toast.id = "app-toast";
  toast.style.cssText = `
    position:fixed; bottom:88px; left:50%; transform:translateX(-50%) translateY(16px);
    background:${c.bg}; border:1px solid ${c.border}; border-radius:12px;
    padding:12px 20px; display:flex; align-items:center; gap:10px;
    font-family:'Poppins',sans-serif; font-size:13px; color:var(--txt);
    box-shadow:0 8px 32px rgba(0,0,0,0.4); z-index:9999; max-width:320px;
    opacity:0; transition:opacity 0.2s ease, transform 0.2s ease; white-space:nowrap;
  `;
  toast.innerHTML = `<span style="font-size:16px;flex-shrink:0">${c.icon}</span><span>${msg}</span>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });
  });

  const duration = type === "err" ? 3500 : 2500;
  _toastTimer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(-50%) translateY(8px)";
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, duration);
}

let _xpToastTimer = null;

export function showXPToast(xp, label) {
  const user = getCurrentUser();
  if (!user) return;
  const existing = document.getElementById("xp-toast");
  if (existing) existing.remove();
  if (_xpToastTimer) clearTimeout(_xpToastTimer);

  const toast = document.createElement("div");
  toast.id = "xp-toast";
  toast.innerHTML = `<span class="xp-toast-points">+${xp} XP</span><span class="xp-toast-label">${label}</span>`;
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add("show"));
  });

  _xpToastTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, 2500);
}
