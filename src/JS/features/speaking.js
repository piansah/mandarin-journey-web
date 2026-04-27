/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   SPEAKING.JS — Dengarkan & Coba Ucapkan di Flashcard Screen
   v5 — pakai _stripTones() & cancelTTS() dari utils.js
        (hapus duplikat _spkStripTones)
   Toolbar HTML sudah ada di index.html (#spk-toolbar).
   ============================================================ */

import { _stripTones } from "../utilities/pinyin.js";
import { cancelTTS, speakMandarin } from "../utilities/tts.js";

const SR_API = window.SpeechRecognition || window.webkitSpeechRecognition;
const SPK_SUPPORTED = !!SR_API;

let _spkRecog = null;
let _spkIsRec = false;
let _spkFbTimer = null;

/* ── Init: tandai tombol mic jika browser tidak support ── */
document.addEventListener("DOMContentLoaded", () => {
  if (!SPK_SUPPORTED) {
    const btn = document.getElementById("spk-btn-mic");
    if (btn) {
      btn.classList.add("spk-tb-disabled");
      btn.title = "Browser tidak mendukung. Gunakan Chrome atau Edge.";
    }
  }
});

/* ── _spkReset dipanggil langsung dari renderFCCard() di flashcard.js ──
   Tidak ada monkey-patch — flashcard.js memanggil _spkReset() dengan guard
   "typeof _spkReset === 'function'" sehingga aman meski speaking.js belum load. */
export function _spkReset() {
  _spkStopRec();
  _spkHideFb();
}

/* ════════════════════ DENGARKAN ════════════════════ */
export function _spkListen() {
  if (typeof window.fcCards === "undefined" || !window.fcCards.length) return;
  const card = window.fcCards[window.fcIdx];
  if (!card?.hz) return;

  speakMandarin(card.hz, true);
}

/* ════════════════════ COBA UCAPKAN ════════════════════ */
export function _spkToggleRec() {
  if (!SPK_SUPPORTED) {
    _spkShowFb("err", "Browser tidak mendukung. Gunakan Chrome atau Edge.");
    return;
  }
  _spkIsRec ? _spkStopRec() : _spkStartRec();
}

function _spkStartRec() {
  _spkIsRec = true;
  _spkSetMicUI(true);
  _spkHideFb();

  _spkRecog = new SR_API();
  _spkRecog.lang = "zh-CN";
  _spkRecog.interimResults = true;
  _spkRecog.maxAlternatives = 3;

  _spkRecog.onresult = (e) => {
    const result = e.results[0];
    const isFinal = result.isFinal;
    const first = result[0].transcript.trim();

    if (!isFinal) {
      _spkShowFb("interim", '"' + first + '" ...');
      return;
    }

    const card = window.fcCards[window.fcIdx];

    /* Kumpulkan semua alternatif dari speech recognition */
    const alternatives = [];
    for (let i = 0; i < result.length; i++) {
      alternatives.push(result[i].transcript.trim());
    }

    /* Cek match langsung dulu */
    let matched = alternatives.some((t) => _spkMatch(t, card));

    /* Fallback homofon: kalau tidak match, cek apakah transcript adalah hanzi
       yang pinyinnya (strip tones) sama dengan pinyin kartu aktif.
       Ini menangani semua kasus homofon (她/他/它, 哪/那, dll) tanpa tabel manual.
       — gunakan _stripTones() dari utils.js (bukan duplikat lokal) */
    if (!matched) {
      const cardPyPlain = _stripTones(card.py).replace(/\s+/g, "");
      matched = alternatives.some((t) => {
        const t2 = t.trim();
        return (
          typeof window.fcCards !== "undefined" &&
          window.fcCards.some(
            (c) =>
              c.hz === t2 &&
              _stripTones(c.py).replace(/\s+/g, "") === cardPyPlain,
          )
        );
      });
    }

    /* Hitung best score untuk feedback */
    let bestScore = 0;
    alternatives.forEach((t) => {
      const sc = _spkSimilarity(t, card.hz);
      if (sc > bestScore) bestScore = sc;
    });
    if (matched) bestScore = Math.max(bestScore, 85);

    const isCorrect = bestScore >= 60;
    const displayResult = isCorrect ? card.hz : first;

    if (bestScore >= 80) {
      _spkShowFb("ok", `✓ Bagus! ${bestScore}% Tepat Sekali!\n"${displayResult}"`);
    } else if (bestScore >= 60) {
      _spkShowFb("warn", `${bestScore}% — Hampir Sesuai\n"${displayResult}"`);
    } else {
      _spkShowFb("err", `${bestScore}% — HUH WKWK?!\n"${first}"`);
    }
  };

  _spkRecog.onerror = (e) => {
    const msg =
      e.error === "not-allowed"
        ? "Izinkan akses mikrofon di browser."
        : e.error === "no-speech"
          ? "Tidak ada suara, coba lagi."
          : "Error: " + e.error;
    _spkShowFb("err", msg);
    _spkStopRec();
  };

  _spkRecog.onend = () => _spkStopRec();
  _spkRecog.start();
}

function _spkStopRec() {
  _spkIsRec = false;
  if (_spkRecog) {
    try {
      _spkRecog.stop();
    } catch (_) {}
    _spkRecog = null;
  }
  _spkSetMicUI(false);
}

/* ════════════════════════════════════════════════════
   PENCOCOKAN — threshold 75%
   1. Cocok hanzi PERSIS → benar
   2. Cocok hanzi SEBAGIAN ≥75% → benar
   3. Cocok pinyin SEBAGIAN ≥75% → benar
   — _stripTones() dari utils.js dipakai di sini
════════════════════════════════════════════════════ */
function _normalizeChinese(str) {
  if (!str) return "";
  // Menghapus spasi, koma, titik, tanda tanya, tanda seru, dan tanda baca Mandarin lainnya
  return str
    .replace(/[，,、。．？?！!；;：:＂"＇'「」『』【】（）()〈〉《》〔〕［］｛｝·\s]/g, "")
    .trim();
}

/* Hitung edit distance antara dua string (insert / delete / replace = 1 langkah) */
function _levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function _spkSimilarity(a, b) {
  a = _normalizeChinese(a);
  b = _normalizeChinese(b);
  if (!a || !b) return 0;
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  const dist = _levenshtein(a, b);
  return Math.max(0, Math.round((1 - dist / maxLen) * 100));
}

function _spkMatch(transcript, card) {
  if (!card) return false;
  // Normalisasi transkrip dan target Hanzi
  const t = _normalizeChinese(transcript.toLowerCase());
  const hz = _normalizeChinese(card.hz);
  const py = card.py;

  /* Lapis 1: cocok hanzi PERSIS */
  if (t === hz) return true;

  /* Lapis 2: cocok hanzi SEBAGIAN — minimum 75% karakter */
  if (hz.includes(t) && t.length >= 1) {
    if (t.length / hz.length >= 0.75) return true;
  }

  /* Lapis 3: cocok pinyin — minimum 75% karakter
     — gunakan _stripTones() dari utils.js */
  const pyPlain = _stripTones(py).replace(/\s+/g, "");
  // Catatan: tLatin di sini tetap Hanzi jika SpeechRecognition mengembalikan Hanzi,
  // sehingga pencocokan pinyin ini hanya efektif jika SpeechRecognition mengembalikan Latin.
  const tLatin = _stripTones(t);

  if (tLatin.length >= 2 && pyPlain.includes(tLatin)) {
    if (tLatin.length / pyPlain.length >= 0.75) return true;
  }

  /* Lapis 3b: pinyin user lebih panjang dari kartu (edge case) */
  if (tLatin.length >= 2 && tLatin.includes(pyPlain)) return true;

  return false;
}

/* ════════════════════ UI HELPERS ════════════════════ */
function _spkSetMicUI(active) {
  const btn = document.getElementById("spk-btn-mic");
  const icon = document.getElementById("spk-mic-icon");
  const txt = document.getElementById("spk-mic-txt");
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

function _spkShowFb(type, msg) {
  const fb = document.getElementById("spk-feedback");
  if (!fb) return;
  if (_spkFbTimer) clearTimeout(_spkFbTimer);
  fb.className = "spk-fb spk-fb--" + type;
  const parts = msg.trim().split("\n");
  fb.innerHTML =
    `<span class="spk-fb-label">${parts[0]}</span>` +
    (parts[1] ? `<br><span class="spk-fb-hanzi">${parts[1]}</span>` : "");
  const duration =
    type === "ok"
      ? 3500
      : type === "warn"
        ? 6500
        : type === "err"
          ? 65000
          : 5000;
  _spkFbTimer = setTimeout(_spkHideFb, duration);
}

function _spkHideFb() {
  if (_spkFbTimer) clearTimeout(_spkFbTimer);
  const fb = document.getElementById("spk-feedback");
  if (fb) fb.className = "spk-fb spk-fb--hidden";
}

/* ── Expose ke window untuk dipanggil dari HTML onclick ── */
window._spkReset = _spkReset;
window._spkListen = _spkListen;
window._spkToggleRec = _spkToggleRec;
window._spkStopRec = _spkStopRec;
window._spkSimilarity = _spkSimilarity; // dipakai di mic.js
