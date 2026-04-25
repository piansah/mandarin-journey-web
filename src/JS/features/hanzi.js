/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   HANZI.JS — Baca Kalimat Hanzi Engine
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showScreen, backToLayer, backToDash } from "../core/navigation.js";
import { showToast, lsGet, lsSet, showXPToast } from "../utilities/helpers.js";
import { speakMandarin, cancelTTS } from "../utilities/tts.js";
import { colorPy, _stripTones } from "../utilities/pinyin.js";
import { showDoneScreen } from "../core/done-screen.js";
import { XP } from "../utilities/xp.js";
import {
  resolveCumulativeLock,
  lockMessage,
  loadUnlockedTiers,
  loadTierStartDecks,
} from "../utilities/tier-unlock.js";

let _hanziSaved = false;
let currentHanziData = null;
let currentHanziKey = null;
let hState = [];

const hanziDoneSessions = new Set();
const _hanziCache = {};

let _hanziTapCount = 0;
let _hanziReadDone = new Set();

/* ── LocalStorage helpers untuk read progress ── */
function _getHanziReadProgress(key) {
  const data = lsGet("hanzi_read_progress", {});
  return new Set(data[key] || []);
}

function _setHanziReadProgress(key, indexSet) {
  const data = lsGet("hanzi_read_progress", {});
  data[key] = [...indexSet];
  lsSet("hanzi_read_progress", data);
}

function _clearHanziReadProgress(key) {
  const data = lsGet("hanzi_read_progress", {});
  delete data[key];
  lsSet("hanzi_read_progress", data);
}

function _hanziUpdateTapCounter() {
  const total = currentHanziData
    ? currentHanziData.sections.reduce((acc, sec) => acc + sec.items.length, 0)
    : 0;
  const count = _hanziReadDone.size;

  const doneEl = document.getElementById("h-done");
  const leftEl = document.getElementById("h-left");
  if (doneEl) doneEl.textContent = count;
  if (leftEl) leftEl.textContent = total;

  const txtEl = document.getElementById("h-prog-txt");
  if (txtEl) {
    txtEl.textContent =
      count >= total && total > 0
        ? `✓ Semua ${total} kartu selesai dibaca!`
        : `${count} dari ${total} selesai`;
    txtEl.classList.toggle("complete", count >= total && total > 0);
  }

  const fillEl = document.getElementById("h-prog");
  if (fillEl && total > 0) fillEl.style.width = (count / total) * 100 + "%";
}

/* ── Load Hanzi from Supabase ── */
export async function loadHanziFromDB(key) {
  if (_hanziCache[key]) return _hanziCache[key];

  const [metaRes, itemsRes] = await Promise.all([
    supa
      .from("hanzi_sets")
      .select("title, sub, description")
      .eq("key", key)
      .single(),
    supa
      .from("hanzi_items")
      .select("section_label, section_tag, hanzi, pinyin, arti")
      .eq("hanzi_key", key)
      .order("sort_order"),
  ]);

  if (itemsRes.error)
    throw new Error("Gagal load hanzi " + key + ": " + itemsRes.error.message);
  if (!itemsRes.data || itemsRes.data.length === 0)
    throw new Error("Tidak ada data hanzi untuk key: " + key);

  const title = metaRes.data?.title ?? key;
  const sub = metaRes.data?.sub ?? "";

  const sectionsMap = {};
  const sectionOrder = [];
  for (const row of itemsRes.data) {
    const lbl = row.section_label;
    if (!sectionsMap[lbl]) {
      sectionsMap[lbl] = { label: lbl, tag: row.section_tag, items: [] };
      sectionOrder.push(lbl);
    }
    sectionsMap[lbl].items.push({
      hz: row.hanzi,
      py: row.pinyin,
      id: row.arti,
    });
  }

  const result = {
    title,
    sub,
    sections: sectionOrder.map((lbl) => sectionsMap[lbl]),
  };
  _hanziCache[key] = result;
  return result;
}

/* ── Start Hanzi ── */
export async function startHanzi(key) {
  currentHanziKey = key;
  _hanziSaved = false;
  if (typeof window.closeLayer === "function")
    window.closeLayer("layer-hanzi", true);
  showScreen("hanzi-screen");

  const titleEl = document.getElementById("hanzi-title");
  const subEl = document.getElementById("hanzi-sub");
  if (titleEl) titleEl.textContent = "Memuat...";
  if (subEl) subEl.textContent = "";
  window.scrollTo(0, 0);

  try {
    currentHanziData = await loadHanziFromDB(key);
  } catch (err) {
    showToast("Gagal memuat hanzi. Cek koneksi kamu.", "err");
    backToDash();
    return;
  }

  if (titleEl) titleEl.textContent = currentHanziData.title;
  if (subEl) subEl.textContent = currentHanziData.sub;

  const totalItems = currentHanziData.sections.reduce(
    (acc, sec) => acc + sec.items.length,
    0,
  );
  hState = new Array(totalItems).fill(0);

  _hanziReadDone = _getHanziReadProgress(key);
  _hanziTapCount = _hanziReadDone.size;

  _hanziReadDone.forEach((i) => {
    hState[i] = 2;
  });

  _hanziUpdateTapCounter();
  renderHanzi();
}

/* ── Render Hanzi ── */
export function renderHanzi() {
  const main = document.getElementById("hanzi-main");
  if (!main) return;
  main.innerHTML = "";
  let gi = 0;

  currentHanziData.sections.forEach((sec) => {
    const sd = document.createElement("div");
    sd.innerHTML = `<div class="h-sec-label"><span>${sec.tag}</span>${sec.label}</div>`;

    const grid = document.createElement("div");
    grid.className = "h-grid";

    sec.items.forEach((item) => {
      const i = gi++;
      const card = document.createElement("div");
      card.className =
        "h-card" +
        (hState[i] === 1 ? " step1" : hState[i] === 2 ? " step2" : "");
      card.id = "hc-" + i;
      card.onclick = () => advanceH(i);

      const pyShow = hState[i] >= 1 ? " show" : "";
      const artiShow = hState[i] >= 2 ? " show" : "";
      const hintHide = hState[i] >= 1 ? ' style="display:none"' : "";

      card.innerHTML = `<span class="h-card-num">${i + 1}</span><div class="h-hz">${item.hz}</div><div class="h-py${pyShow}" id="hpy-${i}">${colorPy(item.py)}</div><div class="h-arti${artiShow}" id="har-${i}">${item.id}</div><div class="h-hint"${hintHide}>ketuk untuk buka</div>`;
      grid.appendChild(card);
    });

    sd.appendChild(grid);
    main.appendChild(sd);
  });

  _hanziUpdateTapCounter();
}

/* ── Advance Card Step ── */
export function advanceH(i) {
  const card = document.getElementById("hc-" + i);
  const hzEl = card?.querySelector(".h-hz");

  if (hState[i] >= 2) {
    if (hzEl) speakMandarin(hzEl.textContent, 0.75);
    return;
  }

  hState[i]++;
  if (hState[i] === 1 && hzEl) speakMandarin(hzEl.textContent, 0.75);

  if (card) card.className = "h-card" + (hState[i] === 1 ? " step1" : " step2");

  if (hState[i] >= 1) {
    const pyEl = document.getElementById("hpy-" + i);
    if (pyEl) pyEl.classList.add("show");
  }
  if (hState[i] >= 2) {
    const artiEl = document.getElementById("har-" + i);
    if (artiEl) artiEl.classList.add("show");

    if (!_hanziReadDone.has(i)) {
      _hanziReadDone.add(i);
      _setHanziReadProgress(currentHanziKey, _hanziReadDone);
      _hanziTapCount = _hanziReadDone.size;
      _hanziUpdateTapCounter();

      const total = currentHanziData.sections.reduce(
        (acc, sec) => acc + sec.items.length,
        0,
      );
      if (_hanziReadDone.size === total && total > 0 && !_hanziSaved) {
        _hanziSaved = true;
        _saveHanziProgress();
      }
    }
  }

  const hint = card?.querySelector(".h-hint");
  if (hint) hint.style.display = "none";
}

/* ── Reset Hanzi ── */
export function resetHanzi() {
  const totalItems = currentHanziData
    ? currentHanziData.sections.reduce((acc, sec) => acc + sec.items.length, 0)
    : 0;
  hState = new Array(totalItems).fill(0);
  _hanziReadDone = new Set();
  _hanziTapCount = 0;
  _hanziSaved = false;
  _clearHanziReadProgress(currentHanziKey);
  _hanziUpdateTapCounter();
  window.scrollTo({ top: 0, behavior: "smooth" });
  renderHanzi();
}

/* ── Close Hanzi ── */
export function closeHanzi() {
  cancelTTS();
  const bar = document.getElementById("hanzi-bottom-bar");
  if (bar) bar.remove();
  backToLayer("layer-hanzi");
}

/* ══════════════════════════════════════════════════════════════
   LATIHAN SPEAKING
══════════════════════════════════════════════════════════════ */

let _spItems = [];
let _spIdx = 0;
let _spCanProceed = false;

export function startHanziLatihan() {
  _spItems = [];
  currentHanziData.sections.forEach((sec) => {
    sec.items.forEach((item) => _spItems.push(item));
  });
  if (!_spItems.length) return;

  const pool = [..._spItems].sort(() => Math.random() - 0.5).slice(0, 15);
  _spItems = pool;
  _spIdx = 0;
  _renderSpeakingScreen();
}

function _onSpeakingPopState() {
  window.removeEventListener("popstate", _onSpeakingPopState);
  closeSpeakingScreen(true);
}

function _renderSpeakingScreen() {
  _spCanProceed = false;
  let scr = document.getElementById("hanzi-speaking-screen");
  if (!scr) {
    scr = document.createElement("div");
    scr.id = "hanzi-speaking-screen";
    scr.style.cssText =
      "position:fixed;inset:0;z-index:200;background:var(--bg);display:flex;flex-direction:column;font-family:var(--font-ui);";
    document.body.appendChild(scr);
    history.pushState({ speakingScreen: true }, "");
    window.addEventListener("popstate", _onSpeakingPopState);
  }

  const item = _spItems[_spIdx];
  const total = _spItems.length;
  const pct = (((_spIdx + 1) / total) * 100).toFixed(1);

  scr.innerHTML = `
    <div class="sp-hd">
      <div><div class="sp-hd-title">Latihan Speaking</div><div class="sp-hd-sub">${currentHanziData.sub || currentHanziData.title}</div></div>
      <div class="sp-counter"><div class="sp-counter-num">${_spIdx + 1}</div><div class="sp-counter-denom">dari ${total}</div></div>
    </div>
    <div class="sp-prog"><div class="sp-prog-fill" style="width:${pct}%"></div></div>
    <div class="sp-body">
      <div class="sp-instr">Baca kalimat ini dengan jelas</div>
      <div class="sp-card">
        <div class="sp-card-hz">${item.hz}</div>
        <div class="sp-card-py">${colorPy(item.py)}</div>
        <div class="sp-card-arti">${item.id}</div>
      </div>
      <div id="hsp-toolbar">
        <div class="hsp-btn-row">
          <button id="hsp-btn-listen" class="spk-tb-btn" onclick="window._spkListenHanzi()"><span class="spk-tb-icon" id="hsp-listen-icon">🔊</span><span id="hsp-listen-txt">Dengarkan</span></button>
          <button id="hsp-btn-mic" class="spk-tb-btn" onclick="window._spkToggleRecHanzi()"><span class="spk-tb-icon" id="hsp-mic-icon">🎙</span><span id="hsp-mic-txt">Coba Ucapkan</span></button>
        </div>
        <div id="hsp-feedback" class="spk-fb spk-fb--hidden"></div>
      </div>
    </div>
    <div class="sp-nav"><button id="hsp-next-btn" class="btn-latihan-hanzi sp-next-btn is-disabled" style="width:100%;justify-content:center;" onclick="window._spActionTap()" disabled>Selanjutnya</button></div>`;
}

export function _spActionTap() {
  if (!_spCanProceed) return;
  cancelTTS();
  if (typeof window._spkStopRec === "function") window._spkStopRec(true);
  _hspHideFb();
  _hspSetMicUI(false);

  if (_spIdx >= _spItems.length - 1) {
    closeSpeakingScreen();
  } else {
    _spIdx++;
    _renderSpeakingScreen();
  }
}

function _hspSetNextEnabled(enabled) {
  _spCanProceed = !!enabled;
  const btn = document.getElementById("hsp-next-btn");
  if (!btn) return;
  btn.disabled = !enabled;
  btn.classList.toggle("is-disabled", !enabled);
}

function _showHanziDoneScreen() {
  const total = _spItems.length;

  let doneEl = document.getElementById("hanzi-sp-done-wrap");
  if (!doneEl) {
    doneEl = document.createElement("div");
    doneEl.id = "hanzi-sp-done-wrap";
    doneEl.style.cssText = "flex:1; overflow-y:auto; display:block;";
    const scr = document.getElementById("hanzi-speaking-screen");
    if (scr) scr.appendChild(doneEl);
  }

  const body = document.querySelector("#hanzi-speaking-screen .sp-body");
  const nav = document.querySelector("#hanzi-speaking-screen .sp-nav");
  if (body) body.style.display = "none";
  if (nav) nav.style.display = "none";

  showDoneScreen("hanzi-sp-done-wrap", {
    correct: total,
    wrong: 0,
    total: total,
    xp: XP.SPEAKING,
    showDots: false,
    btnMainLabel: "🔀 Ulangi",
    btnMainFn: "window._restartHanziLatihan",
    btnSecLabel: "Kembali",
    btnSecFn: "window._closeHanziDone",
  });
}

export function _restartHanziLatihan() {
  const scr = document.getElementById("hanzi-speaking-screen");
  if (scr) scr.remove();
  startHanziLatihan();
}

export function _closeHanziDone() {
  window.removeEventListener("popstate", _onSpeakingPopState);
  cancelTTS();
  const scr = document.getElementById("hanzi-speaking-screen");
  if (scr) scr.remove();
  history.back();
}

async function _saveHanziProgress() {
  if (typeof window.hanziScores !== "undefined")
    window.hanziScores[currentHanziKey] = 100;
  updateHanziDashboard();

  if (typeof window._recordDailyStreak === "function")
    window._recordDailyStreak().catch(console.error);

  const currentUser = getCurrentUser();
  if (!currentUser) return;

  try {
    await supa.from("user_scores").upsert(
      {
        user_id: currentUser.id,
        type: "hanzi",
        key: currentHanziKey,
        score: 100,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,type,key" },
    );
    showXPToast(XP.HANZI_SELESAI, "Hanzi selesai");
    if (typeof window.invalidateStatsCache === "function")
      window.invalidateStatsCache();
    if (typeof window.renderActList === "function")
      window.renderActList().catch(console.error);
    if (typeof window._renderLevel === "function") window._renderLevel();
  } catch (e) {
    console.error("saveHanziProgress error:", e);
  }
}

async function _saveSpeakingXP() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  try {
    const key = currentHanziKey + "_speaking";
    await supa.from("user_scores").upsert(
      {
        user_id: currentUser.id,
        type: "speaking_session",
        key: key,
        score: 20,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,type,key" },
    );

    if (typeof window.speakingScores !== "undefined") {
      const prevScore = window.speakingScores[key] ?? 0;
      window.speakingScores[key] = Math.max(prevScore, 20);
    }

    if (typeof window.invalidateStatsCache === "function")
      window.invalidateStatsCache();
    if (typeof window._renderLevel === "function") window._renderLevel();
    if (typeof window.renderStats === "function") window.renderStats();
    if (typeof window.updateDailyProgress === "function")
      window.updateDailyProgress();
    if (typeof window._recordDailyStreak === "function")
      window._recordDailyStreak().catch(console.error);
  } catch (e) {
    console.error("saveSpeakingXP error:", e);
  }
}

/* ══════════════════════════════════════════════════════════════
   HANZI SPEAKING ADAPTER
══════════════════════════════════════════════════════════════ */

function _normalizeChinese(str) {
  if (!str) return "";
  return str
    .replace(
      /[，,、。．？?！!；;：:＂"＇'「」『』【】（）()〈〉《》〔〕［］｛｝·\s]/g,
      "",
    )
    .trim();
}

function _spkGetHanziCard() {
  if (!_spItems || !_spItems[_spIdx]) return null;
  const item = _spItems[_spIdx];
  return { hz: item.hz, py: item.py, id: item.id };
}

function _hspSetMicUI(active) {
  const btn = document.getElementById("hsp-btn-mic");
  const icon = document.getElementById("hsp-mic-icon");
  const txt = document.getElementById("hsp-mic-txt");
  if (!btn) return;
  if (active) {
    btn.classList.add("spk-tb-recording");
    if (icon) icon.innerHTML = '<span class="spk-dot-pulse"></span>';
    if (txt) txt.textContent = "Mendengarkan...";
  } else {
    btn.classList.remove("spk-tb-recording");
    if (icon) icon.textContent = "🎙";
    if (txt) txt.textContent = "Coba Ucapkan";
  }
}

let _hspFbTimeout = null;

function _hspShowFb(type, msg) {
  const fb = document.getElementById("hsp-feedback");
  if (!fb) return;
  if (_hspFbTimeout) clearTimeout(_hspFbTimeout);

  fb.className = "spk-fb spk-fb--" + type;
  const _fbParts = msg.trim().split("\n");
  fb.innerHTML =
    `<span style="font-weight:500;font-size:13px;">${_fbParts[0]}</span>` +
    (_fbParts[1]
      ? `<br><span style="font-size:12px;opacity:0.75;">${_fbParts[1]}</span>`
      : "");

  let duration =
    type === "interim"
      ? 3000
      : type === "warn"
        ? 4500
        : type === "err"
          ? 5000
          : 2500;
  _hspFbTimeout = setTimeout(() => {
    if (fb) fb.className = "spk-fb spk-fb--hidden";
  }, duration);
}

function _hspHideFb() {
  if (_hspFbTimeout) clearTimeout(_hspFbTimeout);
  const fb = document.getElementById("hsp-feedback");
  if (fb) fb.className = "spk-fb spk-fb--hidden";
}

function _spkSimilarity(a, b) {
  a = _normalizeChinese(a);
  b = _normalizeChinese(b);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;
  let matches = 0;
  const usedIdx = new Set();
  for (let i = 0; i < shorter.length; i++) {
    const idx = longer.indexOf(shorter[i]);
    if (idx !== -1 && !usedIdx.has(idx)) {
      matches++;
      usedIdx.add(idx);
    }
  }
  return Math.round((matches / longer.length) * 100);
}

function _spkStripTones(py) {
  if (!py) return "";
  const toneMap = {
    ā: "a",
    á: "a",
    ǎ: "a",
    à: "a",
    ē: "e",
    é: "e",
    ě: "e",
    è: "e",
    ī: "i",
    í: "i",
    ǐ: "i",
    ì: "i",
    ō: "o",
    ó: "o",
    ǒ: "o",
    ò: "o",
    ū: "u",
    ú: "u",
    ǔ: "u",
    ù: "u",
    ǖ: "v",
    ǘ: "v",
    ǚ: "v",
    ǜ: "v",
  };
  return py.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, (m) => toneMap[m] || m);
}

function _spkMatch(spoken, targetCard) {
  const spokenNorm = _normalizeChinese(spoken);
  const targetNorm = _normalizeChinese(targetCard.hz);
  if (spokenNorm === targetNorm) return true;
  if (spokenNorm.includes(targetNorm) || targetNorm.includes(spokenNorm))
    return true;
  const cardPyPlain = _spkStripTones(targetCard.py).replace(/\s+/g, "");
  if (spokenNorm === cardPyPlain) return true;
  if (spokenNorm.includes(cardPyPlain) || cardPyPlain.includes(spokenNorm))
    return true;
  return _spkSimilarity(spokenNorm, targetNorm) >= 75;
}

export function _spkListenHanzi() {
  const card = _spkGetHanziCard();
  if (!card) return;
  speakMandarin(card.hz, null, true);
  const iconEl = document.getElementById("hsp-listen-icon");
  const txtEl = document.getElementById("hsp-listen-txt");
  const stepIdx =
    (typeof window._ttsTapCount !== "undefined" ? window._ttsTapCount - 1 : 0) %
    3;
  const labels = ["Dengarkan", "Pelan", "Lebih Pelan"];
  const icons = ["🔊", "🐢", "🐌"];
  if (iconEl) iconEl.textContent = icons[stepIdx] || "🔊";
  if (txtEl) txtEl.textContent = labels[stepIdx] || "Dengarkan";
}

const SR_API = window.SpeechRecognition || window.webkitSpeechRecognition;
const SPK_SUPPORTED = !!SR_API;
let _spkRecog = null;
let _spkIsRec = false;

export function _spkToggleRecHanzi() {
  if (!SPK_SUPPORTED) {
    _hspShowFb("err", "Browser tidak mendukung. Gunakan Chrome atau Edge.");
    return;
  }
  if (_spkIsRec) {
    _spkStopRec();
    return;
  }

  _spkIsRec = true;
  _hspSetMicUI(true);
  _hspHideFb();
  _hspSetNextEnabled(false);

  _spkRecog = new SR_API();
  _spkRecog.lang = "zh-CN";
  _spkRecog.interimResults = true;
  _spkRecog.maxAlternatives = 3;

  _spkRecog.onresult = (e) => {
    const result = e.results[0];
    const isFinal = result.isFinal;
    const first = result[0].transcript.trim();

    if (!isFinal) {
      _hspShowFb("interim", '"' + first + '" ...');
      return;
    }

    const card = _spkGetHanziCard();
    const alternatives = [];
    for (let i = 0; i < result.length; i++)
      alternatives.push(result[i].transcript.trim());

    let matched = alternatives.some((t) => _spkMatch(t, card));
    let bestScore = 0;
    alternatives.forEach((t) => {
      const sc = _spkSimilarity(t, card.hz);
      if (sc > bestScore) bestScore = sc;
    });
    if (matched) bestScore = Math.max(bestScore, 85);

    const isCorrect = bestScore >= 60;
    const displayResult = isCorrect ? card.hz : first;

    if (bestScore > 80) {
      _hspSetNextEnabled(true);
      _hspShowFb("ok", `✓ Bagus! ${bestScore}% Tepat Sekali!\n"${displayResult}"`);
    } else if (bestScore >= 60) {
      _hspSetNextEnabled(false);
      _hspShowFb("warn", `${bestScore}% — Hampir Sesuai\n"${displayResult}"`);
    } else {
      _hspSetNextEnabled(false);
      _hspShowFb("err", `${bestScore}% — HUH WKWK?!\n"${first}"`);
    }
  };

  let _spkEnded = false;
  const _spkDone = () => {
    if (_spkEnded) return;
    _spkEnded = true;
    if (_spkRecog) {
      try {
        _spkRecog.stop();
      } catch (e) {}
      _spkRecog = null;
    }
    _spkIsRec = false;
    _hspSetMicUI(false);
  };

  _spkRecog.onerror = (e) => {
    const msg =
      e.error === "not-allowed"
        ? "Izinkan akses mikrofon di browser."
        : e.error === "no-speech"
          ? "Tidak ada suara, coba lagi."
          : "Error: " + e.error;
    _hspShowFb("err", msg);
    _spkDone();
  };
  _spkRecog.onend = () => _spkDone();
  _spkRecog.start();
}

function _spkStopRec(skipMicReset = false) {
  if (_spkRecog) {
    try {
      _spkRecog.stop();
    } catch (e) {}
    _spkRecog = null;
  }
  _spkIsRec = false;
  if (!skipMicReset) _hspSetMicUI(false);
}

export function closeSpeakingScreen(fromPopState = false) {
  window.removeEventListener("popstate", _onSpeakingPopState);
  cancelTTS();
  _spkStopRec(true);
  _hspHideFb();

  const scr = document.getElementById("hanzi-speaking-screen");
  if (!scr) return;

  const isFinished = _spIdx >= _spItems.length - 1;

  if (isFinished) {
    if (typeof window.hanziDoneSessions !== "undefined")
      window.hanziDoneSessions.add(currentHanziKey);
    showXPToast(XP.SPEAKING, "Speaking selesai");
    _showHanziDoneScreen();
    _saveSpeakingXP().catch(console.error);
    return;
  }

  if (!fromPopState) history.back();
  scr.remove();
}

/* ── Update Hanzi Dashboard ── */
export function updateHanziDashboard() {
  const total = window._hanziSetsCache
    ? window._hanziSetsCache.length
    : typeof window.HANZI_KEYS !== "undefined"
      ? window.HANZI_KEYS.length
      : 0;
  const done = Object.values(window.hanziScores || {}).filter(
    (sc) => sc >= 100,
  ).length;

  const valEl = document.getElementById("mc-hanzi-val");
  const fillEl = document.getElementById("mc-hanzi-fill");
  if (valEl) valEl.textContent = `${done} / ${total || "?"}`;
  if (fillEl)
    fillEl.style.width = total > 0 ? (done / total) * 100 + "%" : "0%";
}

function _quizDoneCountByHSKHanzi(hskLevel) {
  if (!window._quizSetsCache) return 0;
  return window._quizSetsCache.filter(
    (q) => q.hsk_level === hskLevel && window.quizScores?.[q.key] !== undefined,
  ).length;
}

/* ── Render Hanzi List (layer) ── */
export async function renderHanziList() {
  const grid = document.getElementById("hanzi-list-grid");
  if (!grid) return;

  await loadUnlockedTiers();
  await loadTierStartDecks("hanzi_sets");

  const cacheComplete =
    window._hanziSetsCache &&
    window._hanziSetsCache[0]?.description !== undefined;

  if (!cacheComplete) {
    grid.innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--dim);font-size:13px;"><span class="spinner"></span>Memuat...</div>';
    const { data, error } = await supa
      .from("hanzi_sets")
      .select(
        "key, title, sub, description, badge, hsk_level, sort_order, unlock_after",
      )
      .order("hsk_level", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) {
      grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--dim);">Gagal memuat: ${error.message}</div>`;
      return;
    }
    if (!data || data.length === 0) {
      grid.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--dim);">Belum ada data set hanzi</div>';
      return;
    }
    window._hanziSetsCache = data;
  }

  if (!window._quizSetsCache) {
    const { data: qData } = await supa
      .from("quiz_sets")
      .select("key, hsk_level")
      .order("hsk_level", { ascending: true })
      .order("sort_order", { ascending: true });
    if (qData) window._quizSetsCache = qData;
  }

  grid.innerHTML = window._hanziSetsCache
    .map((s, i) => {
      const hsk = `hsk${s.hsk_level}`;
      const badge = s.badge || (s.hsk_level ? `HSK ${s.hsk_level}` : "HSK");
      const desc = s.description || s.sub || "Kalimat Kumulatif";
      const quizDone = _quizDoneCountByHSKHanzi(s.hsk_level);

      // MENGGUNAKAN resolveCumulativeLock
      const { isLocked, reason } = resolveCumulativeLock({
        hskLevel: s.hsk_level,
        deckIndex: i,
        completedQuizCount: quizDone,
        unlockAfter: s.unlock_after,
        tableName: "hanzi_sets",
      });

      const lockedOnclick = `window.showToast('${lockMessage(reason, { unlockAfter: s.unlock_after })}', 'warn')`;

      const isDone = window.hanziScores?.[s.key] >= 100;

      return `<div class="item-card${isLocked ? " locked" : ""}${isDone ? " done" : ""}" data-hsk="${hsk}" onclick="${isLocked ? lockedOnclick : `window.startHanzi('${s.key}')`}">
      <div class="item-card-top"><span class="day-badge">${badge}</span>${isDone ? '<span class="item-done-badge">✓ Selesai</span>' : ""}</div>
      <div class="item-title">${s.title || s.key}</div>
      <div class="item-desc">${desc}</div>
      <div class="item-meta"><span class="item-date">Kalimat Kumulatif</span><button class="btn-open" onclick="event.stopPropagation();${isLocked ? lockedOnclick : `window.startHanzi('${s.key}')`}">${isLocked ? "🔒" : isDone ? "Ulangi" : "Buka"}</button></div>
    </div>`;
    })
    .join("");

  const activeItem = document.querySelector(
    "#hsk-filter-hanzi .hsk-dropdown-item.active",
  );
  if (activeItem && typeof window.filterHSK === "function") {
    window.filterHSK("hanzi", activeItem.dataset.level || "all", null);
  } else {
    const activePill = document.querySelector(
      "#hsk-filter-hanzi .hsk-pill.active",
    );
    if (activePill && typeof window.filterHSK === "function") {
      const txt = activePill.textContent
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
      window.filterHSK("hanzi", txt === "semua" ? "all" : txt, activePill);
    }
  }
}

/* ── Expose ke window untuk dipanggil dari HTML ── */
window.loadHanziFromDB = loadHanziFromDB;
window.startHanzi = startHanzi;
window.renderHanzi = renderHanzi;
window.advanceH = advanceH;
window.resetHanzi = resetHanzi;
window.closeHanzi = closeHanzi;
window.startHanziLatihan = startHanziLatihan;
window.updateHanziDashboard = updateHanziDashboard;
window.renderHanziList = renderHanziList;
window.closeSpeakingScreen = closeSpeakingScreen;
window._spActionTap = _spActionTap;
window._restartHanziLatihan = _restartHanziLatihan;
window._closeHanziDone = _closeHanziDone;
window._spkListenHanzi = _spkListenHanzi;
window._spkToggleRecHanzi = _spkToggleRecHanzi;
window._spkStopRec = _spkStopRec;
