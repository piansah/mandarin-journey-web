/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   LESSON/RENDER.JS — Loading screen, Vocab intro, renderQuestion
   ============================================================ */

import { lessonState, matchTemp, setMatchTemp } from "./state.js";
import { speakMandarin } from "../utilities/tts.js";
import { SVG_MIC, SVG_MIC_REC, svgMapIcon } from "../../assets/icon.js";

// ── fungsi dari nav.js — di-import untuk dipakai di render
// (updateProgress, resetFeedback, setBtnReady, handleCek didefinisikan di nav.js)
// Karena render.js dibutuhkan nav.js juga, kita pakai lazy window call
// untuk fungsi yang ada di nav.js agar tidak circular
function _callNav(fn, ...args) {
  if (typeof window[fn] === "function") window[fn](...args);
}

// ============================================================
// LOADING SCREEN
// ============================================================
export function _lessonShowLoading(unitData) {
  const wrap = document.getElementById("lesson-question-wrap");
  if (!wrap) return;

  // Hapus listener dan animasi yang mungkin masih berjalan
  if (window.__loadingAnimFrame)
    cancelAnimationFrame(window.__loadingAnimFrame);
  if (window.__loadingDotsInterval) clearInterval(window.__loadingDotsInterval);

  document.getElementById("lesson-screen-intro")?.classList.remove("active");
  document.getElementById("lesson-screen-vocab")?.classList.remove("active");
  document.getElementById("lesson-screen-result")?.classList.remove("active");
  document.getElementById("lesson-screen-question")?.classList.add("active");

  const isUlangi = unitData._loadingMode === "ulangi";
  const accentColor = isUlangi
    ? "var(--blue, #4c8fff)"
    : "var(--gold, #e8c96d)";
  const subLabel = isUlangi
    ? "Menyiapkan ulangan..."
    : "Memulai petualangan baru...";
  const mapColor = isUlangi ? "#4c8fff" : "#e8c96d";
  const pinColor = isUlangi ? "#7b61ff" : "#f0a500";
  const mapIcon = svgMapIcon(mapColor, pinColor);

  wrap.innerHTML = `
    <style>
      @keyframes _ll_bounceIn { 0%{transform:scale(0.4);opacity:0} 60%{transform:scale(1.15);opacity:1} 80%{transform:scale(0.95)} 100%{transform:scale(1)} }
      @keyframes _ll_fadeUp   { from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
      @keyframes _ll_pulse    { 0%,100%{transform:scale(0.85);opacity:0.18} 50%{transform:scale(1.2);opacity:0.06} }
      @keyframes _ll_progFill { from{width:0%} to{width:100%} }
      @keyframes _ll_dotPop   { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.4);opacity:1} 100%{transform:scale(1);opacity:1} }
      @keyframes _ll_dotPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.3)} }

      ._ll_wrap     { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:60dvh; }
      ._ll_iconWrap { position:relative; width:88px; height:88px; margin-bottom:22px; }
      ._ll_pulse    { position:absolute; inset:-12px; border-radius:50%; background:${accentColor}; animation:_ll_pulse 1.8s ease-in-out infinite; }
      ._ll_iconBg   { width:88px; height:88px; border-radius:50%; display:flex; align-items:center; justify-content:center; animation:_ll_bounceIn 0.5s cubic-bezier(.34,1.56,.64,1) 0.1s both; }
      ._ll_title    { font-size:18px; font-weight:700; color:var(--txt,#f0f0f0); margin:0 0 6px; text-align:center; animation:_ll_fadeUp 0.45s ease 0.35s both; max-width:260px; }
      ._ll_sub      { font-size:13px; color:var(--dim,#aaa); text-align:center; margin-bottom:26px; animation:_ll_fadeUp 0.45s ease 0.5s both; }
      ._ll_progWrap { width:180px; height:8px; background:var(--sur2,#2a2a2a); border-radius:99px; overflow:hidden; margin-bottom:20px; animation:_ll_fadeUp 0.45s ease 0.6s both; }
      ._ll_progFill { height:100%; width:0%; background:${accentColor}; border-radius:99px; animation:_ll_progFill 1.6s cubic-bezier(.4,0,.2,1) 0.65s forwards; }
      ._ll_dots     { display:flex; gap:10px; align-items:center; }
      ._ll_dot      { width:10px; height:10px; border-radius:50%; background:var(--sur2,#333); opacity:0; transform:scale(0); }
      ._ll_dot._ll_dotActive { background:${accentColor}; }
    </style>
    <div class="_ll_wrap">
      <div class="_ll_iconWrap">
        <div class="_ll_pulse"></div>
        <div class="_ll_iconBg">${mapIcon}</div>
      </div>
      <div class="_ll_title">${unitData.icon ? unitData.icon + " " : ""}${unitData.title}</div>
      <div class="_ll_sub">${subLabel}</div>
      <div class="_ll_progWrap"><div class="_ll_progFill"></div></div>
      <div class="_ll_dots">
        <div class="_ll_dot" id="_llDot0"></div>
        <div class="_ll_dot" id="_llDot1"></div>
        <div class="_ll_dot" id="_llDot2"></div>
        <div class="_ll_dot" id="_llDot3"></div>
      </div>
    </div>
  `;

  // Tunggu DOM ter-render
  requestAnimationFrame(() => {
    const dotEls = [0, 1, 2, 3].map((i) =>
      document.getElementById("_llDot" + i),
    );

    let currentDot = 0;
    const animateDots = () => {
      if (!document.getElementById("_llDot0")) return;

      dotEls.forEach((dot, i) => {
        if (!dot) return;
        dot.classList.toggle("_ll_dotActive", i === currentDot);
        if (i === currentDot) {
          dot.style.animation =
            "_ll_dotPop 0.35s cubic-bezier(.34,1.56,.64,1) forwards, _ll_dotPulse 0.9s ease-in-out infinite 0.35s";
        } else {
          dot.style.animation = "none";
        }
      });

      currentDot = (currentDot + 1) % dotEls.length;
      window.__loadingDotsInterval = setTimeout(animateDots, 800);
    };

    // Mulai animasi dot
    animateDots();
  });
}

export function _lessonHideLoading(onDone) {
  if (window.__loadingDotsInterval) {
    clearTimeout(window.__loadingDotsInterval);
    window.__loadingDotsInterval = null;
  }

  const wrap = document.getElementById("lesson-question-wrap");
  if (wrap) {
    wrap.innerHTML = "";
    wrap.style.opacity = "";
    wrap.style.transition = "";
  }

  document.getElementById("lesson-screen-question")?.classList.remove("active");

  if (typeof onDone === "function") onDone();
}

// ============================================================
// SWIPE GESTURE untuk vocab screen
// ============================================================
let _vocabSwipeStartX = null;
let _vocabSwipeStartY = null;

function _vocabInstallSwipe() {
  const wrap = document.getElementById("lesson-vocab-wrap");
  if (!wrap) return;
  wrap.addEventListener("touchstart", _vocabTouchStart, { passive: true });
  wrap.addEventListener("touchend", _vocabTouchEnd, { passive: true });
}

export function _vocabRemoveSwipe() {
  const wrap = document.getElementById("lesson-vocab-wrap");
  if (!wrap) return;
  wrap.removeEventListener("touchstart", _vocabTouchStart);
  wrap.removeEventListener("touchend", _vocabTouchEnd);
}

function _vocabTouchStart(e) {
  _vocabSwipeStartX = e.changedTouches[0].clientX;
  _vocabSwipeStartY = e.changedTouches[0].clientY;
}

function _vocabTouchEnd(e) {
  if (_vocabSwipeStartX === null) return;
  const dx = e.changedTouches[0].clientX - _vocabSwipeStartX;
  const dy = e.changedTouches[0].clientY - _vocabSwipeStartY;

  if (Math.abs(dy) > Math.abs(dx)) {
    _vocabSwipeStartX = null;
    return;
  }
  if (Math.abs(dx) < 50) {
    _vocabSwipeStartX = null;
    return;
  }

  dx < 0 ? _vocabNext() : _vocabPrev();
  _vocabSwipeStartX = null;
}

// ============================================================
// VOCAB INTRO — RENDER
// ============================================================
export function renderVocabIntro() {
  const vocabWrap = document.getElementById("lesson-vocab-wrap");
  if (vocabWrap) vocabWrap.style.display = "";

  document.getElementById("lesson-screen-intro")?.classList.remove("active");
  document.getElementById("lesson-screen-question")?.classList.remove("active");
  document.getElementById("lesson-screen-result")?.classList.remove("active");
  document.getElementById("lesson-screen-vocab")?.classList.add("active");

  _vocabInstallSwipe();
  _renderVocabCard(null);
}

function _renderVocabCardAnimated(direction) {
  const wrap = document.getElementById("lesson-vocab-wrap");
  if (!wrap) {
    _renderVocabCard(null);
    return;
  }

  const card = wrap.querySelector(".vocab-card");
  if (card) {
    const outX = direction === "left" ? "-60px" : "60px";
    card.style.transition = "transform 0.18s ease, opacity 0.18s ease";
    card.style.transform = `translateX(${outX})`;
    card.style.opacity = "0";
  }

  setTimeout(() => _renderVocabCard(direction), 160);
}

function _renderVocabCard(inDirection) {
  const list = lessonState._vocabList;
  const idx = lessonState._vocabIdx;
  const w = list[idx];
  const total = list.length;
  const isLast = idx === total - 1;

  _updateVocabProgressBar(idx, total);

  const wrap = document.getElementById("lesson-vocab-wrap");
  if (!wrap) return;

  let dotsHtml = '<div class="vocab-nav-dots">';
  for (let i = 0; i < total; i++) {
    dotsHtml += `<div class="vocab-dot${i === idx ? " active" : i < idx ? " done" : ""}"></div>`;
  }
  dotsHtml += "</div>";

  let examplesHtml = "";
  if (w.examples && w.examples.length > 0) {
    examplesHtml = '<div class="vocab-section-label">Contoh kalimat</div>';
    w.examples.forEach((ex) => {
      const highlighted = ex.hanzi.replace(
        new RegExp(w.hanzi, "g"),
        `<mark class="vocab-highlight">${w.hanzi}</mark>`,
      );
      examplesHtml += `
        <div class="vocab-example-box">
          <div class="vocab-ex-hanzi">${highlighted}</div>
          <div class="vocab-ex-pinyin">${ex.pinyin || ""}</div>
          <div class="vocab-ex-meaning">${ex.meaning || ""}</div>
        </div>`;
    });
  }

  let tipHtml = "";
  if (w.tip) {
    tipHtml = `
      <div class="vocab-section-label">Tips hafalan</div>
      <div class="vocab-tip-box">
        <div class="vocab-tip-icon">💡</div>
        <div class="vocab-tip-text">${w.tip}</div>
      </div>`;
  }

  let detailHtml = "";
  const chips = [];
  if (w.type) chips.push({ label: "Jenis kata", val: w.type });
  if (w.tone) chips.push({ label: "Nada", val: w.tone });
  if (w.rad) chips.push({ label: "Radikal", val: w.rad });
  if (chips.length > 0) {
    detailHtml = '<div class="vocab-chips">';
    chips.forEach((c) => {
      detailHtml += `
        <div class="vocab-chip">
          <span class="vocab-chip-label">${c.label}</span>
          <strong class="vocab-chip-val">${c.val}</strong>
        </div>`;
    });
    detailHtml += "</div>";
  }

  const inX =
    inDirection === "left" ? "60px" : inDirection === "right" ? "-60px" : "0px";
  const inOpacity = inDirection ? "0" : "1";

  wrap.innerHTML = `
    ${dotsHtml}

    <div class="vocab-card"
      style="transform:translateX(${inX});opacity:${inOpacity};transition:none;"
      onclick="_lessonSpeak('${w.hanzi.replace(/'/g, "\\'")}')">
      <div class="vocab-hanzi">${w.hanzi}</div>
      <div class="vocab-pinyin">${w.pinyin || ""}</div>
      <div class="vocab-meaning">${w.meaning || ""}</div>
      ${detailHtml}
    </div>

    ${examplesHtml}
    ${tipHtml}
  `;

  if (inDirection) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const card = wrap.querySelector(".vocab-card");
        if (card) {
          card.style.transition =
            "transform 0.22s cubic-bezier(0.34,1.2,0.64,1), opacity 0.18s ease";
          card.style.transform = "translateX(0)";
          card.style.opacity = "1";
        }
      });
    });
  }

  const btn = document.getElementById("lessonBtnCek");
  if (btn) {
    btn.style.display = "block";
    btn.textContent = isLast ? "✓ Mulai Soal" : "Paham, lanjut";
    btn.className = "lesson-btn-cek ready";
    btn.onclick = () => _vocabNext();
  }

  const actionBar = document.querySelector(".lesson-action-bar");
  if (actionBar && !document.getElementById("lessonVocabSkipHint")) {
    const hint = document.createElement("div");
    hint.id = "lessonVocabSkipHint";
    hint.onclick = () => _vocabSkipAll();
    hint.textContent = "Lewati semua & langsung ke soal";
    actionBar.insertBefore(hint, btn);
  }

  const skipHint = document.getElementById("lessonVocabSkipHint");
  if (skipHint) skipHint.style.display = "block";

  setTimeout(() => _lessonSpeak(w.hanzi), 300);
}

function _updateVocabProgressBar(idx, total) {
  const progTop = document.querySelector(".lesson-progress-top");
  if (!progTop) return;
  progTop.innerHTML = `
    <button class="lesson-progress-close" onclick="lessonAskClose()">✕</button>
    <div class="lesson-progress-fill-top">
      <div id="lessonProgressFillTop" style="width:${((idx + 1) / total) * 100}%"></div>
    </div>`;
}

export function _vocabPrev() {
  if (lessonState._vocabIdx > 0) {
    lessonState._vocabIdx--;
    _renderVocabCardAnimated("right");
  }
}

export function _vocabNext() {
  const list = lessonState._vocabList;
  const idx = lessonState._vocabIdx;

  if (idx < list.length - 1) {
    lessonState._vocabIdx++;
    _renderVocabCardAnimated("left");
  } else {
    _vocabDone();
  }
}

function _vocabSkipAll() {
  _vocabDone();
}

function _vocabDone() {
  _vocabRemoveSwipe();
  document.getElementById("lesson-screen-vocab")?.classList.remove("active");

  const vocabWrap = document.getElementById("lesson-vocab-wrap");
  if (!vocabWrap) {
    _vocabDoneExecute();
    return;
  }

  vocabWrap.style.transition = "transform 0.22s ease, opacity 0.22s ease";
  vocabWrap.style.transform = "translateX(-40px)";
  vocabWrap.style.opacity = "0";
  vocabWrap.style.pointerEvents = "none";

  setTimeout(() => {
    vocabWrap.innerHTML = "";
    vocabWrap.style.display = "none";
    vocabWrap.style.transition = "";
    vocabWrap.style.transform = "";
    vocabWrap.style.opacity = "";
    vocabWrap.style.pointerEvents = "";
    _vocabDoneExecute();
  }, 220);
}

function _vocabDoneExecute() {
  const btn = document.getElementById("lessonBtnCek");
  if (btn) {
    btn.onclick = () => _callNav("handleCek");
    btn.textContent = "✓ PERIKSA";
    btn.className = "lesson-btn-cek";
  }

  const skipHint = document.getElementById("lessonVocabSkipHint");
  if (skipHint) skipHint.remove();

  if (lessonState.questions.length > 0) renderQuestion();
  else renderEmpty();
}

// ============================================================
// RENDER EMPTY
// ============================================================
export function renderEmpty() {
  const wrap = document.getElementById("lesson-question-wrap");
  if (wrap) {
    wrap.innerHTML = `
      <div style="text-align:center; padding:60px 20px;">
        <div style="font-size:48px;">📭</div>
        <div style="font-size:18px; margin-top:16px;">Belum ada soal</div>
      </div>`;
  }
  const btn = document.getElementById("lessonBtnCek");
  if (btn) btn.style.display = "none";
}

// ============================================================
// RENDER QUESTION
// ============================================================
export function renderQuestion() {
  document.getElementById("lesson-screen-intro")?.classList.remove("active");
  document.getElementById("lesson-screen-vocab")?.classList.remove("active");
  document.getElementById("lesson-screen-question")?.classList.add("active");
  document.getElementById("lesson-screen-result")?.classList.remove("active");

  _callNav("updateProgress");

  const q = lessonState.questions[lessonState.currentIdx];
  if (!q) return;

  const wrap = document.getElementById("lesson-question-wrap");
  if (!wrap) return;

  let html = "";

  // ========== MC ==========
  if (q.type === "mc") {
    const letters = ["A", "B", "C", "D"];
    const indexed = q.options.map((opt, i) => ({ opt, origIdx: i }));
    const shuffled = [...indexed].sort(() => Math.random() - 0.5);
    lessonState._mcShuffled = shuffled;

    if (q.mode === "meaning_to_hanzi") {
      html += `
    <div class="mc-quote-card">
      <span class="mc-quote-mark mc-quote-mark--open">"</span>
      <div class="mc-quote-text">${q.question.meaning}</div>
      <span class="mc-quote-mark mc-quote-mark--close">"</span>
    </div>
    <div class="options">`;
      shuffled.forEach(({ opt, origIdx }, i) => {
        html += `
      <div class="option" onclick="selectOption(${i})" data-idx="${i}" data-orig="${origIdx}">
        <span class="opt-letter">${letters[i]}</span>
        <div class="opt-content">
          <div class="opt-hanzi">${opt.hanzi}</div>
          <div class="opt-pinyin">${opt.pinyin || ""}</div>
        </div>
      </div>`;
      });
      html += `</div>`;
    } else {
      const qHanzi = q.question.hanzi;
      html += `
    <div class="mc-quote-card" onclick="_lessonSpeak('${qHanzi.replace(/'/g, "\\'")}')">
      <span class="mc-quote-mark mc-quote-mark--open">"</span>
      <div class="mc-quote-hanzi">${qHanzi}</div>
      <div class="mc-quote-pinyin">${q.question.pinyin}</div>
      <span class="mc-quote-mark mc-quote-mark--close">"</span>
    </div>
    <div class="options">`;
      shuffled.forEach(({ opt, origIdx }, i) => {
        const isString = typeof opt === "string";
        html += `
      <div class="option" onclick="selectOption(${i})" data-idx="${i}" data-orig="${origIdx}">
        <span class="opt-letter">${letters[i]}</span>
        <div class="opt-content">
          <div class="opt-meaning">${isString ? opt : opt.meaning}</div>
        </div>
      </div>`;
      });
      html += `</div>`;
    }
  }

  // ========== TF ==========
  else if (q.type === "tf") {
    const qHanzi = q.question.hanzi;
    html += `
    <div class="mc-quote-card" onclick="_lessonSpeak('${qHanzi.replace(/'/g, "\\'")}')">
      <span class="mc-quote-mark mc-quote-mark--open">"</span>
      <div class="mc-quote-hanzi">${qHanzi}</div>
      <div class="mc-quote-pinyin">${q.question.pinyin}</div>
      <span class="mc-quote-mark mc-quote-mark--close">"</span>
    </div>
    <div class="tf-statement-box">
      <span class="tf-statement-label">Terjemahan</span>
      <div class="tf-statement-text">"${q.statement}"</div>
    </div>
    <div class="tf-options">
      <div class="tf-opt tf-opt--true" onclick="selectTF(true)">
        <span class="tf-opt-icon">✓</span>
        <span class="tf-opt-label">Benar</span>
      </div>
      <div class="tf-opt tf-opt--false" onclick="selectTF(false)">
        <span class="tf-opt-icon">✗</span>
        <span class="tf-opt-label">Salah</span>
      </div>
    </div>`;
  }

  // ========== ARRANGE ==========
  else if (q.type === "arrange") {
    if (q.mode === "arrange_meaning") {
      const qHanzi = q.question.hanzi;
      html += `
        <div class="mc-quote-card" onclick="_lessonSpeak('${qHanzi.replace(/'/g, "\\'")}')">
        <span class="mc-quote-mark mc-quote-mark--open">"</span>
        <div class="mc-quote-hanzi">${qHanzi}</div>
        <div class="mc-quote-pinyin">${q.question.pinyin}</div>
        <div class="mc-quote-text" style="font-size:12px;color:var(--dim);margin-top:4px;font-weight:400;">Susun artinya dalam bahasa Indonesia</div>
        <span class="mc-quote-mark mc-quote-mark--close">"</span>
        </div>
        <div class="arrange-drop arrange-drop--meaning" id="arrangeDrop">
        <span class="placeholder">Ketuk kata untuk menyusun...</span>
        </div>
        <div class="word-bank" id="wordBank">`;

      const shuffled = [...q.words].sort(() => Math.random() - 0.5);
      shuffled.forEach((w) => {
        html += `
        <div class="word word--meaning" onclick="addWord(this)"
            data-hanzi="${w.hanzi}" data-pinyin="${w.pinyin}" data-meaning="${w.meaning}">
            <span class="word-meaning-label">${w.meaning}</span>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `
        <div class="mc-quote-card">
        <span class="mc-quote-mark mc-quote-mark--open">"</span>
        <div class="mc-quote-text">${q.question.target_meaning}</div>
        <span class="mc-quote-mark mc-quote-mark--close">"</span>
        </div>
        <div class="arrange-drop" id="arrangeDrop">
        <span class="placeholder">Ketuk kata untuk menyusun...</span>
        </div>
        <div class="word-bank" id="wordBank">`;

      const shuffled = [...q.words].sort(() => Math.random() - 0.5);
      shuffled.forEach((w) => {
        html += `
        <div class="word" onclick="addWord(this)"
            data-hanzi="${w.hanzi}" data-pinyin="${w.pinyin}" data-meaning="${w.meaning}">
            <span class="word-hz">${w.hanzi}</span>
            <span class="word-py">${w.pinyin}</span>
        </div>`;
      });
      html += `</div>`;
    }
  }

  // ========== MATCH ==========
  else if (q.type === "match") {
    const shuffledRight = [...q.pairs].sort(() => Math.random() - 0.5);
    html += `
    <div style="font-size:13px;color:var(--dim);margin-bottom:10px;">
        <strong style="color:var(--txt);font-weight:600;">Cocokkan</strong> hanzi dengan artinya
    </div>
    <div class="match-grid">`;

    q.pairs.forEach((p, i) => {
      const rightPair = shuffledRight[i];
      const rightOrigIdx = q.pairs.findIndex(
        (x) => x.meaning === rightPair.meaning,
      );
      html += `
        <div class="match-item hanzi-item" onclick="selectHanziWithListen(${i}, '${p.hanzi.replace(/'/g, "\\'")}' )" data-idx="${i}">
        <div>${p.hanzi}</div>
        <span class="match-pinyin">${p.pinyin}</span>
        </div>
        <div class="match-item meaning-item" onclick="selectMeaning(${rightOrigIdx})" data-idx="${rightOrigIdx}">
        <div class="match-meaning-text">${rightPair.meaning}</div>
        </div>`;
    });

    html += `</div>`;
  }

  // ========== FILL ==========
  else if (q.type === "fill") {
    let hintPinyin = q.question.full_pinyin;
    const blankWord = q.options[q.answer].hanzi;
    hintPinyin = hintPinyin.replace(blankWord, "_____");

    html += `
  <div class="mc-quote-card">
    <span class="mc-quote-mark mc-quote-mark--open">"</span>
    <div class="mc-quote-hanzi" style="line-height:1.6;margin-bottom:4px;">
      ${q.before}<span class="blank" id="blankSpan">___</span>${q.after}
    </div>
    <div class="mc-quote-pinyin">${hintPinyin}</div>
    <div class="mc-quote-text" style="font-size:12px;color:var(--dim);margin-top:4px;font-weight:400;">${q.question.full_meaning}</div>
    <span class="mc-quote-mark mc-quote-mark--close">"</span>
  </div>
  <div class="options">`;

    const letters = ["A", "B", "C", "D"];
    q.options.forEach((opt, i) => {
      html += `
    <div class="option" onclick="selectFill(${i})" data-idx="${i}">
      <span class="opt-letter">${letters[i]}</span>
      <div class="opt-content">
        <div class="opt-hanzi">${opt.hanzi}</div>
      </div>
    </div>`;
    });

    html += `</div>`;
  }

  // ========== DICTATION ==========
  else if (q.type === "dictation") {
    const letters = ["A", "B", "C", "D"];
    const indexed = q.options.map((opt, i) => ({ opt, origIdx: i }));
    const shuffled = [...indexed].sort(() => Math.random() - 0.5);
    lessonState._mcShuffled = shuffled;

    html += `
    <div class="mc-quote-card dictation-card" id="dictationCard" onclick="_dictationPlay()" style="cursor:pointer; min-height:130px;">
      <div class="dictation-wave" id="dictationWave">
        <span style="height:8px"></span><span style="height:20px"></span>
        <span style="height:30px"></span><span style="height:16px"></span>
        <span style="height:36px"></span><span style="height:24px"></span>
        <span style="height:14px"></span><span style="height:24px"></span>
        <span style="height:10px"></span><span style="height:22px"></span>
        <span style="height:32px"></span><span style="height:12px"></span>
      </div>
    </div>
    <div class="options">`;

    shuffled.forEach(({ opt, origIdx }, i) => {
      html += `
      <div class="option" onclick="selectOption(${i})" data-idx="${i}" data-orig="${origIdx}">
        <span class="opt-letter">${letters[i]}</span>
        <div class="opt-content">
          <div class="opt-hanzi">${opt.hanzi}</div>
        </div>
      </div>`;
    });

    html += `</div>`;
  }

  // ========== SPEAKING ==========
  else if (q.type === "speaking") {
    const qHanzi = q.question.hanzi;
    html += `
    <div class="mc-quote-card" onclick="_lessonSpeak('${qHanzi.replace(/'/g, "\\'")}')">
      <span class="mc-quote-mark mc-quote-mark--open">"</span>
      <div class="mc-quote-hanzi">${qHanzi}</div>
      <div class="mc-quote-pinyin">${q.question.pinyin}</div>
      <div class="speaking-meaning">${q.question.meaning}</div>
      <span class="mc-quote-mark mc-quote-mark--close">"</span>
    </div>
    <button class="speak-btn" id="lessonMicBtn" onclick="toggleLessonMic()">
      ${SVG_MIC}
      <span id="lessonMicLabel">Coba Ucapkan</span>
    </button>
    <div class="dictation-wave" id="lessonMicWave" style="justify-content:center;margin-top:12px;">
      <span></span><span></span><span></span><span></span><span></span>
      <span></span><span></span><span></span><span></span><span></span>
      <span></span><span></span>
    </div>
    <div class="lesson-spk-feedback" id="lessonSpkFb"></div>`;
  }

  wrap.innerHTML = html;

  lessonState.answered = false;
  lessonState.selectedOption = null;
  lessonState.arrangeAnswer = [];
  lessonState.matchDoneCount = 0;
  lessonState.matchAllCorrect = false;
  setMatchTemp({ type: null, idx: null });

  _callNav("resetFeedback");
  _callNav("setBtnReady", false);
  const btn = document.getElementById("lessonBtnCek");
  if (btn) {
    btn.textContent = "✓ PERIKSA";
    btn.className = "lesson-btn-cek";
    btn.style.display = "block";
    btn.onclick = () => _callNav("handleCek");
  }

  if (q.type === "speaking") {
    if (btn) btn.style.display = "none";
  }

  if (q.type === "dictation") {
    setTimeout(() => _dictationPlay(), 400);
  } else if (q.type !== "speaking") {
    const hanziToSpeak = _lessonGetCurrentHanzi();
    if (hanziToSpeak) setTimeout(() => _lessonSpeak(hanziToSpeak), 300);
  }
}

// ============================================================
// TTS HELPER
// ============================================================
export function _lessonSpeak(text) {
  if (text) speakMandarin(text, null, true);
}

function _lessonGetCurrentHanzi() {
  const q = lessonState.questions[lessonState.currentIdx];
  if (!q) return null;
  if (q.type === "mc") {
    if (q.mode === "meaning_to_hanzi") return null;
    return q.question?.hanzi || null;
  }
  if (q.type === "tf" || q.type === "speaking")
    return q.question?.hanzi || null;
  if (q.type === "arrange") return null;
  if (q.type === "fill") return q.question?.full_hanzi || null;
  if (q.type === "match") return null;
  if (q.type === "dictation") return null;
  return null;
}

// ============================================================
// DICTATION HELPER
// ============================================================
export function _dictationPlay() {
  const q = lessonState.questions[lessonState.currentIdx];
  if (!q || q.type !== "dictation") return;
  const hanzi = q.question?.hanzi;
  if (!hanzi) return;

  const card = document.getElementById("dictationCard");
  const wave = document.getElementById("dictationWave");

  if (card) card.style.borderColor = "var(--gold)";
  if (wave) wave.classList.add("dictation-wave--playing");

  _lessonSpeak(hanzi);

  setTimeout(() => {
    if (card) card.style.borderColor = "";
    if (wave) wave.classList.remove("dictation-wave--playing");
  }, 2000);
}

// ============================================================
// EXPOSE GLOBALS (dipanggil dari onclick HTML)
// ============================================================
window._lessonSpeak = _lessonSpeak;
window._dictationPlay = _dictationPlay;
window._vocabNext = _vocabNext;
window._vocabPrev = _vocabPrev;
window._vocabSkipAll = _vocabSkipAll;
window._lessonShowLoading = _lessonShowLoading;
window._lessonHideLoading = _lessonHideLoading;
