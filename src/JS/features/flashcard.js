/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   FLASHCARD.JS — Flashcard Engine + SRS (SM-2 Full) + Swipe/Touch/Mouse/Keyboard
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import {
  showScreen,
  backToLayer,
  backToDash,
  setFabVisible,
  _navStack,
  setNavStack,
  _pushAppHistory,
  updateNavbar,
} from "../core/navigation.js";
import {
  showToast,
  showXPToast,
  lsGet,
  lsSet,
  lsRemove,
  shuffle,
} from "../utilities/helpers.js";
import { colorPy, _stripTones, _solidifyHanzi } from "../utilities/pinyin.js";
import { showDoneScreen } from "../core/done-screen.js";
import { calcXPFCSession, XP } from "../utilities/xp.js";

/* ── State ── */
let currentFCKey = null;
let currentFCSetId = null;
let currentFCReturnLayer = "layer-kos-deck";
let fcCards = [];
let fcIdx = 0;
let fcFlipState = 0;
let _fcUniqueTotal = 0;
let _fcHafal = 0;
let _fcLupa = 0;
let _fcLupaIds = new Set();
let _fcPendingReviews = new Map();
let _fcPrevSessionXP = 0;
let _fcScoresFresh = false;
let _fcDoneShown = false;
let _fcBaseLength = 0; // panjang awal fcCards (tanpa duplikat)
let _fcRepeatQueue = []; // queue untuk kartu yang dilupakan
let _fcCardMeta = new Map(); // simpan metadata kartu asli lintas repeat queue
let _fcFlushPromise = null;

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */
function _todayStr() {
  return new Date().toLocaleDateString("en-CA");
}

function _fcShowHeader(visible) {
  const fcHd = document.querySelector("#fc-screen .fc-hd");
  const fcProg = document.querySelector("#fc-screen .fc-prog");
  if (fcHd) fcHd.style.display = visible ? "" : "none";
  if (fcProg) fcProg.style.display = visible ? "" : "none";
}

async function _getUser() {
  const currentUser = getCurrentUser();
  if (!currentUser) return null;
  const { data } = await supa.auth.getUser();
  return data?.user ?? null;
}

/* ══════════════════════════════════════════════════════════════
   RESET STATE (BARU)
══════════════════════════════════════════════════════════════ */
export function resetFCState() {
  fcCards = [];
  fcIdx = 0;
  fcFlipState = 0;
  _fcUniqueTotal = 0;
  _fcHafal = 0;
  _fcLupa = 0;
  _fcLupaIds.clear();
  _fcPendingReviews.clear();
  _fcPrevSessionXP = 0;
  _fcScoresFresh = false;
  _fcDoneShown = false;
  _fcBaseLength = 0;
  _fcRepeatQueue = [];
  _fcCardMeta.clear();
}

/* ══════════════════════════════════════════════════════════════
   SRS ENGINE — SM-2 Full
══════════════════════════════════════════════════════════════ */
function srsCalc(prev, quality) {
  let { srs_level, interval_days, ease_factor } = prev;

  if (quality < 3) {
    srs_level = 0;
    interval_days = 1;
    ease_factor = Math.max(1.3, ease_factor - 0.2);
  } else {
    if (srs_level === 0) {
      interval_days = 1;
    } else if (srs_level === 1) {
      interval_days = 6;
    } else {
      interval_days = Math.max(1, Math.round(interval_days * ease_factor));
    }
    srs_level += 1;
    const efBoost = Math.min(0.1, 0.02 * srs_level);
    ease_factor = Math.min(3.5, ease_factor + efBoost);
  }

  const next = new Date();
  next.setDate(next.getDate() + interval_days);
  const next_review = next.toLocaleDateString("en-CA");

  return { srs_level, interval_days, ease_factor, next_review };
}

async function srsSaveReview(cardId, quality) {
  const user = await _getUser();
  if (!user || !cardId) return;

  const { data: existing } = await supa
    .from("user_card_progress")
    .select("srs_level, interval_days, ease_factor")
    .eq("user_id", user.id)
    .eq("card_id", cardId)
    .maybeSingle();
  const prev = existing ?? { srs_level: 0, interval_days: 1, ease_factor: 2.5 };
  const next = srsCalc(prev, quality);

  await supa.from("user_card_progress").upsert(
    {
      user_id: user.id,
      card_id: cardId,
      srs_level: next.srs_level,
      interval_days: next.interval_days,
      ease_factor: next.ease_factor,
      last_reviewed: _todayStr(),
      next_review: next.next_review,
    },
    { onConflict: "user_id,card_id" },
  );
}

function _chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size)
    chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function srsFetchProgress(cardIds) {
  const user = await _getUser();
  if (!user || !cardIds.length) return new Map();

  const chunks = _chunkArray(cardIds, 100);
  const allRows = [];
  for (const chunk of chunks) {
    const { data } = await supa
      .from("user_card_progress")
      .select(
        "card_id, srs_level, interval_days, ease_factor, next_review, last_reviewed",
      )
      .eq("user_id", user.id)
      .in("card_id", chunk);
    if (data) allRows.push(...data);
  }

  const map = new Map();
  allRows.forEach((r) => map.set(r.card_id, r));
  return map;
}

/* ══════════════════════════════════════════════════════════════
   START FC DUE — Review semua kartu due lintas semua deck
══════════════════════════════════════════════════════════════ */
export async function startFCDue() {
  resetFCState();

  currentFCKey = "due";
  currentFCSetId = null;

  const titleEl = document.getElementById("fc-title");
  const subEl = document.getElementById("fc-sub");
  if (titleEl) titleEl.textContent = "Review Due";
  if (subEl) subEl.textContent = "Memuat kartu...";

  const cardWrap = document.getElementById("fc-card-wrap");
  const doneWrap = document.getElementById("fc-done-wrap");
  const hzEl = document.getElementById("fc-hanzi");
  if (cardWrap) cardWrap.style.display = "none";
  if (doneWrap) doneWrap.style.display = "none";
  if (hzEl) hzEl.innerHTML = '<span class="spinner"></span>';

  document.body.style.overflow = "";
  showScreen("fc-screen");
  if (typeof window._fcAttachDocListeners === "function")
    window._fcAttachDocListeners();

  const cardEl = document.getElementById("fc-card");
  if (cardEl) {
    cardEl.style.transition = "none";
    cardEl.classList.remove("flipped-once", "flipped-twice");
    void cardEl.offsetWidth;
    cardEl.style.transition = "";
  }

  const wrap = document.querySelector(".fc-wrap");
  let loadEl = document.getElementById("fc-loading");
  if (!loadEl && wrap) {
    loadEl = document.createElement("div");
    loadEl.id = "fc-loading";
    loadEl.style.cssText =
      "text-align:center;padding:60px 0;color:var(--dim);font-size:13px;";
    loadEl.innerHTML = '<span class="spinner"></span>Memuat kartu...';
    wrap.insertBefore(loadEl, wrap.firstChild);
  }
  if (loadEl) loadEl.style.display = "";

  const today = _todayStr();
  const user = await _getUser();

  if (!user) {
    if (loadEl) loadEl.style.display = "none";
    if (subEl) subEl.textContent = "Login dulu untuk review due";
    return;
  }

  const { data: allProgress } = await supa
    .from("user_card_progress")
    .select("card_id, next_review, last_reviewed")
    .eq("user_id", user.id);
  const progressMap = new Map(
    (allProgress ?? []).map((p) => [
      p.card_id,
      { next_review: p.next_review, last_reviewed: p.last_reviewed },
    ]),
  );

  const dueCardIds = Array.from(progressMap.keys()).filter(
    (id) => (progressMap.get(id)?.next_review ?? "") <= today,
  );

  let allCards = [],
    cardErr = null;
  const chunks = _chunkArray(dueCardIds, 100);
  for (const chunk of chunks) {
    const { data, error } = await supa
      .from("flashcard_cards")
      .select("id, hanzi, pinyin, arti, set_id")
      .in("id", chunk);
    if (error) {
      cardErr = error;
      break;
    }
    if (data) allCards.push(...data);
  }

  if (loadEl) loadEl.style.display = "none";

  if (cardErr || !allCards || allCards.length === 0) {
    if (subEl) subEl.textContent = "Tidak ada kartu due hari ini 🎉";
    if (cardWrap) cardWrap.style.display = "";
    if (hzEl) hzEl.textContent = "🎉";
    return;
  }

  const dueCards = allCards.filter((c) => {
    const p = progressMap.get(c.id);
    if (!p) return true;
    return p.next_review <= today;
  });

  if (dueCards.length === 0) {
    if (subEl) subEl.textContent = "Tidak ada kartu due hari ini 🎉";
    if (cardWrap) cardWrap.style.display = "";
    if (hzEl) hzEl.textContent = "🎉";
    return;
  }

  const dueIds = dueCards.map((c) => c.id);
  const srsMap = await srsFetchProgress(dueIds);

  const mapped = dueCards.map((c) => ({
    hz: c.hanzi,
    py: c.pinyin,
    id: c.arti,
    _id: c.id,
    _srs: srsMap.get(c.id) ?? null,
  }));
  mapped.sort((a, b) => {
    const da = a._srs?.next_review ?? _todayStr();
    const db = b._srs?.next_review ?? _todayStr();
    return da < db ? -1 : da > db ? 1 : 0;
  });

  fcCards = mapped;
  fcIdx = 0;
  fcFlipState = 0;
  _fcUniqueTotal = fcCards.length;
  _fcBaseLength = fcCards.length; // simpan panjang awal
  _fcCardMeta = new Map(mapped.map((card) => [card._id, card]));

  if (subEl) subEl.textContent = `${fcCards.length} kartu due hari ini`;

  if (doneWrap) doneWrap.style.display = "none";
  if (cardWrap) cardWrap.style.display = "none";
  renderFCCard();
  if (cardWrap) cardWrap.style.display = "";
}

/* ══════════════════════════════════════════════════════════════
   START FLASHCARD
══════════════════════════════════════════════════════════════ */
export async function startFC(key, setId, _meta) {
  resetFCState();

  _fcShowHeader(true);
  currentFCKey = key;
  currentFCSetId = setId ?? (parseInt(key.replace(/^fc/, ""), 10) || null);
  const sourceType = _meta?.sourceType || (String(key).startsWith("pd") ? "personal" : "hsk");
  currentFCReturnLayer =
    _meta?.returnLayer || (sourceType === "personal" ? "layer-personal-cards" : "layer-kos-deck");

  const titleEl = document.getElementById("fc-title");
  const subEl = document.getElementById("fc-sub");
  if (titleEl)
    titleEl.textContent = _meta?.title
      ? _meta.title.replace("Flashcard", "Daftar Kata")
      : "Flashcard";
  if (subEl) subEl.textContent = _meta?.description ?? "Memuat kosakata...";

  const cardWrap = document.getElementById("fc-card-wrap");
  const doneWrap = document.getElementById("fc-done-wrap");
  const hzEl = document.getElementById("fc-hanzi");
  if (cardWrap) cardWrap.style.display = "none";
  if (doneWrap) doneWrap.style.display = "none";
  if (hzEl) hzEl.innerHTML = '<span class="spinner"></span>';

  document.body.style.overflow = "";
  showScreen("fc-screen");

  if (typeof window._fcAttachDocListeners === "function")
    window._fcAttachDocListeners();

  const cardEl = document.getElementById("fc-card");
  if (cardEl) {
    cardEl.style.transition = "none";
    cardEl.classList.remove("flipped-once", "flipped-twice");
    void cardEl.offsetWidth;
    cardEl.style.transition = "";
  }

  const wrap = document.querySelector(".fc-wrap");
  let loadEl = document.getElementById("fc-loading");
  if (!loadEl && wrap) {
    loadEl = document.createElement("div");
    loadEl.id = "fc-loading";
    loadEl.style.cssText =
      "text-align:center;padding:60px 0;color:var(--dim);font-size:13px;";
    loadEl.innerHTML = '<span class="spinner"></span>Memuat kartu...';
    wrap.insertBefore(loadEl, wrap.firstChild);
  }
  if (loadEl) loadEl.style.display = "";

  let data = _meta?.cards || null;
  let error = null;
  if (!data) {
    const table = sourceType === "personal" ? "personal_cards" : "flashcard_cards";
    const column = sourceType === "personal" ? "deck_id" : "set_id";
    const res = await supa
      .from(table)
      .select("*")
      .eq(column, currentFCSetId)
      .order("created_at", { ascending: true });
    data = res.data;
    error = res.error;
  }

  if (loadEl) loadEl.style.display = "none";

  if (error || !data || data.length === 0) {
    if (subEl)
      subEl.textContent = error
        ? "Gagal memuat — cek koneksi"
        : "Belum ada kartu";
    if (cardWrap) cardWrap.style.display = "";
    if (hzEl) hzEl.textContent = error ? "⚠️" : "📭";
    return;
  }

  const cardIds = data.map((c) => c.id);
  const srsMap = sourceType === "personal" ? new Map() : await srsFetchProgress(cardIds);
  const today = _todayStr();

  const allCards = data.map((c) => ({
    hz: c.hanzi,
    py: c.pinyin,
    id: c.arti,
    _id: c.id,
    _srs: srsMap.get(c.id) ?? null,
  }));
  const dueCards = allCards.filter(
    (c) => !c._srs || c._srs.next_review <= today,
  );
  const _source = dueCards.length > 0 ? dueCards : allCards;
  _source.sort((a, b) => {
    const da = a._srs?.next_review ?? _todayStr();
    const db = b._srs?.next_review ?? _todayStr();
    return da < db ? -1 : da > db ? 1 : 0;
  });

  fcCards = _source;
  fcIdx = 0;
  fcFlipState = 0;
  _fcUniqueTotal = fcCards.length;
  _fcBaseLength = fcCards.length; // simpan panjang awal
  _fcCardMeta = new Map(_source.map((card) => [card._id, card]));

  if (subEl) {
    const dueCount = dueCards.length;
    const totalCount = allCards.length;
    subEl.textContent =
      dueCount > 0
        ? `${dueCount} kartu due · total ${totalCount} kartu`
        : `${totalCount} kartu · semua sudah review`;
  }

  if (doneWrap) doneWrap.style.display = "none";
  if (cardWrap) cardWrap.style.display = "none";
  renderFCCard();
  if (cardWrap) cardWrap.style.display = "";
}

/* ══════════════════════════════════════════════════════════════
   RENDER KARTU (DENGAN GUARD)
══════════════════════════════════════════════════════════════ */

export function renderFCCard() {
  if (typeof window._spkReset === "function") window._spkReset();

  const spkToolbar = document.getElementById("spk-toolbar");
  if (spkToolbar) spkToolbar.style.display = "";

  if (!fcCards.length || fcIdx >= fcCards.length) {
    showFCDone();
    return;
  }

  // Jaga index tetap valid
  fcIdx = Math.min(fcIdx, fcCards.length - 1);

  const card = fcCards[fcIdx];
  fcFlipState = 0;

  const el = document.getElementById("fc-card");
  if (el) {
    el.style.transition = "none";
    el.classList.remove("flipped-once", "flipped-twice");
    const back1 = el.querySelector(".fc-back1");
    const back2 = el.querySelector(".fc-back2");
    if (back1) back1.style.display = "none";
    if (back2) back2.style.display = "none";
  }

  const hzEl = document.getElementById("fc-hanzi");
  const hzEl2 = document.getElementById("fc-hanzi2");
  const hzEl3 = document.getElementById("fc-hanzi3");
  const pyEl = document.getElementById("fc-pinyin");
  const pyEl2 = document.getElementById("fc-pinyin2");
  const artiEl = document.getElementById("fc-arti");

  if (hzEl) hzEl.innerHTML = _solidifyHanzi(card.hz);
  if (hzEl2) hzEl2.innerHTML = _solidifyHanzi(card.hz);
  if (hzEl3) hzEl3.innerHTML = _solidifyHanzi(card.hz);
  if (pyEl) pyEl.innerHTML = colorPy(card.py);
  if (pyEl2) pyEl2.innerHTML = colorPy(card.py);
  if (artiEl) artiEl.textContent = card.id;

  const ovR = document.getElementById("fc-ov-right");
  const ovL = document.getElementById("fc-ov-left");
  if (ovR) ovR.style.opacity = "0";
  if (ovL) ovL.style.opacity = "0";

  if (el) {
    void el.offsetWidth;
    el.style.transition = "";
    el.style.animation = "fcSwipeIn .3s ease";
    el.addEventListener(
      "animationend",
      () => {
        if (el) el.style.animation = "";
      },
      { once: true },
    );
  }

  const doneWrap = document.getElementById("fc-done-wrap");
  if (doneWrap && doneWrap.style.display === "block") {
    // Jika done wrap sedang tampil, jangan reset styles-nya di sini
    return;
  }
  if (doneWrap) {
    doneWrap.style.minHeight = "";
    doneWrap.style.display = "none";
  }

  const uniqueTotal = _fcUniqueTotal;
  const progEl = document.getElementById("fc-prog");
  if (progEl)
    progEl.style.width =
      uniqueTotal > 0 ? (_fcHafal / uniqueTotal) * 100 + "%" : "0%";

  const numEl = document.getElementById("fc-count-num");
  const denomEl = document.getElementById("fc-count-denom");
  if (numEl) numEl.textContent = fcIdx + 1;
  if (denomEl) denomEl.textContent = fcCards.length;
}

/* ══════════════════════════════════════════════════════════════
   FLIP
══════════════════════════════════════════════════════════════ */
export function flipFC() {
  const el = document.getElementById("fc-card");
  if (!el) return;
  const b1 = el.querySelector(".fc-back1");
  const b2 = el.querySelector(".fc-back2");

  if (fcFlipState === 0) {
    if (b1) b1.style.display = "";
    if (b2) b2.style.display = "none";
    el.classList.add("flipped-once");
    fcFlipState = 1;

    const card = fcCards[fcIdx];
    if (card?.hz) {
      cancelTTS();
      const utt = new SpeechSynthesisUtterance(card.hz);
      utt.lang = "zh-CN";
      utt.rate = 0.85;
      speechSynthesis.speak(utt);
    }
  } else if (fcFlipState === 1) {
    fcFlipState = -1;
    if (b1) b1.style.display = "none";
    if (b2) b2.style.display = "";
    el.classList.remove("flipped-once");
    el.classList.add("flipped-twice");

    const unlock = () => {
      if (fcFlipState === -1) fcFlipState = 2;
    };
    const t = setTimeout(unlock, 600);
    el.addEventListener(
      "transitionend",
      () => {
        clearTimeout(t);
        unlock();
      },
      { once: true },
    );

    const hint = document.getElementById("fc-swipe-hint");
    if (hint) hint.textContent = "« Lupa · Ketuk kartu · Hafal »";
  } else if (fcFlipState === -1) {
    return;
  } else if (fcFlipState === 2) {
    const card = fcCards[fcIdx];
    if (card?.hz) {
      cancelTTS();
      const utt = new SpeechSynthesisUtterance(card.hz);
      utt.lang = "zh-CN";
      utt.rate = 0.85;
      speechSynthesis.speak(utt);
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   NAVIGASI — HAFAL & LUPA
══════════════════════════════════════════════════════════════ */
export function fcNavHafal() {
  if (!fcCards.length || fcIdx >= fcCards.length) return;
  const card = fcCards[fcIdx];
  if (!card) return;

  if (!card._isRepeat && !_fcLupaIds.has(card._id)) {
    _fcHafal++;
  } else if (card._isRepeat) {
    _fcHafal++;
    _fcLupa--;
    _fcLupaIds.delete(card._id);
  }

  fcIdx++;
  if (fcIdx >= fcCards.length) {
    if (_fcRepeatQueue.length > 0) {
      fcCards = [..._fcRepeatQueue];
      _fcRepeatQueue = [];
      fcIdx = 0;
      renderFCCard();
      return;
    } else {
      showFCDone();
      return;
    }
  }
  renderFCCard();
}

export function fcNavLupa() {
  if (!fcCards.length || fcIdx >= fcCards.length) return;
  const card = fcCards[fcIdx];
  if (!card) return;

  if (!card._isRepeat && !_fcLupaIds.has(card._id)) {
    _fcLupaIds.add(card._id);
    _fcLupa++;
    _fcRepeatQueue.push({ ...card, _isRepeat: true });
  }

  fcIdx++;
  if (fcIdx >= fcCards.length) {
    if (_fcRepeatQueue.length > 0) {
      fcCards = [..._fcRepeatQueue];
      _fcRepeatQueue = [];
      fcIdx = 0;
      renderFCCard();
      return;
    } else {
      showFCDone();
      return;
    }
  }
  renderFCCard();
}

/* ══════════════════════════════════════════════════════════════
   FLUSH PENDING REVIEWS
══════════════════════════════════════════════════════════════ */
async function _doFlushPendingReviews() {
  if (_fcPendingReviews.size === 0) return;

  // Jika ini dari personal deck, kita sama sekali tidak menyimpan progres/SRS ke database.
  // Hapus semua antrean dan langsung keluar.
  if (String(currentFCKey).startsWith("pd")) {
    _fcPendingReviews.clear();
    return;
  }

  const entries = Array.from(_fcPendingReviews.entries());

  // Gunakan _fcPrevSessionXP yang sudah dihitung saat showFCDone
  await _grantSessionXP(_fcPrevSessionXP);

  const results = await Promise.allSettled(
    entries.map(([cardId, quality]) => srsSaveReview(cardId, quality)),
  );

  results.forEach((result, idx) => {
    const [cardId, quality] = entries[idx];
    if (result.status === "fulfilled") {
      if (_fcPendingReviews.get(cardId) === quality) {
        _fcPendingReviews.delete(cardId);
      }
    } else {
      console.error("srsSaveReview failed:", result.reason);
    }
  });
}

async function _flushPendingReviews() {
  if (_fcPendingReviews.size === 0) return;
  if (!_fcFlushPromise) {
    _fcFlushPromise = _doFlushPendingReviews().finally(() => {
      _fcFlushPromise = null;
    });
  }
  await _fcFlushPromise;
}

async function _grantSessionXP(xpNow) {
  if (xpNow <= 0) return;
  if (!currentFCSetId) return;

  const user = await _getUser();
  if (!user) return;

  const fcKey = `fc${currentFCSetId}`;
  const prevScore =
    typeof window.fcScores !== "undefined" ? (window.fcScores[fcKey] ?? 0) : 0;

  const finalScore = Math.max(prevScore, xpNow);

  try {
    await supa.from("user_scores").upsert(
      {
        user_id: user.id,
        type: "fc_session",
        key: fcKey,
        score: finalScore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,type,key" },
    );
    if (typeof window.fcScores !== "undefined")
      window.fcScores[fcKey] = finalScore;
  } catch (e) {
    console.error("upsert user_scores failed:", e);
  }

  if (typeof window.invalidateStatsCache === "function")
    window.invalidateStatsCache();
  if (typeof window._renderLevel === "function") window._renderLevel();
  if (typeof window.updateDailyProgress === "function")
    window.updateDailyProgress();
}

/* ══════════════════════════════════════════════════════════════
   DONE SCREEN
══════════════════════════════════════════════════════════════ */
export async function showFCDone() {
  if (_fcDoneShown) return;
  _fcDoneShown = true;

  const doneWrap = document.getElementById("fc-done-wrap");
  const cardWrap = document.getElementById("fc-card-wrap");
  const spkToolbar = document.getElementById("spk-toolbar");

  const screen = document.getElementById("fc-screen");
  const hdH = document.querySelector("#fc-screen .fc-hd")?.offsetHeight ?? 72;
  const progH =
    document.querySelector("#fc-screen .fc-prog")?.offsetHeight ?? 4;

  if (doneWrap) {
    doneWrap.style.minHeight =
      (screen?.clientHeight ?? window.innerHeight) - hdH - progH + "px";
    doneWrap.style.display = "block";
    doneWrap.style.flexDirection = "column";
    doneWrap.style.alignItems = "center";
    doneWrap.style.justifyContent = "center";
  }

  _fcShowHeader(false);
  if (cardWrap) cardWrap.style.display = "none";
  if (spkToolbar) spkToolbar.style.display = "none";

  const progEl = document.getElementById("fc-prog");
  if (progEl) progEl.style.width = "100%";

  const hint = document.getElementById("fc-swipe-hint");
  if (hint) hint.style.display = "none";

  // 1. HITUNG XP SECARA SINKRON (Agar _fcPrevSessionXP terisi untuk _renderDoneStats)
  const isPersonal = String(currentFCKey).startsWith("pd");
  const entries = Array.from(_fcPendingReviews.entries());
  const xpEntries = [];
  for (const [cardId, quality] of entries) {
    if (quality === 5) {
      const card = _fcCardMeta.get(cardId);
      xpEntries.push({ isMature: card?._srs?.interval_days >= 21 });
    }
  }
  _fcPrevSessionXP = isPersonal ? 0 : Math.min(calcXPFCSession(xpEntries), XP.SESSION_CAP);

  // 2. TAMPILKAN TOAST XP
  if (_fcPrevSessionXP > 0) {
    const total = _fcUniqueTotal || 1;
    const hafal = Math.min(_fcHafal, total);
    const pct = Math.round((hafal / total) * 100);
    showXPToast(_fcPrevSessionXP, `Sesi selesai ${pct}% hafal`);
  }

  // 3. RENDER DONE STATS SEGERA (No Lag)
  _renderDoneStats();

  // 4. JALANKAN PROSES BERAT DI BACKGROUND (Jangan di-await)
  (async () => {
    try {
      await _flushPendingReviews();
      if (typeof window._recordDailyStreak === "function")
        await window._recordDailyStreak();
      if (typeof window._renderLevel === "function") window._renderLevel();
      if (typeof window.updateSrsDashboard === "function")
        window.updateSrsDashboard().catch(console.error);
      if (typeof window.refreshKosDashboardProgress === "function")
        window.refreshKosDashboardProgress().catch(console.error);
      _fcScoresFresh = true;
      if (typeof window.invalidateStatsCache === "function")
        window.invalidateStatsCache();
    } catch (e) {
      console.error("Background sync failed:", e);
    }
  })();
}

function _renderDoneStats() {
  const hafal = _fcHafal;
  const lupa = _fcLupa;
  const total = _fcUniqueTotal || hafal + lupa;
  const xpNow = _fcPrevSessionXP;

  showDoneScreen("fc-done-wrap", {
    correct: hafal,
    wrong: lupa,
    total: total,
    xp: xpNow,
    btnMainLabel: "🔀 Ulangi Pelajaran",
    btnMainFn: "window.restartFC",
    btnSecLabel: "Kembali",
    btnSecFn: "window.closeFC",
  });
}

/* ══════════════════════════════════════════════════════════════
   RESTART & CLOSE (DENGAN RESET STATE LENGKAP)
══════════════════════════════════════════════════════════════ */
export function restartFC() {
  cancelTTS();
  _fcShowHeader(true);

  // Reset state yang berkaitan dengan sesi
  _fcDoneShown = false;
  _fcLupaIds.clear();
  _fcRepeatQueue = [];

  // Mulai ulang berdasarkan konteks
  if (currentFCKey === "due") {
    startFCDue();
  } else if (currentFCSetId) {
    startFC(currentFCKey, currentFCSetId);
  }
}

export function closeFC() {
  cancelTTS();
  const returnSetId = currentFCSetId;
  const returnLayer = currentFCReturnLayer;

  // Lepas semua event listener global
  if (typeof window._fcDetachDocListeners === "function")
    window._fcDetachDocListeners();

  // Reset semua state internal untuk sesi mendatang
  resetFCState();

  // Hapus flag done screen supaya bisa dijalankan lagi nanti
  _fcDoneShown = false;

  if (typeof window.invalidateKosLockCache === "function")
    window.invalidateKosLockCache();
  if (typeof window.loadSRSStats === "function")
    window.loadSRSStats().catch(console.error);

  if (currentFCKey === "due") {
    if (typeof window.updateSrsDashboard === "function")
      window.updateSrsDashboard().catch(console.error);
    if (typeof window.refreshKosDashboardProgress === "function")
      window.refreshKosDashboardProgress().catch(console.error);
    if (!_fcScoresFresh && typeof window.loadScores === "function")
      window.loadScores().catch(console.error);
    _fcScoresFresh = false;
    backToDash();
  } else if (returnSetId) {
    if (typeof window.refreshKosDashboardProgress === "function")
      window.refreshKosDashboardProgress().catch(console.error);

    if (window.history.state?.hskApp) {
      history.back();
      return;
    }

    backToLayer(returnLayer);
    if (returnLayer === "layer-personal-cards" && typeof window.renderCards === "function") {
      window.renderCards(returnSetId).catch?.(console.error);
    } else if (typeof window.restoreKosDeckLayer === "function") {
      window.restoreKosDeckLayer().catch(console.error);
    } else if (typeof window.loadKosDeckData === "function") {
      window.loadKosDeckData(returnSetId).catch(console.error);
    }
  } else {
    if (typeof window.refreshKosDashboardProgress === "function")
      window.refreshKosDashboardProgress().catch(console.error);

    if (window.history.state?.hskApp) {
      history.back();
      return;
    }

    backToLayer("layer-kos");
    if (typeof window.renderKosDeckGrid === "function") {
      window.renderKosDeckGrid().catch(console.error);
    }
  }
}

export function isFCDone(dayIdx) {
  const fcDone = lsGet("hsk_fc") || {};
  return !!fcDone[window.FC_KEYS?.[dayIdx]];
}

/* ══════════════════════════════════════════════════════════════
   FC GRID — daftar flashcard set dengan due-count
══════════════════════════════════════════════════════════════ */

export async function renderFCGrid() {
  if (typeof window.renderKosDeckGrid === "function") {
    return window.renderKosDeckGrid();
  }

  const grid = document.getElementById("fc-grid");
  if (!grid) return;

  grid.innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--dim);font-size:13px;"><span class="spinner"></span>Memuat...</div>';

  const currentUser = getCurrentUser();
  const userId = currentUser?.id;
  let sets = [];

  const { data: defaultSets, error: e1 } = await supa
    .from("flashcard_sets")
    .select("id, title, description, hsk_level, badge")
    .eq("is_default", true)
    .order("id", { ascending: true });
  if (e1 || !defaultSets) {
    grid.innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--dim);">Gagal memuat data</div>';
    return;
  }
  sets = [...defaultSets];

  if (userId) {
    const { data: ownSets, error: e2 } = await supa
      .from("flashcard_sets")
      .select("id, title, description, hsk_level, badge")
      .eq("created_by", userId)
      .order("id", { ascending: true });
    if (!e2 && ownSets) {
      const existingIds = new Set(sets.map((s) => s.id));
      ownSets.forEach((s) => {
        if (!existingIds.has(s.id)) sets.push(s);
      });
    }
  }

  sets.sort((a, b) => a.id - b.id);

  if (!sets.length) {
    grid.innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--dim);">Belum ada data</div>';
    return;
  }

  const today = _todayStr();
  const user = await _getUser();
  const dueMap = new Map();

  if (user) {
    const [{ data: allProgress }, { data: allCards }] = await Promise.all([
      supa
        .from("user_card_progress")
        .select("card_id, next_review")
        .eq("user_id", user.id),
      supa.from("flashcard_cards").select("id, set_id"),
    ]);

    if (allProgress && allCards) {
      const cardToSet = new Map(allCards.map((c) => [c.id, c.set_id]));
      const reviewedIds = new Set(allProgress.map((p) => p.card_id));

      allCards.forEach((c) => {
        if (!reviewedIds.has(c.id))
          dueMap.set(c.set_id, (dueMap.get(c.set_id) ?? 0) + 1);
      });
      allProgress.forEach((p) => {
        if (p.next_review <= today) {
          const sid = cardToSet.get(p.card_id);
          if (sid) dueMap.set(sid, (dueMap.get(sid) ?? 0) + 1);
        }
      });
    }
  }

  grid.innerHTML = sets
    .map((s) => {
      const key = `fc${s.id}`;
      const desc = s.description || "20 kata baru";
      const badge = s.badge || `HSK ${s.hsk_level ?? 1}`;
      const dueCount = dueMap.get(s.id);
      const dueTag =
        dueCount != null
          ? `<span style="display:inline-flex;align-items:center;gap:4px;background:rgba(232,201,109,0.12);border:1px solid rgba(232,201,109,0.25);border-radius:20px;padding:2px 8px;font-size:10px;color:var(--gold);font-weight:600;">⏰ ${dueCount} due</span>`
          : `<span class="item-date">20 kartu</span>`;
      const metaJson = JSON.stringify({
        title: s.title,
        description: s.description || desc,
      }).replace(/'/g, "&#39;");
      return `<div class="item-card" onclick="window.startFC('${key}', ${s.id}, JSON.parse(this.dataset.meta))" data-meta='${metaJson}'>
      <div class="item-card-top"><span class="day-badge">${badge}</span></div>
      <div class="item-title">${s.title.replace("Flashcard", "Daftar Kata")}</div>
      <div class="item-desc">${desc}</div>
      <div class="item-meta">
        ${dueTag}
        <button class="btn-open" onclick="event.stopPropagation();window.startFC('${key}',${s.id},JSON.parse(this.closest('[data-meta]').dataset.meta))">Mulai</button>
      </div>
    </div>`;
    })
    .join("");
}

export function openKosvok() {
  if (typeof window.openLayer === "function") window.openLayer("layer-kos");
  if (typeof window.renderKosDeckGrid === "function") {
    window.renderKosDeckGrid().catch(console.error);
    return;
  }
  renderFCGrid();
}

/* ══════════════════════════════════════════════════════════════
   SWIPE ENGINE — Touch + Mouse + Keyboard
══════════════════════════════════════════════════════════════ */

(function () {
  let sx = 0,
    sy = 0,
    sTime = 0,
    dragging = false;
  const MIN_SWIPE = 60;
  const MAX_TAP_MOV = 10;
  const MAX_TAP_MS = 300;
  let _lastTouchEnd = 0;
  let _animating = false;

  const isFC = () =>
    !!document.getElementById("fc-screen")?.classList.contains("active");
  const getCard = () => document.getElementById("fc-card");
  const getOvR = () => document.getElementById("fc-ov-right");
  const getOvL = () => document.getElementById("fc-ov-left");
  const getWrap = () => document.getElementById("fc-card-wrap");

  function resetCardPos() {
    const el = getCard();
    if (!el) return;
    el.classList.remove("is-dragging");
    el.style.transform = "";
    el.style.opacity = "";
    const r = getOvR();
    if (r) r.style.opacity = "0";
    const l = getOvL();
    if (l) l.style.opacity = "0";
  }

  function dismissCard(dir) {
    if (_animating) return;
    _animating = true;

    const el = getCard();
    if (!el) {
      _animating = false;
      return;
    }

    const quality = dir > 0 ? 5 : 0;
    const card = fcCards[fcIdx];

    if (card) {
      _fcPendingReviews.set(card._id, quality);
    }

    el.style.setProperty("--fc-tx", dir > 0 ? "130%" : "-130%");
    el.style.setProperty("--fc-rot", dir > 0 ? "18deg" : "-18deg");
    el.style.animation = "fcSwipeOut .32s cubic-bezier(.4,0,.6,1) forwards";

    el.addEventListener(
      "animationend",
      () => {
        el.style.animation = "";
        resetCardPos();
        _animating = false;
        if (dir > 0) fcNavHafal();
        else fcNavLupa();
      },
      { once: true },
    );
  }

  function applyDrag(dx) {
    const el = getCard();
    if (!el) return;
    el.style.transform = `translateX(${dx}px) rotate(${dx * 0.07}deg)`;
    const ratio = Math.min(Math.abs(dx) / 90, 1);
    const r = getOvR();
    if (r) r.style.opacity = dx > 0 ? ratio : "0";
    const l = getOvL();
    if (l) l.style.opacity = dx < 0 ? ratio : "0";
  }

  function handleStart(clientX, clientY) {
    if (!isFC() || _animating) return;
    sx = clientX;
    sy = clientY;
    sTime = Date.now();
    dragging = true;
    const el = getCard();
    if (el) el.classList.add("is-dragging");
  }

  function handleMove(clientX, clientY) {
    if (!dragging || !isFC()) return;
    const dx = clientX - sx,
      dy = clientY - sy;
    if (Math.abs(dx) > Math.abs(dy)) applyDrag(dx);
  }

  function handleEnd(clientX, clientY) {
    if (!dragging || !isFC()) return;
    dragging = false;
    const dx = clientX - sx,
      dy = clientY - sy;
    const dist = Math.hypot(dx, dy);
    const dt = Date.now() - sTime;

    if (dist < MAX_TAP_MOV && dt < MAX_TAP_MS) {
      resetCardPos();
      flipFC();
      return;
    }

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) >= MIN_SWIPE) {
      dismissCard(dx > 0 ? 1 : -1);
    } else {
      const el = getCard();
      if (el) {
        el.classList.remove("is-dragging");
        el.style.transition = "transform .25s ease, opacity .25s ease";
        resetCardPos();
        setTimeout(() => {
          if (el) el.style.transition = "";
        }, 260);
      }
    }
  }

  function attachListeners() {
    const wrap = getWrap();
    if (!wrap) return;

    // Gunakan fungsi named agar bisa dihapus
    const _fcTouchStart = (e) => handleStart(e.touches[0].clientX, e.touches[0].clientY);
    const _fcTouchMove = (e) => {
      if (!dragging || !isFC()) return;
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (Math.abs(dx) > Math.abs(dy) + 5) e.preventDefault();
      handleMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const _fcTouchEnd = (e) => {
      _lastTouchEnd = Date.now();
      handleEnd(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    };
    const _fcTouchCancel = () => {
      dragging = false;
      resetCardPos();
    };

    wrap.removeEventListener("touchstart", _fcTouchStart);
    wrap.removeEventListener("touchmove", _fcTouchMove);
    wrap.removeEventListener("touchend", _fcTouchEnd);
    wrap.removeEventListener("touchcancel", _fcTouchCancel);

    wrap.addEventListener("touchstart", _fcTouchStart, { passive: true });
    wrap.addEventListener("touchmove", _fcTouchMove, { passive: false });
    wrap.addEventListener("touchend", _fcTouchEnd, { passive: true });
    wrap.addEventListener("touchcancel", _fcTouchCancel, { passive: true });
  }

  function _fcMouseDown(e) {
    if (!isFC() || e.button !== 0 || _animating) return;
    if (Date.now() - _lastTouchEnd < 500) return;
    const wrap = getWrap();
    if (!wrap?.contains(e.target)) return;
    handleStart(e.clientX, e.clientY);
  }

  function _fcMouseMove(e) {
    if (dragging && isFC()) handleMove(e.clientX, e.clientY);
  }

  function _fcMouseUp(e) {
    if (!dragging || !isFC() || e.button !== 0) return;
    if (Date.now() - _lastTouchEnd < 500) return;
    handleEnd(e.clientX, e.clientY);
  }

  function _fcKeyDown(e) {
    if (!isFC()) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      dismissCard(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      dismissCard(-1);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      flipFC();
    }
  }

  document.addEventListener("mousedown", _fcMouseDown);
  document.addEventListener("mousemove", _fcMouseMove);
  document.addEventListener("mouseup", _fcMouseUp);
  document.addEventListener("keydown", _fcKeyDown);

  window._fcDetachDocListeners = function () {
    document.removeEventListener("mousedown", _fcMouseDown);
    document.removeEventListener("mousemove", _fcMouseMove);
    document.removeEventListener("mouseup", _fcMouseUp);
    document.removeEventListener("keydown", _fcKeyDown);
  };

  window._fcAttachDocListeners = function () {
    document.removeEventListener("mousedown", _fcMouseDown);
    document.removeEventListener("mousemove", _fcMouseMove);
    document.removeEventListener("mouseup", _fcMouseUp);
    document.removeEventListener("keydown", _fcKeyDown);
    document.addEventListener("mousedown", _fcMouseDown);
    document.addEventListener("mousemove", _fcMouseMove);
    document.addEventListener("mouseup", _fcMouseUp);
    document.addEventListener("keydown", _fcKeyDown);
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", attachListeners);
  else attachListeners();
})();

/* ── Expose ke window untuk dipanggil dari HTML ── */
window.startFCDue = startFCDue;
window.startFC = startFC;
window.renderFCCard = renderFCCard;
window.flipFC = flipFC;
window.fcNavHafal = fcNavHafal;
window.fcNavLupa = fcNavLupa;
window.showFCDone = showFCDone;
window.restartFC = restartFC;
window.closeFC = closeFC;
window.resetFCState = resetFCState;
window.isFCDone = isFCDone;
window.renderFCGrid = renderFCGrid;
window.openKosvok = openKosvok;

Object.defineProperty(window, "fcCards", { get: () => fcCards });
Object.defineProperty(window, "fcIdx", { get: () => fcIdx });
