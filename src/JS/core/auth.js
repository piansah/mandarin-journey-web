/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   CORE/AUTH.JS — Auth State, Login, Logout, Auth Modal
   ============================================================ */

import {
  supa,
  appKeys,
  initKeys,
  LS_ACTIVE_QUIZ,
  LS_ACTIVE_KAL,
  LS_QUIZ_STATE,
  LS_KAL_STATE,
  LS_GRAM_STATE,
} from "./config.js";
import { SVG_GOOGLE } from "../../assets/icon.js";
import { showScreen } from "./navigation.js";
import {
  lsGet,
  lsSet,
  lsGetScoped,
  lsRemoveScoped,
  dbDel,
  showToast,
} from "../utilities/helpers.js";
import { loadUnlockedTiers } from "../utilities/tier-unlock.js";

let _authInitDone = false;
let _authListener = null;
let _lastBackgroundLoad = 0;
let _pendingSignedIn = false;

// FIX BUG 2: Guard agar checkOnboarding tidak dipanggil paralel/berulang
let _onboardingCheckPromise = null;

// FIX BUG 6: Cache _ensureUserProfile agar tidak query DB berkali-kali
const _ensuredProfiles = new Set();

/* ── currentUser — getter/setter ── */
let _currentUser = null;
export function getCurrentUser() {
  return _currentUser;
}
export function setCurrentUser(u) {
  _currentUser = u;
}

// FIX BUG 6: _ensureUserProfile hanya insert sekali per session per user_id
async function _ensureUserProfile(user) {
  if (!user) return;
  if (_ensuredProfiles.has(user.id)) return;

  const { data } = await supa
    .from("user_profile")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) {
    const displayName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Pelajar";

    await supa.from("user_profile").insert({
      user_id: user.id,
      display_name: displayName,
      has_seen_onboarding: false,
      unlocked_tiers: ["pemula"],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  _ensuredProfiles.add(user.id);
}

// FIX BUG 2: Wrapper agar checkOnboarding hanya jalan satu instance sekaligus dengan Safety Timeout 5 detik
async function _checkOnboardingOnce() {
  if (_onboardingCheckPromise) return _onboardingCheckPromise;
  _onboardingCheckPromise = (async () => {
    try {
      const timeout = new Promise(resolve => setTimeout(() => resolve(false), 5000));
      return await Promise.race([
        window.checkOnboarding?.() || Promise.resolve(false),
        timeout
      ]);
    } catch (e) {
      return false;
    } finally {
      _onboardingCheckPromise = null;
    }
  })();
  return _onboardingCheckPromise;
}

function _loadGrammarCountsIfNeeded() {
  if (
    typeof window._gramTotalCount !== "undefined" &&
    window._gramTotalCount !== null
  ) {
    if (typeof window.updateGrammarDashboard === "function")
      window.updateGrammarDashboard();
    return;
  }
  if (typeof window.loadGrammarCounts === "function")
    window.loadGrammarCounts();
}

let _isBackgroundLoading = false;
async function _backgroundLoad() {
  const now = Date.now();
  if (now - _lastBackgroundLoad < 5_000 || _isBackgroundLoading) return;
  _lastBackgroundLoad = now;
  _isBackgroundLoading = true;

  try {
    // Sequenced loading to avoid request storm
    console.log("[Auth] Starting background data load...");
    await window.loadScores?.();
    await window.loadDashboardCounts?.();
    window.loadKosvok?.();
    _loadGrammarCountsIfNeeded();
    window.updateHanziDashboard?.();
  } catch (e) {
    console.warn("Background load partial fail", e);
  } finally {
    _isBackgroundLoading = false;
  }
}

export async function initAuth() {
  if (!appKeys.QUIZ_KEYS.length) await initKeys();

  if (!_authListener) {
    const { data } = supa.auth.onAuthStateChange(async (event, session) => {
      setCurrentUser(session?.user || null);
      updateAuthUI();

      if (event === "SIGNED_IN") {
        if (!_authInitDone) {
          _pendingSignedIn = true;
          return;
        }
        await _ensureUserProfile(_currentUser);
        window.resetTiersCache?.();
        await loadUnlockedTiers();
        closeAuthModal();

        // FIX BUG 2: gunakan wrapper, bukan langsung checkOnboarding
        const obShown = await _checkOnboardingOnce();

        const onLoginScreen = document
          .getElementById("login-screen")
          ?.classList.contains("active");
        const anyScreenActive = !!document.querySelector(".screen.active");

        if ((onLoginScreen || !anyScreenActive) && !obShown) {
          if (window.restoreLastNavigationState?.()) {
            window.checkTour?.();
            _backgroundLoad();
            return;
          }
          showScreen("dash");
          window.checkTour?.();
        }

        if (obShown) return;
        _backgroundLoad();
      } else if (event === "SIGNED_OUT") {
        closeAuthModal();
        // Reset profile cache saat logout
        _ensuredProfiles.clear();
        const content = document.getElementById("auth-content");
        if (content) content.innerHTML = "";
        lsRemoveScoped(LS_ACTIVE_QUIZ);
        lsRemoveScoped(LS_ACTIVE_KAL);
        showScreen("login-screen");
        [
          window.quizScores,
          window.kalScores,
          window.gramScores,
          window.ceritaScores,
          window.fcScores,
        ].forEach((obj) => {
          if (obj) Object.keys(obj).forEach((k) => delete obj[k]);
        });
        window._gramSetsCache = null;
        window._ceritaSetsCache = null;
        window._ceritaTotalCount = null;
        if (typeof window._streakRecordedDate !== "undefined")
          window._streakRecordedDate = null;
        window.renderActList?.();
        window.updateDailyProgress?.();
        window.renderStats?.();
        window.updateCeritaDashboard?.();
      } else if (event === "TOKEN_REFRESHED") {
        if (_currentUser && _authInitDone) {
          const now = Date.now();
          if (now - _lastBackgroundLoad > 30_000) {
            _lastBackgroundLoad = now;
            window.loadKosvok?.();
            window.loadScores?.();
            _loadGrammarCountsIfNeeded();
            window.updateHanziDashboard?.();
          }
        }
      } else if (["USER_UPDATED", "INITIAL_SESSION"].includes(event)) {
        if (_currentUser && _authInitDone) {
          const now = Date.now();
          if (now - _lastBackgroundLoad > 30_000) {
            _lastBackgroundLoad = now;
            window.loadKosvok?.();
            window.loadScores?.();
            _loadGrammarCountsIfNeeded();
            window.updateHanziDashboard?.();
          }
        }
      }
    });
    _authListener = data;
  }

  const {
    data: { session },
    error: sessionError,
  } = await supa.auth.getSession();

  if (
    sessionError?.message?.includes("Refresh Token") ||
    sessionError?.message?.includes("refresh_token")
  ) {
    await supa.auth.signOut();
    setCurrentUser(null);
  } else {
    setCurrentUser(session?.user || null);
  }

  if (_currentUser) {
    _lastBackgroundLoad = Date.now();

    // FIX BUG 2: Satu kali cek onboarding di awal, tidak diulang lagi di bawah
    const obShown = await _checkOnboardingOnce();
    if (obShown) return;

    if (typeof window.initAvatarSystem === "function")
      await window.initAvatarSystem();
    await _ensureUserProfile(_currentUser);
    window.resetTiersCache?.();
    await loadUnlockedTiers();
    updateAuthUI();
    window.loadKosvok?.();
    window.loadScores?.();
    window.loadDashboardCounts?.();
    _loadGrammarCountsIfNeeded();
    window.updateHanziDashboard?.();
  } else {
    updateAuthUI();
  }

  const _activeQuizKey = lsGetScoped(LS_ACTIVE_QUIZ, null);
  const _activeKalKey = lsGetScoped(LS_ACTIVE_KAL, null);
  const rawQuizKey = typeof _activeQuizKey === "string" ? _activeQuizKey : null;
  const rawKalKey = typeof _activeKalKey === "string" ? _activeKalKey : null;
  const quizState = rawQuizKey
    ? (lsGetScoped(LS_QUIZ_STATE, {}) || {})[rawQuizKey]
    : null;
  const kalState = rawKalKey
    ? (lsGetScoped(LS_KAL_STATE, {}) || {})[rawKalKey]
    : null;
  const shouldRestoreQuiz =
    _currentUser && rawQuizKey && quizState && !quizState.submitted;
  const shouldRestoreKal =
    _currentUser && rawKalKey && kalState && !kalState.submitted;
  if (!shouldRestoreQuiz) lsRemoveScoped(LS_ACTIVE_QUIZ);
  if (!shouldRestoreKal) lsRemoveScoped(LS_ACTIVE_KAL);

  try {
    if (shouldRestoreQuiz) {
      await window.startQuiz?.(rawQuizKey);
    } else if (shouldRestoreKal) {
      await window.startKalimat?.(rawKalKey);
    } else {
      if (_currentUser) {
        // FIX BUG 2: tidak perlu checkOnboarding lagi, sudah dilakukan di atas
        if (!window.restoreLastNavigationState?.()) showScreen("dash");
        window.checkTour?.();
      } else {
        showScreen("login-screen");
      }
    }
  } catch (err) {
    console.error("initAuth restore error:", err);
    lsRemoveScoped(LS_ACTIVE_QUIZ);
    lsRemoveScoped(LS_ACTIVE_KAL);
    if (_currentUser) {
      if (!window.restoreLastNavigationState?.()) showScreen("dash");
    } else {
      showScreen("login-screen");
    }
  } finally {
    _authInitDone = true;
    document.body.classList.add("app-ready");

    if (_pendingSignedIn && _currentUser) {
      _pendingSignedIn = false;
      await _ensureUserProfile(_currentUser);
      window.resetTiersCache?.();
      await loadUnlockedTiers();

      const onLoginScreen = document
        .getElementById("login-screen")
        ?.classList.contains("active");
      const anyScreenActive = !!document.querySelector(".screen.active");

      // FIX BUG 2: gunakan wrapper, bukan checkOnboarding langsung
      const obShown = await _checkOnboardingOnce();

      if ((onLoginScreen || !anyScreenActive) && !obShown) {
        if (window.restoreLastNavigationState?.()) {
          _backgroundLoad();
          return;
        }
        showScreen("dash");
        window.checkTour?.();
      }

      if (!obShown) _backgroundLoad();
    }
  }
}

export function updateAuthUI() {
  if (_currentUser) {
    document.body.classList.add("user-logged-in");
  } else {
    document.body.classList.remove("user-logged-in");
  }
  window.renderFCPersonalList?.();
}

export function validateDisplayName(name) {
  const normalized = String(name || "").trim();
  if (!normalized)
    return { ok: false, value: "", message: "Nama tidak boleh kosong" };
  if (normalized.length > 30)
    return { ok: false, value: normalized, message: "Maksimal 30 karakter" };
  return { ok: true, value: normalized, message: "" };
}

export function openAuthModal() {
  if (_currentUser) {
    showScreen("profile-screen");
    return;
  }
  const overlay = document.getElementById("auth-modal");
  if (!overlay) return;
  overlay.classList.add("active");
  const scrollY = window.scrollY;
  document.body.dataset.scrollY = scrollY;
  document.body.style.top = `-${scrollY}px`;
  document.body.classList.add("modal-open");
  history.pushState({ authModal: true }, "");
  showGoogleLogin();
}

export function closeAuthModal() {
  const overlay = document.getElementById("auth-modal");
  if (!overlay || !overlay.classList.contains("active")) return;
  overlay.classList.remove("active");
  const scrollY = parseInt(document.body.dataset.scrollY || "0");
  document.body.classList.remove("modal-open");
  document.body.style.top = "";
  window.scrollTo(0, scrollY);
}

window.addEventListener("popstate", () => {
  const overlay = document.getElementById("auth-modal");
  if (overlay?.classList.contains("active")) closeAuthModal();
});

export function showGoogleLogin() {
  const tpl = document.getElementById("tpl-google-login");
  const content = document.getElementById("auth-content");
  if (!tpl || !content) return;
  content.innerHTML = "";
  content.appendChild(tpl.content.cloneNode(true));
}

export function showUserPanel() {
  if (!_currentUser?.email) return;
  const email = _currentUser.email;
  const googleName =
    _currentUser.user_metadata?.full_name ||
    _currentUser.user_metadata?.name ||
    email.split("@")[0];
  const name =
    (typeof window._profileCache !== "undefined" &&
      window._profileCache?.display_name) ||
    googleName;
  const avatar = _currentUser.user_metadata?.avatar_url;
  const initials = name.substring(0, 2).toUpperCase();
  const avatarSrc =
    typeof window.getActiveAvatarUrl === "function" && window._avatarCacheLoaded
      ? window.getActiveAvatarUrl()
      : avatar || null;

  const tpl = document.getElementById("tpl-user-panel");
  const content = document.getElementById("auth-content");
  if (!tpl || !content) return;
  content.innerHTML = "";
  const node = tpl.content.cloneNode(true);

  const ring = node.querySelector(".upv2-avatar-ring");
  if (avatarSrc) {
    const img = document.createElement("img");
    img.id = "upv2-avatar-img";
    img.src = avatarSrc;
    img.style.cssText =
      "width:100%;height:100%;object-fit:cover;border-radius:50%;";
    ring.appendChild(img);
  } else {
    const div = document.createElement("div");
    div.className = "profile-avatar-initials";
    div.textContent = initials;
    ring.appendChild(div);
  }

  node.querySelector("#upv2-name-display").textContent = name;
  node.querySelector("#upv2-rename-input").value = name;
  node.querySelector(".upv2-email").textContent = email;
  content.appendChild(node);

  window._injectProfileFromCache?.();
  window._injectAvatarToProfile?.();
}

export function toggleRenameInput() {
  const form = document.getElementById("upv2-rename-form");
  const nameDisplay = document.getElementById("upv2-name-display");
  const renameBtn = document.querySelector(".upv2-rename-btn");
  if (!form) return;
  const isHidden = form.style.display === "none";
  form.style.display = isHidden ? "flex" : "none";
  if (nameDisplay) nameDisplay.style.display = isHidden ? "none" : "";
  if (renameBtn) renameBtn.style.display = isHidden ? "none" : "";
  if (isHidden) {
    const input = document.getElementById("upv2-rename-input");
    if (input) {
      input.focus();
      input.select();
    }
  }
}

export async function saveDisplayName() {
  const input = document.getElementById("upv2-rename-input");
  if (!input) return;
  const validation = validateDisplayName(input.value);
  if (!validation.ok) {
    showToast(validation.message, "warn");
    return;
  }
  const newName = validation.value;
  const saveBtn = document.querySelector(".upv2-rename-save");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Menyimpan...";
  }
  try {
    const { error } = await supa
      .from("user_profile")
      .upsert(
        {
          user_id: _currentUser.id,
          display_name: newName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
    if (window._profileCache) window._profileCache.display_name = newName;
    const nameDisplay = document.getElementById("upv2-name-display");
    if (nameDisplay) nameDisplay.textContent = newName;
    toggleRenameInput();
    showToast("Nama berhasil diubah!", "ok");
  } catch (e) {
    showToast("Gagal menyimpan: " + e.message, "err");
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Simpan";
    }
  }
}

export async function doGoogleLoginScreen() {
  const btn = document.getElementById("btn-login");
  const msg = document.getElementById("login-msg");
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Membuka Google...';
  const { error } = await supa.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/" },
  });
  if (error) {
    btn.disabled = false;
    btn.innerHTML = `${SVG_GOOGLE} Masuk dengan Google`;
    if (msg) msg.textContent = "Gagal: " + error.message;
  }
}

export async function doGoogleLogin() {
  const btn = document.getElementById("btn-google-login");
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Membuka Google...';
  const { error } = await supa.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/" },
  });
  if (error) {
    btn.disabled = false;
    btn.innerHTML = `${SVG_GOOGLE} Masuk dengan Google`;
    const msg = document.getElementById("auth-msg");
    if (msg) {
      msg.className = "auth-msg err";
      msg.textContent = "Gagal: " + error.message;
    }
  }
}

export async function doLogout() {
  window.kosvokData = [];
  window.kosInitialized = false;
  window.kosSetsCache = null;
  window._quizSetsCache = null;
  window._kalSetsCache = null;
  window._hanziSetsCache = null;
  if (window._hanziCache)
    Object.keys(window._hanziCache).forEach(
      (k) => delete window._hanziCache[k],
    );
  window._gramSetsCache = null;
  window._ceritaSetsCache = null;
  window._ceritaTotalCount = null;
  if (typeof window._streakRecordedDate !== "undefined")
    window._streakRecordedDate = null;
  [
    window.hanziScores,
    window.gramScores,
    window.ceritaScores,
    window.fcScores,
  ].forEach((obj) => {
    if (obj) Object.keys(obj).forEach((k) => delete obj[k]);
  });
  lsSet(LS_GRAM_STATE, {});
  window.resetAvatarCache?.();
  window.resetProfileCache?.();
  window.resetGlobalSearchCache?.();

  // Bersihkan IndexedDB Cache
  await dbDel("hsk_global_search_cache_v3");

  await supa.auth.signOut();
}

/* ── Expose ke window ── */
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.showGoogleLogin = showGoogleLogin;
window.showUserPanel = showUserPanel;
window.doGoogleLogin = doGoogleLogin;
window.doGoogleLoginScreen = doGoogleLoginScreen;
window.doLogout = doLogout;
window.initAuth = initAuth;
window.toggleRenameInput = toggleRenameInput;
window.saveDisplayName = saveDisplayName;
