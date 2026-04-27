/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   APP/ONBOARDING.JS — First-time Onboarding + Placement
   ============================================================ */

import { showScreen } from "../core/navigation.js";
import { unlockTier, loadUnlockedTiers } from "../utilities/tier-unlock.js";
import { supa } from "../core/config.js";

const LS_ONBOARDING = "hsk_onboarding_done";
const OB_ONBOARDING_SLIDES = 7; // slide onboarding murni (0–6)
const OB_PLACEMENT_SLIDES = 3; // slide placement (7–9)
const OB_RESULT_SLIDES = 1; // slide result (10)
const OB_TOTAL = OB_ONBOARDING_SLIDES + OB_PLACEMENT_SLIDES + OB_RESULT_SLIDES; // = 11

let _obCur = 0;
let _obReadTimer = null;
let _obReadStep = 0;

/* ══════════════════════════════════════════
   PLACEMENT STATE
══════════════════════════════════════════ */
const _plAnswers = [null, null, null];

const _PL_TIERS = [
  { key: "pemula", name: "Pemula", hsk: "HSK 1–2", hz: "零" },
  { key: "menengah", name: "Menengah", hsk: "HSK 3", hz: "基" },
  { key: "lanjut", name: "Lanjut", hsk: "HSK 4", hz: "中" },
  { key: "master", name: "Master", hsk: "HSK 5", hz: "进" },
  { key: "fasih", name: "Fasih", hsk: "HSK 6", hz: "精" },
];

function _plGetUnlockCount(levelVal) {
  return Math.min((levelVal ?? 0) + 1, 5);
}

export function _plSelect(question, val) {
  _plAnswers[question] = val;

  document
    .querySelectorAll(`#pl-opts-${question} .ob-pl-opt`)
    .forEach((o) => o.classList.remove("selected"));
  const sel = document.querySelector(
    `#pl-opts-${question} .ob-pl-opt[data-val="${val}"]`,
  );
  if (sel) sel.classList.add("selected");

  setTimeout(() => {
    if (question === 0) _obGoTo(8);
    else if (question === 1) _obGoTo(9);
    else if (question === 2) _plShowResult();
  }, 280);
}

export function _plBack(currentSlide) {
  _obGoTo(currentSlide - 1);
}

function _plShowResult() {
  const level = _plAnswers[0] ?? 0;
  const unlockCount = _plGetUnlockCount(level);

  const hzEl = document.getElementById("ob-pl-res-hz");
  const titleEl = document.getElementById("ob-pl-res-title");
  const subEl = document.getElementById("ob-pl-res-sub");
  const listEl = document.getElementById("ob-pl-unlock-list");

  if (hzEl) hzEl.textContent = _PL_TIERS[level]?.hz || "坚";
  if (titleEl)
    titleEl.textContent =
      level === 0
        ? "Mulai dari awal!"
        : `${_PL_TIERS[level - 1]?.name || ""} terdeteksi!`;
  if (subEl) subEl.textContent = `${unlockCount} dari 5 tier dibuka untukmu.`;

  if (listEl) {
    listEl.innerHTML = _PL_TIERS
      .map((t, i) => {
        const active = i < unlockCount;
        return `<div class="ob-pl-unlock-item${active ? " active" : ""}">
        <div class="ob-pl-unlock-dot"></div>
        <div class="ob-pl-unlock-info">
          <span class="ob-pl-unlock-name">${t.name}</span>
          <span class="ob-pl-unlock-hsk">${t.hsk}</span>
        </div>
        <span class="ob-pl-unlock-status">${active ? "Terbuka" : "Terkunci"}</span>
      </div>`;
      })
      .join("");
  }

  _obGoTo(OB_ONBOARDING_SLIDES + OB_PLACEMENT_SLIDES); // slide 10 = result
}

export async function _plFinish() {
  const level = _plAnswers[0] ?? 0;
  const hanzi_mode = _plAnswers[1] ?? 0;
  const goal = _plAnswers[2] ?? 0;
  const unlockCount = _plGetUnlockCount(level);

  const btn = document.getElementById("ob-pl-start-btn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Menyimpan...";
  }

  const tierKeys = _PL_TIERS.slice(0, unlockCount).map((t) => t.key);
  for (const key of tierKeys) await unlockTier(key);

  localStorage.setItem(
    "hsk_placement_done",
    JSON.stringify({ level, hanzi_mode, goal }),
  );

  const {
    data: { user },
  } = await supa.auth.getUser();

  // Simpan placement
  const { error } = await supa.from("user_placement").upsert(
    {
      user_id: user?.id ?? null,
      level,
      hanzi_mode,
      goal,
      unlocked_count: unlockCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  // FIX BUG 1: Satu kali upsert saja untuk user_profile
  // has_seen_onboarding + unlocked_tiers disimpan di sini,
  // _finishOnboarding tidak perlu update lagi
  if (user?.id) {
    await supa.from("user_profile").upsert(
      {
        user_id: user.id,
        has_seen_onboarding: true,
        unlocked_tiers: tierKeys,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  }

  if (error) console.warn("[placement] Gagal simpan ke DB:", error.message);

  _finishOnboarding(true); // flag: sudah simpan DB, skip update lagi
}

/* ══════════════════════════════════════════
   ONBOARDING CORE
══════════════════════════════════════════ */
function _obUpdateDotIndicator(n) {
  const DOT_SIZE = 6,
    DOT_GAP = 6,
    INDICATOR_W = 14,
    PADDING_L = 4;
  const dotN = Math.min(n, OB_ONBOARDING_SLIDES - 1);
  const dotCenter = PADDING_L + dotN * (DOT_SIZE + DOT_GAP) + DOT_SIZE / 2;
  const offset = dotCenter - INDICATOR_W / 2;
  const indicator = document.getElementById("ob-dot-indicator");
  if (indicator) indicator.style.transform = `translateX(${offset}px)`;
}

export async function checkOnboarding() {
  const {
    data: { user },
  } = await supa.auth.getUser();

  if (!user) {
    _showOnboarding();
    return true;
  }

  try {
    const [profRes, placeRes] = await Promise.all([
      supa
        .from("user_profile")
        .select("has_seen_onboarding")
        .eq("user_id", user.id)
        .maybeSingle(),
      supa
        .from("user_placement")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const hasSeen = profRes.data?.has_seen_onboarding;
    const hasPlacement = !!placeRes.data;

    if (!hasSeen || !hasPlacement) {
      _showOnboarding();
      return true;
    }
  } catch (err) {
    console.error("Gagal verifikasi status onboarding:", err);
    _showOnboarding();
    return true;
  }

  return false;
}

function _showOnboarding() {
  const el = document.getElementById("onboarding-overlay");
  if (!el) return;
  document.body.classList.add("ob-open");
  document.body.classList.add("app-ready");
  _obRenderDots();
  el.style.display = "flex";
  _obCur = 0;
  _obGoTo(0);
}

function _obRenderDots() {
  const container = document.getElementById("ob-dots-fixed");
  if (!container) return;
  container.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.style.cssText =
    "position:relative; display:flex; gap:6px; align-items:center; padding:0 4px;";
  for (let i = 0; i < OB_ONBOARDING_SLIDES; i++) {
    const d = document.createElement("div");
    d.className = "ob-dot";
    d.onclick = () => _obGoTo(i);
    wrapper.appendChild(d);
  }
  const indicator = document.createElement("div");
  indicator.className = "ob-dot-indicator";
  indicator.id = "ob-dot-indicator";
  wrapper.appendChild(indicator);
  container.appendChild(wrapper);
  _obUpdateDotIndicator(0);
}

// FIX BUG 1: Tambah param skipDBUpdate agar tidak double-write
async function _finishOnboarding(skipDBUpdate = false) {
  console.log("🏁 Onboarding selesai");

  localStorage.setItem(LS_ONBOARDING, "1");

  // Hanya update DB jika belum dilakukan oleh _plFinish
  if (!skipDBUpdate) {
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (user) {
      const { error } = await supa
        .from("user_profile")
        .update({ has_seen_onboarding: true })
        .eq("user_id", user.id);

      if (error) console.warn("Gagal update onboarding status:", error);
      else console.log("✅ Onboarding status tersimpan di DB");
    }
  }

  document.body.classList.remove("ob-open");
  const el = document.getElementById("onboarding-overlay");
  if (!el) return;

  el.classList.add("hiding");
  setTimeout(() => {
    el.style.display = "none";
    el.classList.remove("hiding");
    showScreen("petualangan-screen");

    // Reload data setelah onboarding selesai
    if (typeof window.loadScores === "function")
      window.loadScores().catch(console.error);
    if (typeof window.loadDashboardCounts === "function")
      window.loadDashboardCounts().catch(console.error);

    if (typeof window.renderHeatmap === "function") {
      window.renderHeatmap().then(() => {
        window.checkTour?.();
      });
    } else {
      window.checkTour?.();
    }
  }, 420);
}

export function _obGoTo(n) {
  if (n >= OB_TOTAL) {
    _finishOnboarding();
    return;
  }
  _obCur = n;
  const track = document.getElementById("ob-track");
  if (track) track.style.transform = `translateX(${-n * (100 / OB_TOTAL)}%)`;
  _obUpdateDotIndicator(n);

  const isOnboarding = n < OB_ONBOARDING_SLIDES;
  const isLastOnboarding = n === OB_ONBOARDING_SLIDES - 1;
  const isPlacement = n >= OB_ONBOARDING_SLIDES;

  const skip = document.getElementById("ob-skip");
  if (skip)
    skip.style.display = isOnboarding && !isLastOnboarding ? "" : "none";

  const prev = document.getElementById("ob-arrow-prev");
  const next = document.getElementById("ob-arrow-next");
  if (prev) prev.classList.toggle("hidden", n === 0 || isPlacement);
  if (next) next.classList.toggle("hidden", isLastOnboarding || isPlacement);

  const dotsFixed = document.getElementById("ob-dots-fixed");
  if (dotsFixed) dotsFixed.style.opacity = isPlacement ? "0" : "1";

  const bar = document.getElementById("ob-finish-bar");
  if (bar) {
    bar.classList.toggle("visible", isLastOnboarding);
    const btn = document.getElementById("ob-btn");
    if (btn) btn.textContent = "Mulai Belajar";
  }

  if (n === 1) _obStartFlashcard();
  else _obStopFlashcard();
  if (n === 2) _obStartQuiz();
  if (n === 3) _obStartGrammar();
  else _obStopGrammar();
  if (n === 4) _obStartKalFC();
  if (n === 5) _obStartRead();
  else _obStopRead();
  if (n === 6) _obStartPath();
  else _obStopPath();
}

export function _obStartPlacement() {
  _obGoTo(OB_ONBOARDING_SLIDES); // → slide 7
}

/* ── Slide animations ── */
let _obFcTimer = null;
function _obStopFlashcard() {
  if (_obFcTimer) {
    clearTimeout(_obFcTimer);
    _obFcTimer = null;
  }
}
function _obStartFlashcard() {
  _obStopFlashcard();
  const c1 = document.querySelector(".ob-fc-c1");
  const c2 = document.querySelector(".ob-fc-c2");
  const c3 = document.querySelector(".ob-fc-c3");
  const sw = document.querySelector(".ob-swipe-row");
  if (!c1) return;
  const reset = (el, delay, finalStyle) => {
    el.style.transition = "none";
    el.style.transform = finalStyle.replace(
      /rotate\(([^)]+)\)/,
      "rotate($1) translateY(120px)",
    );
    el.style.opacity = "0";
    _obFcTimer = setTimeout(() => {
      el.style.transition = `transform 0.55s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms, opacity 0.4s ease ${delay}ms`;
      el.style.transform = finalStyle;
      el.style.opacity = el === c3 ? "0.4" : el === c2 ? "0.65" : "1";
    }, 80);
  };
  if (sw) sw.style.opacity = "0";
  reset(c3, 0, "rotate(-8deg) translateY(0)");
  reset(c2, 150, "rotate(-4deg) translateY(0)");
  reset(c1, 300, "rotate(0deg) translateY(0)");
  _obFcTimer = setTimeout(() => {
    if (sw) {
      sw.style.transition = "opacity 0.4s ease";
      sw.style.opacity = "1";
    }
  }, 800);
}

let _obQuizTimers = [];
function _obStopQuiz() {
  _obQuizTimers.forEach((t) => clearTimeout(t));
  _obQuizTimers = [];
}
function _obStartQuiz() {
  _obStopQuiz();
  const opts = ["ob-qopt-a", "ob-qopt-b", "ob-qopt-c", "ob-qopt-d"].map((id) =>
    document.getElementById(id),
  );
  if (!opts[0]) return;
  opts.forEach((el) => {
    if (!el) return;
    el.style.transition = "none";
    el.style.opacity = "0";
    el.style.transform = "translateY(18px)";
    el.classList.remove("ob-opt-correct-anim");
  });
  opts.forEach((el, i) => {
    if (!el) return;
    const t = setTimeout(
      () => {
        if (_obCur !== 2) return;
        el.style.transition = `opacity 0.38s ease, transform 0.42s cubic-bezier(0.34,1.3,0.64,1)`;
        el.style.opacity = "1";
        el.style.transform = "translateY(0)";
      },
      300 + i * 140,
    );
    _obQuizTimers.push(t);
  });
  const t2 = setTimeout(
    () => {
      if (_obCur !== 2) return;
      opts[0]?.classList.add("ob-opt-correct-anim");
    },
    300 + opts.length * 140 + 350,
  );
  _obQuizTimers.push(t2);
}

let _obGramTimers = [];
function _obStopGrammar() {
  _obGramTimers.forEach((t) => clearTimeout(t));
  _obGramTimers = [];
}
function _obStartGrammar() {
  _obStopGrammar();
  const dropZone = document.getElementById("ob-gram-drop");
  const bankEl = document.getElementById("ob-gram-bank");
  const fb = document.getElementById("ob-gram-fb");
  if (!dropZone || !bankEl) return;
  dropZone.innerHTML =
    '<span class="ob-gram-placeholder">susun di sini...</span>';
  fb.style.opacity = "0";
  fb.textContent = "";
  const chips = bankEl.querySelectorAll(".ob-gram-chip");
  chips.forEach((c) => {
    c.style.transition = "none";
    c.style.opacity = "0";
    c.style.transform = "translateY(10px)";
    c.classList.remove("ob-gram-used");
  });
  chips.forEach((c, i) => {
    const t = setTimeout(
      () => {
        if (_obCur !== 3) return;
        c.style.transition =
          "opacity 0.35s ease, transform 0.4s cubic-bezier(0.34,1.3,0.64,1)";
        c.style.opacity = "1";
        c.style.transform = "translateY(0)";
      },
      300 + i * 130,
    );
    _obGramTimers.push(t);
  });
  const startDrop = 300 + chips.length * 130 + 300;
  ["ob-gc-wo", "ob-gc-chi", "ob-gc-fan"].forEach((id, i) => {
    const t = setTimeout(
      () => {
        if (_obCur !== 3) return;
        const chip = document.getElementById(id);
        if (!chip) return;
        chip.classList.add("ob-gram-used");
        const clone = document.createElement("div");
        clone.className = "ob-gram-chip ob-gram-dropped";
        clone.innerHTML = chip.innerHTML;
        clone.style.opacity = "0";
        clone.style.transform = "scale(0.8) translateY(6px)";
        const ph = dropZone.querySelector(".ob-gram-placeholder");
        if (ph) ph.remove();
        dropZone.appendChild(clone);
        requestAnimationFrame(() => {
          clone.style.transition =
            "opacity 0.3s ease, transform 0.35s cubic-bezier(0.34,1.4,0.64,1)";
          clone.style.opacity = "1";
          clone.style.transform = "scale(1) translateY(0)";
        });
      },
      startDrop + i * 500,
    );
    _obGramTimers.push(t);
  });
  const t3 = setTimeout(
    () => {
      if (_obCur !== 3) return;
      fb.textContent = "✓ Benar! 我吃饭 = Saya makan nasi.";
      fb.style.transition = "opacity 0.4s ease";
      fb.style.opacity = "1";
    },
    startDrop + 3 * 500 + 200,
  );
  _obGramTimers.push(t3);
}

function _obStartKalFC() {
  const card = document.getElementById("ob-kalfc");
  const prog = document.getElementById("ob-reveal-fill");
  const pyEl = card?.querySelector(".ob-kalfc-py");
  const idEl = card?.querySelector(".ob-kalfc-id");
  if (!card) return;
  card.classList.remove("revealed", "revealed-py");
  if (prog) prog.style.width = "0%";
  if (pyEl) {
    pyEl.style.opacity = "0";
    pyEl.style.transform = "translateY(4px)";
  }
  if (idEl) {
    idEl.style.opacity = "0";
    idEl.style.transform = "translateY(4px)";
  }
  setTimeout(() => {
    if (_obCur !== 4) return;
    if (pyEl) {
      pyEl.style.transition = "opacity 0.45s ease, transform 0.45s ease";
      pyEl.style.opacity = "1";
      pyEl.style.transform = "translateY(0)";
    }
    if (prog) prog.style.width = "50%";
    setTimeout(() => {
      if (_obCur !== 4) return;
      if (idEl) {
        idEl.style.transition =
          "opacity 0.45s ease 0.08s, transform 0.45s ease 0.08s";
        idEl.style.opacity = "1";
        idEl.style.transform = "translateY(0)";
      }
      if (prog) prog.style.width = "100%";
      card.classList.add("revealed");
    }, 1000);
  }, 1000);
}

function _obStopRead() {
  if (_obReadTimer) {
    clearInterval(_obReadTimer);
    _obReadTimer = null;
  }
}
function _obStartRead() {
  _obStopRead();
  _obReadStep = 0;
  const fill = document.getElementById("ob-read-fill");
  const p2 = document.getElementById("ob-read-p2");
  const p3 = document.getElementById("ob-read-p3");
  if (fill) fill.style.width = "15%";
  if (p2) p2.classList.add("dim");
  if (p3) p3.classList.add("dim");
  _obReadTimer = setInterval(() => {
    if (_obCur !== 5) {
      _obStopRead();
      return;
    }
    _obReadStep++;
    if (_obReadStep === 1 && p2) {
      p2.classList.remove("dim");
      if (fill) fill.style.width = "50%";
    } else if (_obReadStep === 2 && p3) {
      p3.classList.remove("dim");
      if (fill) fill.style.width = "85%";
    } else if (_obReadStep >= 3) _obStopRead();
  }, 1600);
}

let _obPathTimer = null,
  _obPathFrame = null;
function _obStopPath() {
  if (_obPathTimer) {
    clearTimeout(_obPathTimer);
    _obPathTimer = null;
  }
  if (_obPathFrame) {
    cancelAnimationFrame(_obPathFrame);
    _obPathFrame = null;
  }
  const line = document.getElementById("ob-path-line");
  if (line) line.style.strokeDashoffset = "750";
  for (let i = 0; i < 5; i++) {
    document.getElementById("ob-pd-" + i)?.classList.remove("show");
    document.getElementById("ob-pl-" + i)?.classList.remove("show");
  }
}
function _obStartPath() {
  _obStopPath();
  const line = document.getElementById("ob-path-line");
  if (!line) return;
  const totalLen = 750,
    duration = 2200,
    dotAt = [0, 0.25, 0.5, 0.75, 1.0],
    triggered = [false, false, false, false, false];
  let start = null;
  function step(ts) {
    if (_obCur !== 6) return;
    if (!start) start = ts;
    const progress = Math.min((ts - start) / duration, 1);
    line.style.strokeDashoffset = String(totalLen * (1 - progress));
    dotAt.forEach((threshold, i) => {
      if (!triggered[i] && progress >= threshold) {
        triggered[i] = true;
        document.getElementById("ob-pd-" + i)?.classList.add("show");
        document.getElementById("ob-pl-" + i)?.classList.add("show");
      }
    });
    if (progress < 1) {
      _obPathFrame = requestAnimationFrame(step);
    } else {
      _obPathTimer = setTimeout(() => {
        if (_obCur === 6) _obStartPath();
      }, 1500);
    }
  }
  _obPathFrame = requestAnimationFrame(step);
}

/* ── Swipe gesture ── */
(function () {
  let _sx = 0,
    _sy = 0,
    _sTime = 0;
  function _obTouchStart(e) {
    _sx = e.touches[0].clientX;
    _sy = e.touches[0].clientY;
    _sTime = Date.now();
  }
  function _obTouchEnd(e) {
    const dx = e.changedTouches[0].clientX - _sx,
      dy = e.changedTouches[0].clientY - _sy,
      dt = Date.now() - _sTime;
    if (_obCur >= OB_ONBOARDING_SLIDES) return;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 44 && dt < 400) {
      if (dx < 0 && _obCur < OB_ONBOARDING_SLIDES - 1) _obGoTo(_obCur + 1);
      else if (dx > 0 && _obCur > 0) _obGoTo(_obCur - 1);
    }
  }
  document.addEventListener("DOMContentLoaded", () => {
    const overlay = document.getElementById("onboarding-overlay");
    if (!overlay) return;
    overlay.addEventListener("touchstart", _obTouchStart, { passive: true });
    overlay.addEventListener("touchend", _obTouchEnd, { passive: true });
    document.addEventListener("keydown", (e) => {
      if (!overlay || overlay.style.display === "none") return;
      if (_obCur >= OB_ONBOARDING_SLIDES) return;
      if (e.key === "ArrowRight" && _obCur < OB_ONBOARDING_SLIDES - 1)
        _obGoTo(_obCur + 1);
      if (e.key === "ArrowLeft" && _obCur > 0) _obGoTo(_obCur - 1);
    });
  });
})();

/* ── Expose ke window ── */
window.checkOnboarding = checkOnboarding;
window._obGoTo = _obGoTo;
window._obStartPlacement = _obStartPlacement;
window._plSelect = _plSelect;
window._plBack = _plBack;
window._plFinish = _plFinish;
Object.defineProperty(window, "_obCur", { get: () => _obCur });
window._finishOnboarding = _finishOnboarding;
