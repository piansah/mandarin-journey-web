/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   NADA.JS — Latihan Nada Mandarin
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showToast } from "../utilities/helpers.js";
import { showDoneScreen } from "../core/done-screen.js";
import { showXPToast } from "../utilities/helpers.js";
import { calcXPNada } from "../utilities/xp.js";

/* ── State ── */
let _nadaItems = [];
let _nadaIdx = 0;
let _nadaTotal = 10;
let _nadaCorrect = 0;
let _nadaWrong = 0;
let _nadaAnswered = false;
let _nadaTitle = "";
let _nadaIsPersonal = false;

/* ── Adaptive: cache history per kata (key = hz) ──
   Format: { [hz]: { correct: N, wrong: N } }
   Di-load dari DB saat startNadaLatihan, di-update tiap jawab.
   ── */
let _nadaWordHistory = {};
let _nadaSourceCards = []; // simpan pool asli untuk restart adaptif

/* ── Tone helpers ── */
const _NADATM = {
  ā: 1,
  á: 2,
  ǎ: 3,
  à: 4,
  ē: 1,
  é: 2,
  ě: 3,
  è: 4,
  ī: 1,
  í: 2,
  ǐ: 3,
  ì: 4,
  ō: 1,
  ó: 2,
  ǒ: 3,
  ò: 4,
  ū: 1,
  ú: 2,
  ǔ: 3,
  ù: 4,
  ǖ: 1,
  ǘ: 2,
  ǚ: 3,
  ǜ: 4,
};
const _NADATONED = {
  a: ["ā", "á", "ǎ", "à"],
  e: ["ē", "é", "ě", "è"],
  i: ["ī", "í", "ǐ", "ì"],
  o: ["ō", "ó", "ǒ", "ò"],
  u: ["ū", "ú", "ǔ", "ù"],
  ü: ["ǖ", "ǘ", "ǚ", "ǜ"],
};

function _nadaGetTone(py) {
  for (const c of py) if (_NADATM[c]) return _NADATM[c];
  return 0;
}

function _nadaStripTone(s) {
  return s
    .split("")
    .map((c) => {
      const map = {
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
        ǖ: "ü",
        ǘ: "ü",
        ǚ: "ü",
        ǜ: "ü",
      };
      return map[c] || c;
    })
    .join("");
}

function _nadaApplyTone(syl, n) {
  const idx = n - 1;
  const s = syl.toLowerCase();
  for (const v of ["a", "e", "o", "ü", "i", "u"]) {
    if (s.includes(v) && _NADATONED[v]) {
      return s.replace(v, _NADATONED[v][idx]);
    }
  }
  return syl;
}

/* ── Ambil suku kata pertama pinyin (support spasi & sambung) ──
   Contoh: "zàijiàn" → "zài", "nǐ hǎo" → "nǐ"              */
function _nadaFirstSyl(py) {
  const trimmed = py.trim();
  if (/\s/.test(trimmed)) return trimmed.split(/\s+/)[0];
  const TONED = "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ";
  const VOWELS = "aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ";
  const INITIALS = [
    "zh",
    "ch",
    "sh",
    "b",
    "p",
    "m",
    "f",
    "d",
    "t",
    "n",
    "l",
    "g",
    "k",
    "h",
    "j",
    "q",
    "x",
    "r",
    "z",
    "c",
    "s",
    "y",
    "w",
  ];
  let i = 0;
  for (const ini of INITIALS) {
    if (trimmed.toLowerCase().startsWith(ini)) {
      i = ini.length;
      break;
    }
  }
  let hasVowel = false;
  while (i < trimmed.length) {
    const ch = trimmed[i];
    if (VOWELS.includes(ch)) {
      hasVowel = true;
      i++;
    } else if (hasVowel) break;
    else break;
  }
  if (hasVowel && i < trimmed.length) {
    const rest = trimmed.slice(i).toLowerCase();
    if (rest.startsWith("ng")) i += 2;
    else if (rest[0] === "n" && !VOWELS.includes(rest[1] || "")) i += 1;
    else if (rest[0] === "r" && !VOWELS.includes(rest[1] || "")) i += 1;
  }
  return i > 0 ? trimmed.slice(0, i) : trimmed.split(/\s+/)[0];
}

/* ── Render pinyin dengan warna per suku kata sesuai nadanya ── */
function _nadaColorPy(py) {
  return py
    .trim()
    .split(/\s+/)
    .map((syl) => {
      const t = _nadaGetTone(syl);
      if (t >= 1 && t <= 4) return `<span class="t${t}">${syl}</span>`;
      return `<span class="t0">${syl}</span>`;
    })
    .join(" ");
}

/* ══════════════════════════════════════════════
   ADAPTIVE POOL — bobot kata salah lebih tinggi
   Error rate = wrong / (correct + wrong)
   Bobot: error rate 0% → 1×, 100% → 4×
   Pool dipilih weighted-random, tanpa duplikat.
══════════════════════════════════════════════ */

function _nadaWordWeight(hz) {
  const h = _nadaWordHistory[hz];
  if (!h) return 2;
  const total = h.correct + h.wrong;
  if (total === 0) return 2;
  const errorRate = h.wrong / total;
  return 1 + Math.round(errorRate * 3);
}

function _nadaBuildPool(cards) {
  const valid = cards.filter((c) => {
    if (!c.hanzi || !c.pinyin) return false;
    const t = _nadaGetTone(_nadaFirstSyl(c.pinyin));
    return t >= 1 && t <= 4;
  });
  if (!valid.length) return [];

  const weighted = [];
  for (const c of valid) {
    const w = _nadaWordWeight(c.hanzi);
    for (let i = 0; i < w; i++) weighted.push(c);
  }

  const picked = [];
  const usedHz = new Set();
  const pool = _nadaShuffle([...weighted]);
  for (const c of pool) {
    if (usedHz.has(c.hanzi)) continue;
    usedHz.add(c.hanzi);
    picked.push(c);
    if (picked.length >= 10) break;
  }
  if (picked.length < 10) {
    for (const c of _nadaShuffle([...valid])) {
      if (usedHz.has(c.hanzi)) continue;
      usedHz.add(c.hanzi);
      picked.push(c);
      if (picked.length >= 10) break;
    }
  }

  return picked.map((c) => {
    const syl = _nadaFirstSyl(c.pinyin);
    const tone = _nadaGetTone(syl);
    const base = _nadaStripTone(syl);
    const rest = c.pinyin.slice(syl.length);
    return {
      hz: c.hanzi,
      py: c.pinyin,
      arti: c.arti || "",
      syl,
      tone,
      base,
      variants: [1, 2, 3, 4].map((n) => _nadaApplyTone(base, n) + rest),
    };
  });
}

/* ── Load history dari DB (user_scores type="nada") ── */
async function _nadaLoadHistory() {
  _nadaWordHistory = {};
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  try {
    const { data, error } = await supa
      .from("user_scores")
      .select("key, meta")
      .eq("user_id", currentUser.id)
      .eq("type", "nada_word");   // FIX: sinkron dengan _nadaFlushWordHistory
    if (error || !data) return;
    for (const row of data) {
      if (row.meta && typeof row.meta.correct === "number") {
        _nadaWordHistory[row.key] = {
          correct: row.meta.correct || 0,
          wrong: row.meta.wrong || 0,
        };
      }
    }
  } catch (e) {
    console.warn("_nadaLoadHistory:", e);
  }
}

function _nadaSaveWordResult(hz, isCorrect) {
  if (!_nadaWordHistory[hz]) _nadaWordHistory[hz] = { correct: 0, wrong: 0 };
  if (isCorrect) _nadaWordHistory[hz].correct++;
  else _nadaWordHistory[hz].wrong++;
}


async function _nadaSaveSession(pct) {
  if (_nadaIsPersonal) return; // Tidak ada penyimpanan atau toast XP untuk deck personal
  
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  // FIX: pakai calcXPNada(_nadaCorrect) bukan hardcode, cap ke SESSION_CAP (36)
  const xp = Math.min(calcXPNada(_nadaCorrect), 36);
  const key = _nadaTitle.replace(/\s+/g, "_").slice(0, 60) || "latihan_nada";

  try {
    const prevScore =
      typeof window.nadaScores !== "undefined"
        ? (window.nadaScores[key] ?? 0)
        : 0;
    const finalScore = Math.max(prevScore, xp);

    await supa.from("user_scores").upsert(
      {
        user_id: currentUser.id,
        type: "nada_session",
        key,
        score: finalScore,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,type,key" },
    );

    if (typeof window.nadaScores !== "undefined") {
      window.nadaScores[key] = finalScore;
    }

    showXPToast(xp, "Latihan Nada selesai");               // FIX: notifikasi XP (sebelumnya tidak ada)

    if (typeof window.invalidateStatsCache === "function")  // FIX: invalidate cache profile
      window.invalidateStatsCache();
    if (typeof window._renderLevel === "function") window._renderLevel();
    if (typeof window.renderStats === "function") window.renderStats();
    if (typeof window.updateDailyProgress === "function")
      window.updateDailyProgress();
    if (typeof window._recordDailyStreak === "function") {
      window._recordDailyStreak().catch(console.error);
    }
  } catch (e) {
    console.warn("_nadaSaveSession:", e);
  }
}

function _nadaShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function _nadaShowHeader(visible) {
  const nadaHd = document.querySelector("#nada-screen .nada-hd");
  const nadaProg = document.querySelector("#nada-screen .nada-prog");
  if (nadaHd) nadaHd.style.display = visible ? "" : "none";
  if (nadaProg) nadaProg.style.display = visible ? "" : "none";
}

/* ── Entry Point ── */
export async function startNadaLatihan(cards, title, isPersonal = false) {
  _nadaShowHeader(true);

  _nadaTitle = title || "Latihan Nada";
  _nadaIsPersonal = isPersonal;
  _nadaSourceCards = cards;
  _nadaIdx = 0;
  _nadaCorrect = 0;
  _nadaWrong = 0;

  await _nadaLoadHistory();

  _nadaItems = _nadaBuildPool(cards);
  _nadaTotal = _nadaItems.length;

  if (!_nadaTotal) {
    showToast("Tidak ada latihan nada.", "warn");
    return;
  }
  _nadaRenderScreen();
}

function _nadaRenderScreen() {
  let scr = document.getElementById("nada-screen");
  if (!scr) {
    scr = document.createElement("div");
    scr.id = "nada-screen";
    document.body.appendChild(scr);
    history.pushState({ nadaScreen: true }, "");
    window.addEventListener("popstate", _nadaOnPopState);
  }

  _nadaAnswered = false;
  const q = _nadaItems[_nadaIdx];
  const pct = (((_nadaIdx + 1) / _nadaTotal) * 100).toFixed(1);

  scr.innerHTML = `
    <div class="nada-hd">
      <div>
        <div class="nada-hd-title">Latihan Nada</div>
        <div class="nada-hd-sub">${_nadaTitle}</div>
      </div>
      <div class="nada-counter">
        <div class="nada-counter-num">${_nadaIdx + 1}</div>
        <div class="nada-counter-denom">dari ${_nadaTotal}</div>
      </div>
    </div>

    <div class="nada-prog">
      <div class="nada-prog-fill" style="width:${pct}%"></div>
    </div>

    <div class="nada-body">

      <div class="nada-card" id="nada-card" onclick="_nadaPlay()" role="button" tabindex="0">
        <div class="nada-tts-icon">🔊</div>
        <div class="nada-hz placeholder" id="nada-hz">?</div>
        <div class="nada-py-reveal" id="nada-py-reveal"></div>
        <div class="nada-arti-reveal" id="nada-arti-reveal"></div>
      </div>

      <div class="nada-legend">
        <div class="nada-legend-item"><span class="nada-dot t1"></span>Nada 1 — datar</div>
        <div class="nada-legend-item"><span class="nada-dot t2"></span>Nada 2 — naik</div>
        <div class="nada-legend-item"><span class="nada-dot t3"></span>Nada 3 — turun-naik</div>
        <div class="nada-legend-item"><span class="nada-dot t4"></span>Nada 4 — turun</div>
      </div>

      <div class="nada-choices" id="nada-choices">
        ${[1, 2, 3, 4]
          .map(
            (n) => `
          <button class="nada-choice t${n}" id="nada-c${n}" onclick="_nadaAnswer(${n})">
            <span class="nada-choice-num">NADA ${n}</span>
            <span class="nada-choice-mark">${_nadaColorPy(q.variants[n - 1])}</span>
            <span class="nada-choice-desc">${["datar tinggi", "naik", "turun-naik", "turun tajam"][n - 1]}</span>
          </button>
        `,
          )
          .join("")}
      </div>

      <div class="nada-feedback" id="nada-feedback"></div>
    </div>

    <div class="nada-nav">
      <button class="nada-next-btn" id="nada-next" onclick="_nadaNext()" disabled>Lanjut</button>
    </div>
  `;

  setTimeout(() => _nadaPlay(), 400);
}

function _nadaPlay() {
  const q = _nadaItems[_nadaIdx];
  if (!q || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(q.hz);
  u.lang = "zh-CN";
  u.rate = 0.75;
  const v = window.speechSynthesis
    .getVoices()
    .find((x) => x.lang.startsWith("zh"));
  if (v) u.voice = v;
  window.speechSynthesis.speak(u);
}

function _nadaAnswer(selected) {
  if (_nadaAnswered) return;
  _nadaAnswered = true;

  const q = _nadaItems[_nadaIdx];
  const correct = selected === q.tone;

  if (correct) _nadaCorrect++;
  else _nadaWrong++;

  _nadaSaveWordResult(q.hz, correct);

  for (let n = 1; n <= 4; n++) {
    const btn = document.getElementById("nada-c" + n);
    if (!btn) continue;
    btn.disabled = true;
    if (n === q.tone) btn.classList.add("correct-ans");
    else if (n === selected && !correct) btn.classList.add("wrong-ans");
  }

  const card = document.getElementById("nada-card");
  if (card) card.classList.add(correct ? "correct" : "wrong");

  const hzEl = document.getElementById("nada-hz");
  if (hzEl) {
    hzEl.textContent = q.hz;
    hzEl.classList.remove("placeholder");
  }

  const pyEl = document.getElementById("nada-py-reveal");
  if (pyEl) {
    pyEl.innerHTML = _nadaColorPy(q.py);
    pyEl.classList.add("show");
  }

  const artiEl = document.getElementById("nada-arti-reveal");
  if (artiEl) {
    artiEl.textContent = q.arti;
    artiEl.classList.add("show");
  }

  const fb = document.getElementById("nada-feedback");
  if (fb) {
    const pyColored = _nadaColorPy(q.py);
    const sandhiNote = _nadaSandhiNote(q);
    const sandhiHtml = sandhiNote
      ? `<div class="nada-sandhi">${sandhiNote}</div>`
      : "";
    fb.innerHTML =
      (correct
        ? `✓ Benar! ${q.hz} = ${pyColored} — ${q.arti}`
        : `✗ Salah. Yang benar nada ${q.tone}: ${pyColored}`) + sandhiHtml;
    fb.className = "nada-feedback show " + (correct ? "ok" : "err");
  }

  const next = document.getElementById("nada-next");
  if (next) next.disabled = false;
}

function _nadaNext() {
  _nadaIdx++;
  if (_nadaIdx >= _nadaTotal) {
    _nadaShowDone();
    return;
  }
  _nadaRenderScreen();
}

async function _nadaShowDone() {
  const pct =
    _nadaTotal > 0 ? Math.round((_nadaCorrect / _nadaTotal) * 100) : 0;
  const xp = _nadaIsPersonal ? 0 : calcXPNada(_nadaCorrect);

  _nadaShowHeader(false);

  const body = document.querySelector(".nada-body");
  const nav = document.querySelector(".nada-nav");
  if (body) body.style.display = "none";
  if (nav) nav.style.display = "none";

  let doneEl = document.getElementById("nada-done-wrap");
  if (!doneEl) {
    doneEl = document.createElement("div");
    doneEl.id = "nada-done-wrap";
    doneEl.style.cssText =
      "flex:1; overflow-y:auto; padding:0; margin:0; background:transparent;";
    document.getElementById("nada-screen").appendChild(doneEl);
  }
  doneEl.style.display = "block";

  showDoneScreen("nada-done-wrap", {
    correct: _nadaCorrect,
    wrong: _nadaWrong,
    total: _nadaTotal,
    xp: xp,
    btnMainLabel: "🔀 Ulangi",
    btnMainFn: "_nadaRestart",
    btnSecLabel: "Kembali",
    btnSecFn: "_nadaClose",
  });

  await _nadaSaveSession(pct);
}

function _nadaRestart() {
  _nadaShowHeader(true);

  _nadaIdx = 0;
  _nadaCorrect = 0;
  _nadaWrong = 0;
  const base = _nadaSourceCards.length
    ? _nadaSourceCards
    : _nadaItems.map((i) => ({ hanzi: i.hz, pinyin: i.py, arti: i.arti }));
  _nadaItems = _nadaBuildPool(base);
  _nadaTotal = _nadaItems.length;
  _nadaRenderScreen();
}

function _nadaOnPopState() {
  window.removeEventListener("popstate", _nadaOnPopState);
  _nadaClose(true);
}

function _nadaClose(fromPopState = false) {
  window.removeEventListener("popstate", _nadaOnPopState);
  if (!fromPopState) history.back();
  window.speechSynthesis.cancel();
  const scr = document.getElementById("nada-screen");
  if (scr) scr.remove();
}

/**
 * CLEANUP LOGIC: destroyNada
 */
export function destroyNada() {
  window.removeEventListener("popstate", _nadaOnPopState);
  window.speechSynthesis.cancel();
  const scr = document.getElementById("nada-screen");
  if (scr) scr.remove();
}
window.destroyNada = destroyNada;

function _nadaSandhiNote(q) {
  const syls = q.py.trim().split(/\s+/);
  if (syls.length < 2) return null;

  const firstSyl = syls[0];
  const secondSyl = syls[1];
  const t1 = _nadaGetTone(firstSyl);
  const t2 = _nadaGetTone(secondSyl);
  const stripped1 = _nadaStripTone(firstSyl).toLowerCase();

  if (t1 === 3 && t2 === 3) {
    const spoken = _nadaApplyTone(_nadaStripTone(firstSyl), 2);
    return `💡 Dalam percakapan, <b>${firstSyl}</b> diucapkan nada 2 → <b>${spoken}</b> karena diikuti <b>${secondSyl}</b> (nada 3). Ini disebut <i>tone sandhi</i> (变调 biàndiào).`;
  }

  if (stripped1 === "bu" && t1 === 4 && t2 === 4) {
    return `💡 Dalam percakapan, <b>bù</b> diucapkan nada 2 → <b>bú</b> karena diikuti <b>${secondSyl}</b> (nada 4). Ini disebut <i>tone sandhi</i> (变调 biàndiào).`;
  }

  if (stripped1 === "yi" && t1 === 1) {
    if (t2 === 4) {
      return `💡 Dalam percakapan, <b>yī</b> diucapkan nada 2 → <b>yí</b> karena diikuti <b>${secondSyl}</b> (nada 4). Ini disebut <i>tone sandhi</i> (变调 biàndiào).`;
    }
    if (t2 >= 1 && t2 <= 3) {
      return `💡 Dalam percakapan, <b>yī</b> diucapkan nada 4 → <b>yì</b> karena diikuti <b>${secondSyl}</b> (nada ${t2}). Ini disebut <i>tone sandhi</i> (变调 biàndiào).`;
    }
  }

  return null;
}

/* ── Expose ke window untuk dipanggil dari HTML onclick ── */
window.startNadaLatihan = startNadaLatihan;
window._nadaPlay = _nadaPlay;
window._nadaAnswer = _nadaAnswer;
window._nadaNext = _nadaNext;
window._nadaRestart = _nadaRestart;
window._nadaClose = _nadaClose;