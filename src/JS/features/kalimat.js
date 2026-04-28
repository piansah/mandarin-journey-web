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

/* ── Section definitions ── */
const KAL_SECTIONS = [
  {
    type: 'A',
    badge: "1",
    title: "Hanzi → Pilih Arti",
  },
  {
    type: 'B',
    badge: "2",
    title: "Pinyin → Pilih Arti",
  },
  {
    type: 'C',
    badge: "3",
    title: "Hanzi → Pilih Pinyin",
  },
  {
    type: 'D',
    badge: "4",
    title: "Lengkapi Kalimat Hanzi",
  },
];

/* ── Render helpers ── */
function renderKalQText(q) {
  switch (q.type) {
    case 'A':
      return `<div class="qtext q-hanzi">${q.q}</div>`;
    case 'B':
      return `<div class="qtext q-pinyin">${colorPy(q.q)}</div>`;
    case 'C':
      return `<div class="qtext q-hanzi">${q.q}</div>`;
    case 'D':
      return `<div class="qtext q-rumpang">${renderKalRumpang(q.q)}</div>`;
    default:
      return `<div class="qtext">${q.q}</div>`;
  }
}

function renderKalOptLabel(type, o) {
  return type === 'C' ? colorPy(o) : o;
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

/* ── Load Kalimat from Supabase ── */
export async function loadKalimatFromDB(key) {
  if (_kalCache[key]) return _kalCache[key];

  const [metaRes, questRes] = await Promise.all([
    supa.from("kalimat_sets").select("title, sub").eq("key", key).single(),
    supa
      .from("kalimat_questions")
      .select(
        "section, sort_order, question, question_type, options, answer_index",
      )
      .eq("kal_key", key)
      .order("section")
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
    type: sec.type,
    items: [],
  }));
  
  const typeMap = {};
  sections.forEach((sec, idx) => {
    typeMap[sec.type] = idx;
  });

  for (const row of questRes.data) {
    const idx = typeMap[row.section];
    if (idx === undefined) continue;
    const q =
      row.question_type === "hanzi"
        ? `<span class="hz">${row.question}</span>`
        : row.question;
    sections[idx].items.push({
      q,
      opts: row.options,
      ans: row.answer_index,
    });
  }

  const result = { title: metaRes.data.title, sub: metaRes.data.sub, sections };
  _kalCache[key] = result;
  return result;
}

/* ── Start Kalimat ── */
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
  const savedState = saved[key];
  const isValidSave = savedState && savedState.kalQ && savedState.kalQ.length === 60;

  if (isValidSave) {
    kalQ = savedState.kalQ;
    kalAnswered = savedState.kalAnswered || {};
    kalCorrect = Object.values(kalAnswered).filter((v) => v === true).length;
    kalAnsweredN = Object.keys(kalAnswered).length;
    renderKalimat("all");
    updateKalLive();
    if (savedState.submitted) submitKalimat(true);
  } else {
    buildKalimat();
    renderKalimat("all");
    updateKalLive();
  }
}

/* ── Build Kalimat ── */
export function buildKalimat() {
  kalQ = [];
  let gi = 0;
  currentKalData.sections.forEach((sec) => {
    shuffle(sec.items).forEach((q) => {
      const idx = [0, 1, 2, 3].slice(0, q.opts.length);
      const si2 = shuffle(idx);
      kalQ.push({
        type: sec.type,
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

/* ── Filter Kalimat Tab ── */
export function filterKalTab(tab, doScroll) {
  activeKalTab = tab;
  const tabIds = ["all", "A", "B", "C", "D"];
  tabIds.forEach((t) => {
    const el = document.getElementById("ktab-" + t);
    if (el) el.classList.toggle("active", t === tab);
  });
  renderKalimat(tab);
  if (doScroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── Render Kalimat Questions ── */
export function renderKalimat(filter) {
  const main = document.getElementById("kal-main");
  if (!main) return;
  main.innerHTML = "";
  const filtered = filter === "all" ? kalQ : kalQ.filter((q) => q.type === filter);

  let lastType = "";
  filtered.forEach((q) => {
    if (q.type !== lastType) {
      lastType = q.type;
      main.innerHTML += `<div class="kal-sec-hd"><div class="kal-sec-badge">${q.badge}</div><div class="kal-sec-title">${q.title}</div></div>`;
    }

    const card = document.createElement("div");
    card.className = "qcard";
    card.id = `kc-${q.gi}`;
    if (kalAnswered[q.gi] !== undefined)
      card.classList.add(kalAnswered[q.gi] ? "ok" : "bad");

    const isAnswered = kalAnswered[q.gi] !== undefined;
    const opts = q.opts
      .map((o, i) => {
        const labs = ["A", "B", "C", "D"];
        const optLabel = renderKalOptLabel(q.type, o);
        let cls = "opt2";
        if (q.type === 'D') cls += " opt-hz";
        if (isAnswered) {
          if (i === q.ans) cls += " corr";
          else if (i === kalQ[q.gi].selectedIdx && !kalAnswered[q.gi])
            cls += " wrng";
        }
        return `<button class="${cls}" id="ko-${q.gi}-${i}" onclick="window.selectKal(${q.gi},${i},${q.ans})" ${isAnswered ? "disabled" : ""}><span class="opt2-lbl">${labs[i]}</span><span>${optLabel}</span></button>`;
      })
      .join("");

    card.innerHTML = `<div class="qtop" onclick="window.playKalTTS(${q.gi})" style="cursor:pointer"><span class="qno">${q.gi + 1}</span><div class="qbody">${renderKalQText(q)}</div></div><div class="opts2">${opts}</div><div class="fb2" id="kfb-${q.gi}"></div>`;

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

/* ── Select Kalimat Answer ── */
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

  // TTS Logic - Otomatis jika A, B, atau D
  const q = kalQ[gi];
  if (q.type !== 'C') {
    playKalTTS(gi);
  }
  updateKalLive();

  const saved = lsGetScoped("hsk_kal_state", {});
  saved[currentKalKey] = { kalQ, kalAnswered, submitted: false };
  lsSetScoped("hsk_kal_state", saved);

  // Auto-scroll
  setTimeout(() => {
    const nextCard = document.getElementById(`kc-${gi + 1}`);
    if (nextCard) {
      const rect = nextCard.getBoundingClientRect();
      const isVisible = rect.top >= 0 && rect.bottom <= window.innerHeight;
      if (!isVisible) {
        nextCard.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, 1000);
}

export function playKalTTS(gi) {
  // Hanya jika sudah dijawab
  if (kalAnswered[gi] === undefined) return;

  const q = kalQ[gi];
  if (!q) return;

  let speechText = q.q;
  speechText = speechText.replace(/<\/?[^>]+(>|$)/g, "");
  speechText = speechText.replace(/\([^)]+\)/g, "");

  if (q.type === 'D') {
    const corAns = q.opts[q.ans];
    speechText = speechText.replace(/_{2,}/g, corAns);
  }
  speakMandarin(speechText);
}

/* ── Update Live Score ── */
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

/* ── Submit Kalimat ── */
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

  const res = document.getElementById("kal-res");
  if (res) res.classList.add("show");

  if (!silent && res) res.scrollIntoView({ behavior: "smooth", block: "center" });

  if (currentKalKey && !silent) {
    if (typeof window.saveKalScore === "function")
      window.saveKalScore(currentKalKey, kalCorrect, { kalQ, kalAnswered });
    const savedSt = lsGetScoped("hsk_kal_state", {});
    if (savedSt[currentKalKey]) {
      savedSt[currentKalKey].submitted = true;
      lsSetScoped("hsk_kal_state", savedSt);
    }
  }
}

/* ── Confirm Retry ── */
export function confirmRetryKalimat() {
  const modalEl = document.getElementById("retry-confirm-modal");
  if (modalEl) modalEl.classList.add("active");
}

/* ── Retry Kalimat ── */
export function retryKalimat() {
  const resEl = document.getElementById("kal-res");
  if (resEl) resEl.classList.remove("show");

  const saved = lsGetScoped("hsk_kal_state", {});
  delete saved[currentKalKey];
  lsSetScoped("hsk_kal_state", saved);
  
  buildKalimat();
  renderKalimat(activeFilter);
  updateKalLive();
  window.scrollTo(0, 0);
}

export function closeKalimat() {
  lsRemoveScoped("hsk_active_kal");
  if (typeof window.backToLayer === "function")
    window.backToLayer("layer-kalimat");
}

let _kalSetsCache = null;

export async function renderKalList() {
  const grid = document.getElementById("kal-list-grid");
  if (!grid) return;

  await loadUnlockedTiers();
  await loadTierStartDecks("kalimat_sets");

  if (!_kalSetsCache) {
    grid.innerHTML = '<div style="text-align:center;padding:40px;color:var(--dim);"><span class="spinner"></span>Memuat...</div>';
    const { data, error } = await supa.from("kalimat_sets").select("key, title, sub, hsk_level, unlock_after").order("hsk_level").order("sort_order");
    if (!error) _kalSetsCache = data;
  }
  
  if (_kalSetsCache) {
    grid.innerHTML = _kalSetsCache.map((s, i) => {
      const { isLocked, reason } = resolveCumulativeLock({ hskLevel: s.hsk_level, deckIndex: i, unlockAfter: s.unlock_after, tableName: "kalimat_sets" });
      const statusTxt = window.kalScores?.[s.key] !== undefined ? `${window.kalScores[s.key]}/100` : "Belum";
      return `<div class="item-card${isLocked ? " locked" : ""}" onclick="${isLocked ? "" : `window.startKalimat('${s.key}')`}">
        <div class="item-card-top"><span class="day-badge">HSK ${s.hsk_level}</span><span class="status">${statusTxt}</span></div>
        <div class="item-title">${s.title}</div><div class="item-desc">${s.sub}</div>
      </div>`;
    }).join("");
  }
}

window.loadKalimatFromDB = loadKalimatFromDB;
window.startKalimat = startKalimat;
window.filterKalTab = filterKalTab;
window.renderKalimat = renderKalimat;
window.selectKal = selectKal;
window.playKalTTS = playKalTTS;
window.updateKalLive = updateKalLive;
window.submitKalimat = submitKalimat;
window.confirmRetryKalimat = confirmRetryKalimat;
window.retryKalimat = retryKalimat;
window.closeKalimat = closeKalimat;
window.renderKalList = renderKalList;
