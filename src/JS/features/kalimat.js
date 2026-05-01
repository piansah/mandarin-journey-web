/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   KALIMAT.JS — Latihan Kalimat Engine
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showScreen, backToLayer } from "../core/navigation.js";
import {
  showToast,
  showXPToast,
  lsGet,
  lsSet,
  lsGetScoped,
  lsSetScoped,
  lsRemoveScoped,
  shuffle,
  withTimeout,
} from "../utilities/helpers.js";
import { colorPy } from "../utilities/pinyin.js";
import { speakMandarin } from "../utilities/tts.js";
import { calcXPFromPct } from "../utilities/xp.js";
import {
  resolveCumulativeLock,
  lockMessage,
  loadUnlockedTiers,
  loadTierStartDecks,
} from "../utilities/tier-unlock.js";

let currentKalData = null;
let currentKalKey = null;
let kalQ = [];
let kalAnswered = {};
let kalCorrect = 0;
let kalAnsweredN = 0;
let activeFilter = "all";
let activeKalTab = "all";

const _kalCache = {};

/* == Section definitions == */
const KAL_SECTIONS = [
  {
    section_index: 1,
    badge: "1",
    title: "Hanzi → Pilih Arti",
    filter: "hz-id-arti",
  },
  {
    section_index: 2,
    badge: "2",
    title: "Pinyin → Pilih Arti",
    filter: "pinyin-id",
  },
  {
    section_index: 3,
    badge: "3",
    title: "Hanzi → Pilih Pinyin",
    filter: "hz-pinyin",
  },
  {
    section_index: 4,
    badge: "4",
    title: "Lengkapi Kalimat Hanzi",
    filter: "kalimat-hz",
  },
];

/* == Render helpers == */
function renderKalQText(q) {
  switch (q.filter) {
    case "hz-id-arti":
      return `<div class="qtext q-hanzi">${q.q}</div>`;
    case "pinyin-id":
      return `<div class="qtext q-pinyin">${colorPy(q.q)}</div>`;
    case "hz-pinyin":
      return `<div class="qtext q-hanzi">${q.q}</div>`;
    case "kalimat-hz":
      return `<div class="qtext q-rumpang">${renderKalRumpang(q.q)}</div>`;
    default:
      return `<div class="qtext">${q.q}</div>`;
  }
}

function renderKalOptLabel(filter, o) {
  return filter === "hz-pinyin" ? colorPy(o) : o;
}

function renderKalRumpang(text) {
  let out = text.replace(/_{2,}/g, "\x00BLANK\x00");
  out = out.replace(/\(([^)]+)\)/g, '<span class="lat">($1)</span>');
  out = out.replace(
    /([\u4e00-\u9fff\u3400-\u4dbf\uff01-\uff5e\u3001-\u303f\u300c-\u300f]+)/g,
    '<span class="hz">$1</span>',
  );
  out = out.replace(/\x00BLANK\x00/g, '<span class="blank"> </span>');
  return out;
}

/* == Load Kalimat from Supabase == */
export async function loadKalimatFromDB(key) {
  if (_kalCache[key]) return _kalCache[key];

  const [metaRes, questRes] = await Promise.all([
    supa.from("kalimat_sets").select("title, sub").eq("key", key).single(),
    supa
      .from("kalimat_questions")
      .select(
        "section_index, sort_order, question, question_type, options, answer_index",
      )
      .eq("kal_key", key)
      .order("section_index")
      .order("sort_order"),
  ]);

  if (metaRes.error)
    throw new Error(
      "Gagal load kalimat meta " + key + ": " + metaRes.error.message,
    );
  if (questRes.error)
    throw new Error(
      "Gagal load kalimat soal " + key + ": " + questRes.error.message,
    );

  const sections = KAL_SECTIONS.map((sec) => ({
    badge: sec.badge,
    title: sec.title,
    filter: sec.filter,
    count: 0,
    items: [],
    _sectionIndex: sec.section_index,
  }));
  const secIdxMap = {};
  sections.forEach((sec, arrayIdx) => {
    secIdxMap[sec._sectionIndex] = arrayIdx;
  });

  for (const row of questRes.data) {
    const arrayIdx = secIdxMap[row.section_index];
    if (arrayIdx === undefined) continue;
    const q =
      row.question_type === "hanzi"
        ? `<span class="hz">${row.question}</span>`
        : row.question;
    sections[arrayIdx].items.push({
      q,
      opts: row.options,
      ans: row.answer_index,
    });
  }

  const result = { title: metaRes.data.title, sub: metaRes.data.sub, sections };
  _kalCache[key] = result;
  return result;
}

/* == Start Kalimat == */
export async function startKalimat(key) {
  currentKalKey = key;
  if (typeof window.closeLayer === "function")
    window.closeLayer("layer-kalimat", true);
  showScreen("kalimat-screen");
  lsSetScoped("hsk_active_kal", key);

  const titleEl = document.getElementById("kal-title");
  const subEl = document.getElementById("kal-sub");
  if (titleEl) titleEl.textContent = "Memuat soal...";
  if (subEl) subEl.textContent = "";

  const resultPanel = document.getElementById("kal-res");
  const warnBox = document.getElementById("kal-warn");
  const progFill = document.getElementById("kal-prog");
  if (resultPanel) resultPanel.classList.remove("show");
  if (warnBox) {
    warnBox.classList.remove("show");
    warnBox.style.display = "none";
  }
  if (progFill) progFill.style.width = "0%";
  window.scrollTo(0, 0);

  try {
    currentKalData = await loadKalimatFromDB(key);
  } catch (err) {
    showToast("Gagal memuat latihan kalimat. Cek koneksi.", "err");
    lsRemoveScoped("hsk_active_kal");
    if (typeof window.backToDash === "function") window.backToDash();
    return;
  }

  if (titleEl) titleEl.textContent = currentKalData.title;
  if (subEl) subEl.textContent = "60 Soal · kalimat kumulatif";

  const saved = lsGetScoped("hsk_kal_state", {});
  const VALID_FILTERS = new Set([
    "hz-id-arti",
    "pinyin-id",
    "hz-pinyin",
    "kalimat-hz",
  ]);
  const savedState = saved[key];
  const isValidSave =
    savedState &&
    savedState.kalQ &&
    savedState.kalQ.length === 100 &&
    savedState.kalQ.every((q) => VALID_FILTERS.has(q.filter));

  if (isValidSave) {
    kalQ = savedState.kalQ;
    kalAnswered = savedState.kalAnswered || {};
    kalCorrect = Object.values(kalAnswered).filter((v) => v === true).length;
    kalAnsweredN = Object.keys(kalAnswered).length;
    renderKalimatTabs();
    renderKalimat("all");
    updateKalLive();
    if (savedState.submitted) submitKalimat(true);
  } else if (getCurrentUser() && window.kalMeta?.[key]?.kalQ?.length === 100) {
    const remote = window.kalMeta[key];
    kalQ = remote.kalQ;
    kalAnswered = remote.kalAnswered || {};
    kalCorrect = Object.values(kalAnswered).filter((v) => v === true).length;
    kalAnsweredN = Object.keys(kalAnswered).length;
    const ls = lsGetScoped("hsk_kal_state", {});
    ls[key] = { kalQ, kalAnswered, submitted: true };
    lsSetScoped("hsk_kal_state", ls);
    renderKalimatTabs();
    renderKalimat("all");
    updateKalLive();
    submitKalimat(true);
  } else {
    if (savedState) {
      delete saved[key];
      lsSetScoped("hsk_kal_state", saved);
    }
    buildKalimat();
    renderKalimatTabs();
    renderKalimat("all");
    updateKalLive();
  }
}

/* == Build Kalimat == */
export function buildKalimat() {
  kalQ = [];
  let gi = 0;
  currentKalData.sections.forEach((sec, si) => {
    shuffle(sec.items).forEach((q) => {
      const idx = [0, 1, 2, 3].slice(0, q.opts.length);
      const si2 = shuffle(idx);
      kalQ.push({
        si,
        filter: sec.filter,
        badge: sec.badge,
        title: sec.title,
        q: q.q,
        opts: si2.map((i) => q.opts[i]),
        ans: si2.indexOf(q.ans),
        gi: gi++,
      });
    });
  });
  kalAnswered = {};
  kalCorrect = 0;
  kalAnsweredN = 0;
}

/* == Render Kalimat Tabs == */
export function renderKalimatTabs() {
  const tabs = document.getElementById("kal-tabs");
  if (tabs) tabs.style.display = "none";
  activeKalTab = "all";
  ["all", 0, 1, 2, 3].forEach((t) => {
    const el = document.getElementById("ktab-" + t);
    if (el) el.classList.toggle("active", t === "all");
  });
}

export function filterKalTab(tab, doScroll) {
  activeKalTab = tab;
  ["all", 0, 1, 2, 3].forEach((t) => {
    const el = document.getElementById("ktab-" + t);
    if (el) el.classList.toggle("active", t === tab);
  });
  const filterMap = {
    0: "hz-id-arti",
    1: "pinyin-id",
    2: "hz-pinyin",
    3: "kalimat-hz",
  };
  const f = tab === "all" ? "all" : (filterMap[tab] ?? "all");
  activeFilter = f;
  renderKalimat(f);
  if (doScroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

export function setFilter(f, el) {
  activeFilter = f;
  document
    .querySelectorAll("#kal-tabs .tab")
    .forEach((t) => t.classList.remove("active"));
  if (el) el.classList.add("active");
  renderKalimat(f);
}

/* == Render Kalimat Questions == */
export function renderKalimat(filter) {
  const main = document.getElementById("kal-main");
  if (!main) return;
  main.innerHTML = "";
  const filtered =
    filter === "all" ? kalQ : kalQ.filter((q) => q.filter === filter);

  const secRanges = {};
  filtered.forEach((q, li) => {
    if (!secRanges[q.si]) secRanges[q.si] = { start: li + 1, end: li + 1 };
    else secRanges[q.si].end = li + 1;
  });

  let lastSi = -1;

  filtered.forEach((q, li) => {
    if (q.si !== lastSi) {
      lastSi = q.si;
      const sec = currentKalData.sections[q.si];
      const range = secRanges[q.si];
      const rangeTxt =
        range.start === range.end
          ? `${range.start}`
          : `${range.start}–${range.end}`;
      main.innerHTML += `<div class="kal-sec-hd"><div class="kal-sec-badge">${sec.badge}</div><div class="kal-sec-title">${sec.title}</div><div class="kal-sec-cnt">${rangeTxt}</div></div>`;
    }

    const card = document.createElement("div");
    card.className = "qcard";
    card.id = `kc-${q.gi}`;
    card.style.cursor = "pointer";
    card.onclick = () => window.playKalTTS(q.gi);
    if (kalAnswered[q.gi] !== undefined)
      card.classList.add(kalAnswered[q.gi] ? "ok" : "bad");

    const isAnswered = kalAnswered[q.gi] !== undefined;
    const opts = q.opts
      .map((o, i) => {
        const labs = ["A", "B", "C", "D"];
        const optLabel = (() => {
          if (q.filter === "kalimat-hz") {
            const rawQ = q.q.replace(/<[^>]+>/g, "");
            const blanks = (rawQ.match(/_{2,}/g) || []).length;
            if (blanks >= 2) return o.split(" ").join("，");
            return o;
          }
          return q.si === 2 ? colorPy(o) : o;
        })();
        let cls = "opt2";
        if (q.filter === "kalimat-hz") cls += " opt-hz";
        if (isAnswered) {
          if (i === q.ans) cls += " corr";
          else if (i === kalQ[q.gi].selectedIdx && !kalAnswered[q.gi])
            cls += " wrng";
        }
        return `<button class="${cls}" id="ko-${q.gi}-${i}" onclick="event.stopPropagation(); window.selectKal(${q.gi},${i},${q.ans})" ${isAnswered ? "disabled" : ""}><span class="opt2-lbl">${labs[i]}</span><span>${optLabel}</span></button>`;
      })
      .join("");

    card.innerHTML = `<div class="qtop"><span class="qno">${q.gi + 1}</span><div class="qbody">${renderKalQText(q)}</div></div><div class="opts2">${opts}</div><div class="fb2" id="kfb-${q.gi}"></div>`;

    if (isAnswered) {
      const fb = card.querySelector(`#kfb-${q.gi}`);
      if (fb) {
        fb.className = "fb2 " + (kalAnswered[q.gi] ? "corr" : "wrng");
        fb.textContent = kalAnswered[q.gi]
          ? "✓ Benar!"
          : `✗ Salah. Jawaban: ${["A", "B", "C", "D"][q.ans]}`;
      }
    }

    main.appendChild(card);
  });
}

/* == Select Kalimat Answer == */
export function selectKal(gi, sel, cor) {
  if (kalAnswered[gi] !== undefined) return;
  kalAnswered[gi] = sel === cor;
  kalQ[gi].selectedIdx = sel;
  if (kalAnswered[gi]) kalCorrect++;
  kalAnsweredN++;

  for (let i = 0; i < kalQ[gi].opts.length; i++) {
    const b = document.getElementById(`ko-${gi}-${i}`);
    if (b) b.disabled = true;
  }
  const sb = document.getElementById(`ko-${gi}-${sel}`);
  if (sb) sb.classList.add(kalAnswered[gi] ? "corr" : "wrng");
  if (!kalAnswered[gi]) {
    const cb = document.getElementById(`ko-${gi}-${cor}`);
    if (cb) cb.classList.add("corr");
  }
  const card = document.getElementById(`kc-${gi}`);
  if (card) card.classList.add(kalAnswered[gi] ? "ok" : "bad");
  const fb = document.getElementById(`kfb-${gi}`);
  if (fb) {
    fb.className = "fb2 " + (kalAnswered[gi] ? "corr" : "wrng");
    fb.textContent = kalAnswered[gi]
      ? "✓ Benar!"
      : `✗ Salah. Jawaban: ${["A", "B", "C", "D"][cor]}`;
  }

  // TTS Logic
  const q = kalQ[gi];
  if (q.si !== 1) {
    playKalTTS(gi);
  }
  updateKalLive();

  const saved = lsGetScoped("hsk_kal_state", {});
  saved[currentKalKey] = { kalQ, kalAnswered, submitted: false };
  lsSetScoped("hsk_kal_state", saved);
}

export function playKalTTS(gi) {
  // Hanya bunyi jika soal sudah terjawab
  if (kalAnswered[gi] === undefined) return;

  const q = kalQ[gi];
  if (!q) return;

  // Jangan bunyikan TTS untuk tipe Pinyin -> Arti (1)
  if (q.si === 1) return;

  let speechText = q.q;
  speechText = speechText.replace(/<\/?[^>]+(>|$)/g, ""); // Strip HTML
  speechText = speechText.replace(/\([^)]+\)/g, ""); // Remove translations in ()

  if (q.filter === "kalimat-hz") {
    // Untuk soal rumpang, gunakan jawaban benar jika sudah terjawab
    const corAns = q.opts[q.ans];
    speechText = speechText.replace(/_{2,}/g, corAns);
  }

  speakMandarin(speechText);
}

/* == Update Live Score == */
export function updateKalLive() {
  const total = kalQ.length;
  const liveEl = document.getElementById("kal-live");
  const ansEl = document.getElementById("kal-ans");
  const stickyEl = document.getElementById("kal-sticky-txt");
  const progEl = document.getElementById("kal-prog");
  if (liveEl) liveEl.textContent = kalCorrect;
  if (ansEl) ansEl.textContent = kalAnsweredN;
  if (stickyEl) stickyEl.textContent = `${kalAnsweredN} / ${total} dijawab`;
  if (progEl)
    progEl.style.width = (total > 0 ? (kalAnsweredN / total) * 100 : 0) + "%";
}

/* == Submit Kalimat == */
export function submitKalimat(silent = false) {
  const total = kalQ.length;
  const skip = total - kalAnsweredN;
  const warn = document.getElementById("kal-warn");
  if (skip > 0) {
    if (warn) {
      warn.style.display = "block";
      warn.className = "warn show";
      warn.textContent = `⚠️ ${skip} soal belum dijawab — dihitung salah.`;
    }
  } else if (warn) {
    warn.style.display = "none";
    warn.classList.remove("show");
  }

  const pct = Math.round((kalCorrect / total) * 100);
  const rs = document.getElementById("kr-score");
  if (rs) {
    rs.textContent = `${kalCorrect} / ${total}`;
    rs.style.color = pct >= 80 ? "#4ade80" : pct >= 60 ? "#f0c040" : "#f87171";
  }

  const correctEl = document.getElementById("kr-correct");
  const wrongEl = document.getElementById("kr-wrong");
  const skipEl = document.getElementById("kr-skip");
  const pctEl = document.getElementById("kr-pct");
  if (correctEl) correctEl.textContent = kalCorrect;
  if (wrongEl) wrongEl.textContent = total - kalCorrect - skip;
  if (skipEl) skipEl.textContent = skip;
  if (pctEl) pctEl.textContent = pct + "%";

  let grade, msg;
  if (pct >= 90) {
    grade = `⭐ Luar Biasa! ${currentKalData.title} dikuasai!`;
    msg = "Penguasaan kalimat sangat baik. Siap lanjut ke level berikutnya!";
  } else if (pct >= 80) {
    grade = "✅ Bagus! Pemahaman kalimat kuat.";
    msg = "Hampir sempurna! Review kalimat yang salah lalu lanjut.";
  } else if (pct >= 70) {
    grade = "📘 Cukup Baik — Perlu Sedikit Review";
    msg = "Review Flashcard Kumulatif untuk set ini dulu, lalu coba lagi.";
  } else {
    grade = "🔄 Review Lebih Banyak Dulu";
    msg =
      "Kembali ke Quiz dan Flashcard Kumulatif, lalu coba lagi. Pasti bisa!";
  }

  const gradeEl = document.getElementById("kr-grade");
  const msgEl = document.getElementById("kr-msg");
  if (gradeEl) gradeEl.textContent = grade;
  if (msgEl) msgEl.textContent = msg;

  const res = document.getElementById("kal-res");
  if (res) {
    res.classList.add("show");
    const progEl = document.getElementById("kal-prog");
    if (progEl) progEl.style.width = "100%";
  }

  if (!silent && res)
    res.scrollIntoView({ behavior: "smooth", block: "center" });

  if (currentKalKey && !silent) {
    if (typeof window.saveKalScore === "function")
      window.saveKalScore(currentKalKey, kalCorrect, { kalQ, kalAnswered });
    const savedSt = lsGetScoped("hsk_kal_state", {});
    if (savedSt[currentKalKey]) {
      savedSt[currentKalKey].submitted = true;
      lsSetScoped("hsk_kal_state", savedSt);
    }
    if (!getCurrentUser()) {
      const xp = calcXPFromPct(pct);
      showXPToast(xp, "Kalimat selesai");
    }
    if (!getCurrentUser() && typeof window.invalidateStatsCache === "function")
      window.invalidateStatsCache();
  }

  const kb = document.getElementById("ks-" + currentKalKey);
  if (kb) {
    kb.textContent = `${kalCorrect}/${total}`;
    kb.className = "status " + (kalCorrect >= 80 ? "done" : "new");
  }
}

/* == Confirm Retry == */
export function confirmRetryKalimat() {
  const descEl = document.getElementById("retry-confirm-desc");
  const btnEl = document.getElementById("retry-confirm-btn");
  const modalEl = document.getElementById("retry-confirm-modal");
  if (descEl)
    descEl.textContent =
      "Soal akan diacak ulang dan skor latihan ini akan direset.";
  if (btnEl) {
    btnEl.onclick = () => {
      if (typeof window.closeRetryConfirm === "function")
        window.closeRetryConfirm();
      retryKalimat();
    };
  }
  if (modalEl) modalEl.classList.add("active");
}

/* == Retry Kalimat == */
export function retryKalimat() {
  const resEl = document.getElementById("kal-res");
  const warnEl = document.getElementById("kal-warn");
  if (resEl) resEl.classList.remove("show");
  if (warnEl) {
    warnEl.style.display = "none";
    warnEl.classList.remove("show");
  }

  const saved = lsGetScoped("hsk_kal_state", {});
  delete saved[currentKalKey];
  lsSetScoped("hsk_kal_state", saved);
  if (typeof window.kalScores !== "undefined")
    delete window.kalScores[currentKalKey];
  if (typeof window.deleteScore === "function")
    window.deleteScore("kal", currentKalKey);

  const kb = document.getElementById("ks-" + currentKalKey);
  if (kb) {
    kb.textContent = "Belum";
    kb.className = "status new";
  }

  buildKalimat();
  renderKalimat(activeFilter);
  updateKalLive();
  if (currentKalKey) lsSetScoped("hsk_active_kal", currentKalKey);
  setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 50);
}

export function closeKalimat() {
  lsRemoveScoped("hsk_active_kal");
  if (typeof window.backToLayer === "function")
    window.backToLayer("layer-kalimat");
}

function _quizDoneCountByHSK(hskLevel) {
  if (!window._quizSetsCache) return 0;
  return window._quizSetsCache.filter(
    (q) => q.hsk_level === hskLevel && window.quizScores?.[q.key] !== undefined,
  ).length;
}

let _kalSetsCache = null;
let _kalListFetchPromise = null;

function _renderKalGrid() {
  const grid = document.getElementById("kal-list-grid");
  if (!grid || !_kalSetsCache) return;
  grid.innerHTML = _kalSetsCache
    .map((s, i) => {
      const hsk = `hsk${s.hsk_level}`;
      const scoreVal = window.kalScores?.[s.key];
      const quizDone = _quizDoneCountByHSK(s.hsk_level);

      // MENGGUNAKAN resolveCumulativeLock
      const { isLocked, reason } = resolveCumulativeLock({
        hskLevel: s.hsk_level,
        deckIndex: i,
        completedQuizCount: quizDone,
        unlockAfter: s.unlock_after,
        tableName: "kalimat_sets",
      });

      const lockedOnclick = `window.showToast('${lockMessage(reason, { unlockAfter: s.unlock_after })}', 'warn')`;

      const statusTxt = scoreVal !== undefined ? `${scoreVal}/100` : "Belum";
      const statusCls =
        scoreVal !== undefined ? (scoreVal >= 80 ? "done" : "new") : "new";

      return `<div class="item-card${isLocked ? " locked" : ""}" data-hsk="${hsk}" onclick="${isLocked ? lockedOnclick : `window.startKalimat('${s.key}')`}">
      <div class="item-card-top"><span class="day-badge">HSK ${s.hsk_level}</span>${!isLocked ? `<span class="status ${statusCls}" id="ks-${s.key}">${statusTxt}</span>` : ""}</div>
      <div class="item-title">${s.title}</div><div class="item-desc">${s.sub}</div>
      <div class="item-meta"><span class="item-date">60 soal · 4 tipe</span><button class="btn-open" onclick="event.stopPropagation();${isLocked ? lockedOnclick : `window.startKalimat('${s.key}')`}">${isLocked ? "🔒" : "Mulai"}</button></div>
    </div>`;
    })
    .join("");

  const activeItem = document.querySelector(
    "#hsk-filter-kalimat .hsk-dropdown-item.active",
  );
  if (activeItem && typeof window.filterHSK === "function") {
    window.filterHSK("kalimat", activeItem.dataset.level || "all", null);
  } else {
    const activePill = document.querySelector(
      "#hsk-filter-kalimat .hsk-pill.active",
    );
    if (activePill && typeof window.filterHSK === "function") {
      const txt = activePill.textContent
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "");
      window.filterHSK("kalimat", txt === "semua" ? "all" : txt, activePill);
    }
  }
}

/* == Render Kalimat List (layer) == */
export async function renderKalList() {
  const grid = document.getElementById("kal-list-grid");
  if (!grid) return;

  await withTimeout(loadUnlockedTiers(), 2500);
  await withTimeout(loadTierStartDecks("kalimat_sets"), 2500);

  if (!_kalSetsCache) {
    grid.innerHTML =
      '<div style="text-align:center;padding:40px;color:var(--dim);font-size:13px;"><span class="spinner"></span>Memuat...</div>';
    try {
      _kalListFetchPromise = supa
        .from("kalimat_sets")
        .select("key, title, sub, hsk_level, unlock_after")
        .order("hsk_level", { ascending: true })
        .order("sort_order", { ascending: true })
        .then(({ data, error }) => {
          if (error || !data) throw error ?? new Error("no data");
          _kalSetsCache = data;
        });
      await _kalListFetchPromise;
    } catch {
      grid.innerHTML =
        '<div style="text-align:center;padding:40px;color:var(--dim);">Gagal memuat — cek koneksi</div>';
      _kalListFetchPromise = null;
      return;
    } finally {
      _kalListFetchPromise = null;
    }
  }

  if (!window._quizSetsCache) {
    const { data: qData } = await supa
      .from("quiz_sets")
      .select("key, hsk_level")
      .order("hsk_level", { ascending: true })
      .order("sort_order", { ascending: true });
    if (qData) window._quizSetsCache = qData;
  }

  // Tunggu scores dulu sebelum render, supaya lock status akurat
  if (getCurrentUser()) {
    const scoresPromise = window.scoresLoaded;
    if (
      scoresPromise &&
      typeof scoresPromise.then === "function" &&
      !window._scoresHaveLoaded
    ) {
      await Promise.race([
        scoresPromise,
        new Promise((r) => setTimeout(r, 8000)),
      ]);
    }
  }

  _renderKalGrid();
}

/* == Expose ke window untuk dipanggil dari HTML == */
window.loadKalimatFromDB = loadKalimatFromDB;
window.startKalimat = startKalimat;
window.buildKalimat = buildKalimat;
window.renderKalimatTabs = renderKalimatTabs;
window.filterKalTab = filterKalTab;
window.setFilter = setFilter;
window.renderKalimat = renderKalimat;
window.selectKal = selectKal;
window.playKalTTS = playKalTTS;
window.updateKalLive = updateKalLive;
window.submitKalimat = submitKalimat;
window.confirmRetryKalimat = confirmRetryKalimat;
window.retryKalimat = retryKalimat;
window.closeKalimat = closeKalimat;
window.renderKalList = renderKalList;
