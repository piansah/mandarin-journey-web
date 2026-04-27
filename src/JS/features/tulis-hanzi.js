/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   TULIS-HANZI.JS — Latihan Menulis Hanzi (HanziWriter + Canvas)
   ============================================================ */

import HanziWriter from "hanzi-writer";
import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showScreen, backToLayer, _pushAppHistory } from "../core/navigation.js";
import { showToast, showXPToast } from "../utilities/helpers.js";
import { colorPy } from "../utilities/pinyin.js";
import { XP } from "../utilities/xp.js";
import { showDoneScreen } from "../core/done-screen.js";
import { speakMandarin } from "../utilities/tts.js";

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
let _cards = []; // array kartu dari deck {hanzi, pinyin, arti}
let _idx = 0; // index karakter aktif
let _writer = null; // HanziWriter instance
let _hintOn = false; // apakah panduan hanzi transparan ditampilkan
let _quizActive = false; // apakah quiz stroke sedang berjalan
let _sourceScreen = null; // screen asal sebelum buka tulis hanzi
let _deckTitle = "";

/* ── Ukuran canvas — responsif ── */
function _canvasSize() {
  const vw = Math.min(window.innerWidth, 480);
  return Math.min(Math.floor(vw * 0.72), 280);
}

/* ══════════════════════════════════════════════════════════════
   LOCALSTORAGE PROGRESS
══════════════════════════════════════════════════════════════ */
function _lsKey() {
  return `tulis_prog_${_deckTitle.replace(/\s+/g, "_").slice(0, 60)}`;
}

function _saveProgress() {
  try {
    localStorage.setItem(_lsKey(), String(_idx));
  } catch (_) {}
}

function _loadProgress() {
  try {
    const saved = localStorage.getItem(_lsKey());
    return saved !== null ? parseInt(saved, 10) : 0;
  } catch (_) {
    return 0;
  }
}

function _clearProgress() {
  try {
    localStorage.removeItem(_lsKey());
  } catch (_) {}
}

/* ══════════════════════════════════════════════════════════════
   OPEN / CLOSE
   Dipanggil dari kosakata.js via: window.startTulisHanzi(cards, title, fromScreen)
══════════════════════════════════════════════════════════════ */
export function startTulisHanzi(cards, title, fromScreen = "layer-kos-deck") {
  if (!cards || cards.length === 0) {
    showToast("Tidak ada karakter untuk dilatih.", "err");
    return;
  }

  // Saring hanya kartu dengan 1 karakter hanzi (HanziWriter hanya support 1 karakter)
  // Pecah semua kartu jadi per karakter tunggal
  const parsedCards = [];
  for (const c of cards) {
    const chars = [...(c.hanzi || "")];
    for (const char of chars) {
      parsedCards.push({
        hanzi: char,
        originalWord: c.hanzi,
        pinyin: c.pinyin,
        arti: c.arti,
      });
    }
  }

  if (parsedCards.length === 0) {
    showToast("Tidak ada karakter untuk dilatih.", "err");
    return;
  }

  // Set _deckTitle dulu sebelum _loadProgress()
  _deckTitle = title || "Tulis Hanzi";
  _cards = parsedCards;

  // Restore progress dari localStorage, clamp jaga-jaga
  const saved = _loadProgress();
  _idx = saved < _cards.length ? saved : 0;

  _hintOn = false;
  _quizActive = false;
  _sourceScreen = fromScreen;

  // Pastikan bottom bar tampil kembali jika dari done state sebelumnya
  const bottom = document.querySelector(".tulis-bottom");
  if (bottom) bottom.style.display = "";

  _pushAppHistory();
  showScreen("tulis-screen");
  _renderCard();
}

export function closeTulisHanzi() {
  _destroyWriter();
  if ((_sourceScreen || "").startsWith("layer-")) {
    backToLayer(_sourceScreen || "layer-kos-deck");
    return;
  }
  showScreen(_sourceScreen || "petualangan-screen");
}

/* ══════════════════════════════════════════════════════════════
   RENDER KARTU
══════════════════════════════════════════════════════════════ */
function _renderCard() {
  const card = _cards[_idx];
  if (!card) return;

  // Jika body dalam state done, rebuild HTML dulu
  const body = document.querySelector(".tulis-body");
  if (body && body.querySelector(".tulis-done-wrap")) {
    body.innerHTML = `
      <div class="tulis-info">
        <div class="tulis-hanzi-full" id="tulis-hanzi-full"></div>
        <div class="tulis-pinyin" id="tulis-pinyin"></div>
        <div class="tulis-arti" id="tulis-arti"></div>
      </div>
      <div class="tulis-canvas-wrap">
        <div id="tulis-hanzi-target"></div>
      </div>
      <div class="tulis-hint-row">
        <button class="tulis-hint-btn" id="tulis-hint-btn" onclick="window.toggleTulisHint()">
          👀 Tampilkan Panduan
        </button>
      </div>
    `;
    const bottom = document.querySelector(".tulis-bottom");
    if (bottom) bottom.style.display = "";
  }

  // Header
  const titleEl = document.getElementById("tulis-title");
  const subEl = document.getElementById("tulis-sub");
  if (titleEl) titleEl.textContent = _deckTitle;
  if (subEl) subEl.textContent = "Latihan Menulis";

  // Counter badge di header
  const countNum = document.getElementById("tulis-count-num");
  const countDenom = document.getElementById("tulis-count-denom");
  if (countNum) countNum.textContent = _idx + 1;
  if (countDenom) countDenom.textContent = _cards.length;

  // Progress bar
  const fill = document.getElementById("tulis-prog-fill");
  if (fill) fill.style.width = `${(_idx / _cards.length) * 100}%`;

  // Hanzi, Pinyin & arti
  const hanziFullEl = document.getElementById("tulis-hanzi-full");
  if (hanziFullEl)
    hanziFullEl.textContent = card.originalWord || card.hanzi || "";

  const pinyinEl = document.getElementById("tulis-pinyin");
  if (pinyinEl) pinyinEl.innerHTML = colorPy(card.pinyin || "");

  const artiEl = document.getElementById("tulis-arti");
  if (artiEl) artiEl.textContent = card.arti || "";

  // Reset hint button
  _hintOn = false;
  _quizActive = false;
  const hintBtn = document.getElementById("tulis-hint-btn");
  if (hintBtn) {
    hintBtn.textContent = "👀 Tampilkan Panduan";
    hintBtn.classList.remove("active");
  }

  // Next btn — disabled sampai quiz selesai
  const nextBtn = document.getElementById("tulis-btn-next");
  if (nextBtn) {
    nextBtn.disabled = true;
    nextBtn.textContent = _idx < _cards.length - 1 ? "Lanjut" : "Selesai ✓";
  }

  // Init HanziWriter
  _initWriter(card.hanzi);
}

/* ══════════════════════════════════════════════════════════════
   HANZIWRITER
══════════════════════════════════════════════════════════════ */
function _initWriter(character) {
  _destroyWriter();

  const target = document.getElementById("tulis-hanzi-target");
  if (!target) return;

  const size = _canvasSize();
  target.style.width = size + "px";
  target.style.height = size + "px";
  target.innerHTML = "";

  _writer = HanziWriter.create("tulis-hanzi-target", character, {
    width: size,
    height: size,
    padding: Math.floor(size * 0.1),
    strokeColor: "#e8e8f4",
    outlineColor: "#2a2a3e",
    drawingColor: "#e8c96d",
    drawingWidth: Math.max(4, Math.floor(size * 0.045)),
    showOutline: true,
    showCharacter: false,
    highlightOnComplete: true,
    highlightColor: "#65df4d",
    charDataLoader: (char, onLoad, onError) => {
      fetch(
        `https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/${char}.json`,
      )
        .then((r) => r.json())
        .then((data) => {
          onLoad(data);
          // Tunggu data loaded baru mulai quiz
          setTimeout(() => _startQuiz(), 100);
        })
        .catch(onError);
    },
  });
}

function _startQuiz() {
  if (!_writer) return;
  _quizActive = true;

  const card = _cards[_idx]; // ← ambil card saat ini

  _writer.quiz({
    onMistake: (_strokeData) => {},
    onCorrectStroke: (_strokeData) => {},
    onComplete: (_summaryData) => {
      _quizActive = false;
      const nextBtn = document.getElementById("tulis-btn-next");
      if (nextBtn) nextBtn.disabled = false;

      // ← TTS: ucapkan kata lengkap (bukan per-karakter)
      speakMandarin(card.hanzi);
    },
  });
}

function _destroyWriter() {
  if (_writer) {
    try {
      const target = document.getElementById("tulis-hanzi-target");
      if (target) target.innerHTML = "";
    } catch (_) {}
    _writer = null;
  }
  _quizActive = false;
}

/* ══════════════════════════════════════════════════════════════
   TOGGLE PANDUAN (Hint)
══════════════════════════════════════════════════════════════ */
export function toggleTulisHint() {
  if (!_writer) return;

  _hintOn = !_hintOn;
  const hintBtn = document.getElementById("tulis-hint-btn");

  if (_hintOn) {
    _writer.animateCharacter({
      onComplete: () => {
        _hintOn = false;
        if (hintBtn) {
          hintBtn.textContent = "👀 Tampilkan Panduan";
          hintBtn.classList.remove("active");
        }

        // animateCharacter menginterupsi quiz yang berjalan.
        // Setelah animasi selesai, restart quiz jika karakter belum selesai ditulis.
        const nextBtn = document.getElementById("tulis-btn-next");
        if (nextBtn && nextBtn.disabled) {
          _startQuiz();
        }
      },
    });
    if (hintBtn) {
      hintBtn.textContent = "⏳ Animasi berjalan...";
      hintBtn.classList.add("active");
    }
  } else {
    _writer.hideCharacter({ duration: 200 });
    if (hintBtn) {
      hintBtn.textContent = "👀 Tampilkan Panduan";
      hintBtn.classList.remove("active");
    }
  }
}

/* ══════════════════════════════════════════════════════════════
   CLEAR (Ulangi stroke karakter ini saja — tombol ⟲)
══════════════════════════════════════════════════════════════ */
export function tulisHanziClear() {
  const card = _cards[_idx];
  if (card) {
    _initWriter(card.hanzi); // _initWriter otomatis panggil _startQuiz
  }

  const nextBtn = document.getElementById("tulis-btn-next");
  if (nextBtn) nextBtn.disabled = true;

  _hintOn = false;
  const hintBtn = document.getElementById("tulis-hint-btn");
  if (hintBtn) {
    hintBtn.textContent = "👀 Tampilkan Panduan";
    hintBtn.classList.remove("active");
  }
}

/* ══════════════════════════════════════════════════════════════
   RESET (Hapus progress localStorage, mulai dari karakter pertama)
══════════════════════════════════════════════════════════════ */
export function tulisHanziReset() {
  _clearProgress();
  _idx = 0;

  // Rebuild body jika dalam done state
  const body = document.querySelector(".tulis-body");
  if (body && body.querySelector(".tulis-done-wrap")) {
    body.innerHTML = `
      <div class="tulis-info">
        <div class="tulis-hanzi-full" id="tulis-hanzi-full"></div>
        <div class="tulis-pinyin" id="tulis-pinyin"></div>
        <div class="tulis-arti" id="tulis-arti"></div>
      </div>
      <div class="tulis-canvas-wrap">
        <div id="tulis-hanzi-target"></div>
      </div>
      <div class="tulis-hint-row">
        <button class="tulis-hint-btn" id="tulis-hint-btn" onclick="window.toggleTulisHint()">
          👀 Tampilkan Panduan
        </button>
      </div>
    `;
    body.style.padding = "";
    const bottom = document.querySelector(".tulis-bottom");
    if (bottom) bottom.style.display = "";
  }

  _renderCard();
}

function _tulisUlangi() {
  startTulisHanzi(
    _cards.map((c) => c),
    _deckTitle,
    _sourceScreen,
  );
}

/* ══════════════════════════════════════════════════════════════
   NEXT / SELESAI
══════════════════════════════════════════════════════════════ */
export function tulisHanziNext() {
  const nextBtn = document.getElementById("tulis-btn-next");
  if (nextBtn?.disabled) return;

  if (_idx < _cards.length - 1) {
    _saveProgress(); // simpan progress sebelum maju
    _idx++;
    _renderCard();
  } else {
    _clearProgress(); // selesai semua, hapus progress
    _showDone();
  }
}

/* ══════════════════════════════════════════════════════════════
   DONE SCREEN
══════════════════════════════════════════════════════════════ */
async function _showDone() {
  _destroyWriter();

  // Progress bar penuh
  const fill = document.getElementById("tulis-prog-fill");
  if (fill) fill.style.width = "100%";

  // Sembunyikan bottom bar
  const bottom = document.querySelector(".tulis-bottom");
  if (bottom) bottom.style.display = "none";

  // Pakai done-screen
  const body = document.querySelector(".tulis-body");
  if (body) {
    body.style.padding = "0";
    body.innerHTML = `<div id="tulis-done-container" style="width:100%;flex:1;display:flex;flex-direction:column;"></div>`;
  }

  showDoneScreen("tulis-done-container", {
    correct: _cards.length,
    wrong: 0,
    total: _cards.length,
    xp: XP.TULIS_SELESAI,
    btnMainLabel: "Ulangi",
    btnMainFn: "window._tulisUlangi",
    btnSecLabel: "Kembali",
    btnSecFn: "window.closeTulisHanzi",
  });

  await _saveScore();
}

async function _saveScore() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const key = _deckTitle.replace(/\s+/g, "_").slice(0, 60) || "tulis_hanzi";

  try {
    const { error } = await supa.from("user_scores").upsert(
      {
        user_id: currentUser.id,
        type: "tulis_session",
        key,
        score: 100,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,type,key" },
    );

    if (error) {
      console.warn("[TulisHanzi] Gagal simpan score:", error.message);
      return;
    }

    showXPToast(XP.TULIS_SELESAI);
    if (typeof window.invalidateStatsCache === "function")
      window.invalidateStatsCache();
  } catch (err) {
    console.warn("[TulisHanzi] Error save score:", err);
  }
}

/* ══════════════════════════════════════════════════════════════
   EXPOSE KE WINDOW
══════════════════════════════════════════════════════════════ */
window.startTulisHanzi = startTulisHanzi;
window.closeTulisHanzi = closeTulisHanzi;
window.toggleTulisHint = toggleTulisHint;
window.tulisHanziClear = tulisHanziClear;
window.tulisHanziReset = tulisHanziReset;
window.tulisHanziNext = tulisHanziNext;
window._tulisUlangi = _tulisUlangi;
