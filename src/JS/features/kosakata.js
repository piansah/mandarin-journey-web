/* ============================================================
   KOSAKATA.JS — Daftar Kata (Deck Grid, Isi Deck, Vok Forms)
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import {
  showScreen,
  backToLayer,
  _navStack,
  _pushAppHistory,
  setNavStack,
  setFabVisible,
} from "../core/navigation.js";
import {
  showToast,
  lsGet,
  lsSet,
  lsRemove,
  shuffle,
} from "../utilities/helpers.js";
import { speakMandarin, cancelTTS } from "../utilities/tts.js";
import {
  colorPy,
  _buildQueryTokens,
  _matchPinyinTokens,
  _stripTones,
} from "../utilities/pinyin.js";
import { startFC } from "./flashcard.js";
import {
  resolveVocabLock,
  isHSKUnlocked,
  lockMessage,
  loadUnlockedTiers,
  loadTierStartDecks,
} from "../utilities/tier-unlock.js";

// Kolom eksplisit flashcard_cards yang ada di DB
const FC_CARD_COLS =
  "id, set_id, hanzi, pinyin, arti, catatan, added_by, created_at, word_class";

let kosvokData = [];
let kosvokSearchTerm = "";
let kosAllData = [];
let kosFiltered = [];
let kosInitialized = false;
let kosCurrentSetId = null;
let kosCurrentDayNum = null;
let kosCurrentTitle = "";
export let kosSetsCache = null;
let _kosActiveHSK = "all";

/* ── HSK Filter for Kos Deck Grid ── */
export function filterKosHSK(level) {
  _kosActiveHSK = level;
  _applyKosDeckFilter();
}

function _applyKosDeckFilter() {
  const grid = document.getElementById("kos-deck-grid");
  if (!grid) return;
  const searchTerm = (document.getElementById("kos-global-search")?.value || "")
    .toLowerCase()
    .trim();
  if (searchTerm) return;
  grid.querySelectorAll(".item-card[data-hsk]").forEach((card) => {
    card.style.display =
      _kosActiveHSK === "all" || card.dataset.hsk === _kosActiveHSK
        ? ""
        : "none";
  });
}

/* ══════════════════════════════════════════════════════════════
   GLOBAL WORD SEARCH
══════════════════════════════════════════════════════════════ */
let _globalSearchCache = null;
let _globalSearchTimer = null;
let _initGlobalSearchCachePromise = null;

export async function initGlobalSearchCache() {
  if (_globalSearchCache) return;
  if (_initGlobalSearchCachePromise) return _initGlobalSearchCachePromise;

  _initGlobalSearchCachePromise = (async () => {
    const currentUser = getCurrentUser();
    const userId = currentUser?.id;
    let sets = [];

    const { data: defaultSets, error: e1 } = await supa
      .from("flashcard_sets")
      .select("id, badge, title, hsk_level")
      .eq("is_default", true)
      .order("id", { ascending: true });
    if (!e1 && defaultSets) sets = [...defaultSets];

    if (userId) {
      const { data: ownSets, error: e2 } = await supa
        .from("flashcard_sets")
        .select("id, badge, title, hsk_level")
        .eq("created_by", userId)
        .order("id", { ascending: true });
      if (!e2 && ownSets) {
        const existingIds = new Set(sets.map((s) => s.id));
        ownSets.forEach((s) => {
          if (!existingIds.has(s.id)) sets.push(s);
        });
      }
    }

    if (!sets.length) return;

    const setHskMap = {};
    sets.forEach((s) => {
      setHskMap[s.id] = s.hsk_level || 1;
    });
    const setIds = sets.map((s) => s.id);

    const PAGE = 1000;
    let from = 0;
    let allCards = [];

    while (true) {
      // FIX: gunakan kolom eksplisit, bukan select("*")
      const { data, error } = await supa
        .from("flashcard_cards")
        .select(FC_CARD_COLS)
        .in("set_id", setIds)
        .order("set_id", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      allCards = allCards.concat(data);
      if (data.length < PAGE) break;
      from += PAGE;
    }

    if (allCards.length) {
      _globalSearchCache = allCards.map((c) => ({
        ...c,
        hsk_level: setHskMap[c.set_id] || 1,
      }));
    }
  })();

  return _initGlobalSearchCachePromise;
}

export function warmUpGlobalSearchCache() {
  if (_globalSearchCache || _initGlobalSearchCachePromise) return;
  initGlobalSearchCache().catch(() => {
    _initGlobalSearchCachePromise = null;
  });
}

function _isIndonesianQuery(raw) {
  if (/[\u4e00-\u9fff]/.test(raw)) return false;
  if (/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i.test(raw)) return false;
  if (/[a-z]+[1-5]/i.test(raw)) return false;
  return true;
}

export async function onKosGlobalSearch() {
  const input = document.getElementById("kos-global-search");
  const clearBtn = document.getElementById("kos-global-clear");
  if (clearBtn) clearBtn.style.display = input?.value ? "" : "none";
  clearTimeout(_globalSearchTimer);
  _globalSearchTimer = setTimeout(() => _runKosGlobalSearch(), 200);
}

function _injectSearchBgCards() {
  const container = document.getElementById("search-screen");
  if (!container || container.querySelector(".pet-bg-card")) return;
  const HANZI = [
    "你",
    "好",
    "我",
    "的",
    "是",
    "不",
    "他",
    "她",
    "学",
    "习",
    "语",
    "汉",
    "字",
    "说",
    "听",
    "读",
    "写",
    "人",
    "大",
    "小",
    "中",
    "国",
    "来",
    "去",
    "有",
    "爱",
    "朋",
    "友",
    "老",
    "师",
  ];
  const screenW = window.innerWidth || 390;
  const screenH = window.innerHeight || 844;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 18; i++) {
    const size = [30, 36, 44][Math.floor(Math.random() * 3)];
    const el = document.createElement("div");
    el.className = "pet-bg-card";
    el.textContent = HANZI[Math.floor(Math.random() * HANZI.length)];
    el.style.cssText = `left:${Math.random() * (screenW - size)}px;top:${Math.random() * (screenH - size)}px;width:${size}px;height:${size}px;font-size:${(size * 0.45).toFixed(0)}px;transform:rotate(${((Math.random() - 0.5) * 48).toFixed(1)}deg);animation-duration:${(3.5 + Math.random() * 2.5).toFixed(2)}s;animation-delay:-${(Math.random() * 5).toFixed(2)}s;pointer-events:none;position:absolute;`;
    frag.appendChild(el);
  }
  container.appendChild(frag);
}

async function _runKosGlobalSearch() {
  const input = document.getElementById("kos-global-search");
  const resultsEl = document.getElementById("kos-global-results");
  const deckSection = document.getElementById("kos-deck-section");
  const hskFilter = document.getElementById("hsk-filter-kos");

  if (!input || !resultsEl) return;
  const raw = input.value.trim();

  if (!raw) {
    resultsEl.style.display = "none";
    if (deckSection) deckSection.style.display = "";
    if (hskFilter) hskFilter.style.display = "";
    return;
  }

  if (deckSection) deckSection.style.display = "none";
  if (hskFilter) hskFilter.style.display = "none";
  resultsEl.style.display = "";

  if (!_globalSearchCache) {
    resultsEl.innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--dim);font-size:13px;"><span class="spinner"></span>Memuat kosakata...</div>';
    await initGlobalSearchCache();
  }
  if (!_globalSearchCache) {
    resultsEl.innerHTML =
      '<div style="text-align:center;padding:32px;color:var(--dim);">Gagal memuat data.</div>';
    return;
  }

  const q = raw.toLowerCase();
  const queryTokens = _buildQueryTokens(raw);
  const hasTone = queryTokens.some((t) => t.toned !== null);
  const isID = _isIndonesianQuery(raw);

  const results = _globalSearchCache.filter((c) => {
    const hanzi = (c.hanzi || "").toLowerCase();
    const arti = (c.arti || "").toLowerCase();
    const py = c.pinyin || "";

    if (hanzi.includes(q)) return true;
    if (hasTone) {
      if (_matchPinyinTokens(py, queryTokens)) return true;
    } else {
      const pyLower = py.toLowerCase();
      const qStrip = _stripTones(q);
      const queryParts = qStrip.split(/\s+/).filter(Boolean);
      const syllables = _stripTones(pyLower).split(/\s+/).filter(Boolean);
      if (queryParts.length > 1) {
        const found = syllables.some((_, i) =>
          queryParts.every((qp, j) => syllables[i + j]?.startsWith(qp)),
        );
        if (found) return true;
      } else {
        if (syllables.some((s) => s.startsWith(qStrip))) return true;
        const syllablesRaw = pyLower.split(/\s+/).filter(Boolean);
        if (syllablesRaw.some((s) => s.startsWith(q))) return true;
      }
    }
    if (isID) {
      const artiWords = arti.split(/[\s\/,;\-\(\)]+/).filter(Boolean);
      const queryParts = q.split(/\s+/).filter(Boolean);
      if (queryParts.length > 1) {
        return artiWords.some((_, i) =>
          queryParts.every((qp, j) => artiWords[i + j]?.startsWith(qp)),
        );
      }
      return artiWords.some((w) => w === q);
    }
    return arti.includes(q);
  });

  if (results.length === 0) {
    resultsEl.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--dim);"><div style="font-size:32px;margin-bottom:10px;">🔍</div><div>Tidak ditemukan untuk "<strong style="color:var(--txt);">${raw}</strong>"</div></div>`;
    return;
  }

  const deckMap = {};
  if (kosSetsCache)
    kosSetsCache.forEach((s) => {
      deckMap[s.id] = s.badge || s.title;
    });

  resultsEl.innerHTML = `<div style="font-size:11px;color:var(--dim);padding:12px 20px 8px;">${results.length} kata ditemukan</div><div id="kos-global-list" style="display:flex;flex-direction:column;gap:6px;padding:0 16px 80px;"></div>`;

  const listEl = document.getElementById("kos-global-list");
  window._globalResults = results;

  const frag = document.createDocumentFragment();
  results.forEach((c, idx) => {
    const deckLabel = deckMap[c.set_id]
      ? `<span style="font-size:9px;background:rgba(232,201,109,0.12);color:var(--gold);border:1px solid rgba(232,201,109,0.25);border-radius:5px;padding:1px 6px;">${deckMap[c.set_id]}</span>`
      : "";
    const item = document.createElement("div");
    item.className = "kos-item";
    item.dataset.gidx = idx;
    item.style.cursor = "pointer";
    item.innerHTML = `<div class="kos-hz">${c.hanzi || ""}</div><div class="kos-info"><div class="kos-py">${colorPy(c.pinyin || "")}</div><div class="kos-arti">${c.arti || ""}</div></div><div class="kos-meta">${deckLabel}</div>`;

    const hanzi = c.hanzi || "";
    let pressTimer = null,
      didLongPress = false,
      startX = 0,
      startY = 0,
      didMove = false;

    item.addEventListener(
      "touchstart",
      (e) => {
        didLongPress = false;
        didMove = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        pressTimer = setTimeout(() => {
          if (didMove) return;
          didLongPress = true;
          if (hanzi) speakMandarin(hanzi, 0.7);
          item.style.opacity = "0.6";
          setTimeout(() => {
            item.style.opacity = "";
          }, 300);
        }, 500);
      },
      { passive: true },
    );
    item.addEventListener(
      "touchmove",
      (e) => {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 8 || dy > 8) {
          didMove = true;
          clearTimeout(pressTimer);
        }
      },
      { passive: true },
    );
    item.addEventListener("touchend", () => {
      clearTimeout(pressTimer);
      if (!didLongPress && !didMove) openKosWordFromGlobal(idx);
    });
    item.addEventListener("mousedown", () => {
      didLongPress = false;
      pressTimer = setTimeout(() => {
        if (didMove) return;
        didLongPress = true;
        if (hanzi) speakMandarin(hanzi, 0.7);
        item.style.opacity = "0.6";
        setTimeout(() => {
          item.style.opacity = "";
        }, 300);
      }, 500);
    });
    item.addEventListener("mouseup", () => {
      clearTimeout(pressTimer);
      if (!didLongPress) openKosWordFromGlobal(idx);
    });
    item.addEventListener("mouseleave", () => clearTimeout(pressTimer));
    item.addEventListener("contextmenu", (e) => e.preventDefault());
    frag.appendChild(item);
  });
  listEl.appendChild(frag);
}

export function openKosWordFromGlobal(idx) {
  const card = window._globalResults?.[idx];
  if (!card) return;
  const deckMap = {};
  if (kosSetsCache)
    kosSetsCache.forEach((s) => {
      deckMap[s.id] = s.badge || s.title;
    });
  const titleEl = document.getElementById("kos-deck-title");
  if (titleEl) titleEl.textContent = deckMap[card.set_id] || "";

  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById("dash")?.classList.add("active");

  openKosWord(card);
}

export function clearKosGlobalSearch() {
  const input = document.getElementById("kos-global-search");
  if (input) input.value = "";
  const clearBtn = document.getElementById("kos-global-clear");
  if (clearBtn) clearBtn.style.display = "none";
  const resultsEl = document.getElementById("kos-global-results");
  const deckSection = document.getElementById("kos-deck-section");
  if (resultsEl) resultsEl.style.display = "none";
  if (deckSection) deckSection.style.display = "";
  const filterWrap = document.getElementById("hsk-filter-kos");
  if (filterWrap) filterWrap.style.display = "";
}

/* ══════════════════════════════════════════════════════════════
   PROGRESS TRACKING
══════════════════════════════════════════════════════════════ */
let _kosDoneSet = new Set();

function _updateKosProgress(sets) {
  const valEl = document.getElementById("mc-kos-val");
  const fillEl = document.getElementById("mc-kos-fill");
  if (!valEl || !fillEl) return;

  const defaultSets = sets.filter((s) => s.is_default);
  const total = defaultSets.length;
  if (total === 0) return;

  const fcScores = window.fcScores || {};
  // FIX: key di user_scores adalah "fc1", "fc2" bukan "1", "2"
  const done = defaultSets.filter(
    (s) => fcScores[`fc${s.id}`] !== undefined,
  ).length;

  const pct = Math.round((done / total) * 100);
  valEl.textContent = `${done} / ${total}`;
  fillEl.style.width = pct + "%";
}

export async function refreshKosDashboardProgress() {
  if (window.scoresLoaded) await window.scoresLoaded;

  if (!kosSetsCache || kosSetsCache.length === 0) {
    const { data: sets, error } = await supa
      .from("flashcard_sets")
      .select(
        "id, is_default, hsk_level, title, description, badge, flashcard_cards(count)",
      )
      .eq("is_default", true)
      .order("id", { ascending: true });

    if (!error && sets) kosSetsCache = sets;
  }

  if (kosSetsCache && kosSetsCache.length > 0) {
    _updateKosProgress(kosSetsCache);
  }
}

/* ══════════════════════════════════════════════════════════════
   LEVEL 1 — DECK GRID
══════════════════════════════════════════════════════════════ */
export async function renderKosDeckGrid() {
  const grid = document.getElementById("kos-deck-grid");
  if (!grid) return;

  await loadUnlockedTiers();
  await loadTierStartDecks("flashcard_sets");

  if (kosSetsCache && kosSetsCache.length > 0) {
    buildKosDeckGrid(kosSetsCache);
    _updateKosProgress(kosSetsCache);
    return;
  }

  grid.innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--dim);font-size:13px;"><span class="spinner"></span>Memuat...</div>';
  await refreshKosDashboardProgress();
  if (kosSetsCache) buildKosDeckGrid(kosSetsCache);
}

function buildKosDeckGrid(sets) {
  const grid = document.getElementById("kos-deck-grid");
  if (!grid) return;

  const fcScores = window.fcScores || {};
  const frag = document.createDocumentFragment();
  sets.forEach((s) => {
    const desc = s.description || "";
    const title = s.title.replace("Flashcard", "Daftar Kata");
    const hskNum = s.hsk_level || 1;
    const hskLevel = `hsk${hskNum}`;
    const wordCount = s.flashcard_cards?.[0]?.count ?? 20;
    const badge = s.badge || `HSK ${hskNum}`;
    // FIX: gunakan fcScores dengan key yang benar
    const isDone = fcScores[`fc${s.id}`] !== undefined;
    const statusTxt = isDone ? `${wordCount}/${wordCount}` : "Belum";
    const statusCls = isDone ? "done" : "new";

    const card = document.createElement("div");
    card.className = "item-card";
    card.dataset.hsk = hskLevel;
    card.innerHTML = `
      <div class="item-card-top">
        <span class="day-badge">${badge}</span>
        <span class="status ${statusCls}">${statusTxt}</span>
      </div>
      <div class="item-title">${title}</div>
      <div class="item-desc">${desc}</div>
      <div class="item-meta">
        <span class="item-date">${wordCount} Kosakata ⬩ HSK 3.0</span>
        <button class="btn-open">Buka</button>
      </div>`;

    const openFn = () => openKosDeck(s.id, title, desc);
    card.addEventListener("click", openFn);
    card.querySelector(".btn-open").addEventListener("click", (e) => {
      e.stopPropagation();
      openFn();
    });
    frag.appendChild(card);
  });

  grid.innerHTML = "";
  grid.appendChild(frag);
  _applyKosDeckFilter();
}

export async function openKosDeck(setId, title, desc) {
  kosCurrentSetId = setId;
  kosCurrentDayNum = setId;
  kosCurrentTitle = title || "";
  kosInitialized = false;
  kosAllData = [];

  const titleEl = document.getElementById("kos-deck-title");
  const subEl = document.getElementById("kos-deck-sub");
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = desc;

  const search = document.getElementById("kos-search");
  if (search) search.value = "";

  if (typeof window.closeLayer === "function")
    window.closeLayer("layer-kos", true);
  if (typeof window.openLayer === "function")
    window.openLayer("layer-kos-deck");

  _updateMulaiBtn(setId);
  closeKosTooltip();

  await loadKosDeckData(setId);
}

export async function restoreKosDeckLayer() {
  if (!kosCurrentSetId) {
    await renderKosDeckGrid();
    return;
  }

  _updateMulaiBtn(kosCurrentSetId);
  closeKosTooltip();
  await loadKosDeckData(kosCurrentSetId);
}

/* ══════════════════════════════════════════════════════════════
   MULAI LATIHAN LOCK
══════════════════════════════════════════════════════════════ */
function _updateMulaiBtn(setId) {
  const btn = document.getElementById("kos-mulai-btn");
  if (!btn) return;

  const sorted = (kosSetsCache ?? []).slice().sort((a, b) => a.id - b.id);
  const idx = sorted.findIndex((s) => s.id === setId);
  if (idx === -1) return;

  const currentSet = sorted[idx];
  const fcScores = window.fcScores || {};
  // FIX: gunakan key yang benar untuk cek prevDone
  const prevDone =
    idx === 0 ? true : fcScores[`fc${sorted[idx - 1].id}`] !== undefined;

  const { isLocked, reason } = resolveVocabLock({
    hskLevel: currentSet.hsk_level,
    deckIndex: idx,
    prevDone,
    tableName: "flashcard_sets",
  });

  btn.dataset.locked = isLocked ? "1" : "";
  btn.dataset.lockReason = reason ?? "";
}

export function toggleKosTooltip() {
  const tooltip = document.getElementById("kos-latihan-tooltip");
  if (!tooltip) return;
  const isOpen = tooltip.classList.contains("visible");
  if (isOpen) {
    closeKosTooltip();
  } else {
    _openKosTooltip();
  }
}

function _openKosTooltip() {
  const tooltip = document.getElementById("kos-latihan-tooltip");
  if (!tooltip) return;

  const mulaiBtn = document.getElementById("kos-mulai-btn");
  const locked = mulaiBtn?.dataset.locked === "1";
  const reason = mulaiBtn?.dataset.lockReason || "";

  const sorted = (kosSetsCache ?? []).slice().sort((a, b) => a.id - b.id);
  const idx = sorted.findIndex((s) => s.id === kosCurrentSetId);
  const prevTitle = idx > 0 ? sorted[idx - 1].description : "";
  const toastMsg = lockMessage(reason, { prevTitle });

  const handlerMap = {
    "kos-tt-nada": () => openKosNada(),
    "kos-tt-fc": () => openKosFlashcard(),
    "kos-tt-tulis": () => openKosTulis(),
  };

  ["kos-tt-nada", "kos-tt-fc", "kos-tt-tulis"].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = false;
    if (locked) {
      btn.classList.add("locked");
      btn.onclick = (e) => {
        e.stopPropagation();
        showToast(toastMsg, "warn");
      };
    } else {
      btn.classList.remove("locked");
      btn.onclick = (e) => {
        e.stopPropagation();
        handlerMap[id]?.();
      };
    }
  });

  tooltip.classList.add("visible");
  if (mulaiBtn) mulaiBtn.textContent = "Mulai Latihan";
}

export function closeKosTooltip() {
  const tooltip = document.getElementById("kos-latihan-tooltip");
  if (!tooltip) return;
  tooltip.classList.remove("visible");

  const mulaiBtn = document.getElementById("kos-mulai-btn");
  if (mulaiBtn) mulaiBtn.textContent = "Mulai Latihan";
}

export async function loadKosDeckData(setId) {
  const listEl = document.getElementById("kos-list");
  if (!listEl) return;
  listEl.innerHTML =
    '<div class="kos-empty"><span class="spinner"></span></div>';

  // FIX: gunakan kolom eksplisit, bukan select("*")
  const { data, error } = await supa
    .from("flashcard_cards")
    .select(FC_CARD_COLS)
    .eq("set_id", setId)
    .order("id", { ascending: true });

  if (error || !data) {
    listEl.innerHTML =
      '<div class="kos-empty">Gagal memuat — cek koneksi</div>';
    return;
  }

  const currentUser = getCurrentUser();
  const personal = (currentUser ? kosvokData : []).filter(
    (c) => c.set_id === setId,
  );
  kosAllData = [...data.filter((c) => !c.added_by), ...personal];
  kosInitialized = true;
  filterKos();
}

export function closeKosDeck() {
  if (window.history.state?.hskApp) {
    history.back();
    return;
  }

  if (typeof window.closeLayer === "function")
    window.closeLayer("layer-kos-deck", true);
  if (typeof window.openLayer === "function") window.openLayer("layer-kos");
}

/* ── Search / Filter ── */
export function filterKos() {
  const raw = (document.getElementById("kos-search")?.value || "").trim();
  if (!raw) {
    kosFiltered = [...kosAllData];
    renderKosItems();
    return;
  }

  const q = raw.toLowerCase();
  const queryTokens = _buildQueryTokens(raw);
  const hasTone = queryTokens.some((t) => t.toned !== null);
  const isID = _isIndonesianQuery(raw);

  kosFiltered = kosAllData.filter((c) => {
    const hanzi = (c.hanzi || "").toLowerCase();
    const arti = (c.arti || "").toLowerCase();
    const py = c.pinyin || "";

    if (hanzi.includes(q)) return true;

    if (hasTone) {
      if (_matchPinyinTokens(py, queryTokens)) return true;
    } else {
      const pyLower = py.toLowerCase();
      const qStrip = _stripTones(q);
      const queryParts = qStrip.split(/\s+/).filter(Boolean);
      const syllables = _stripTones(pyLower).split(/\s+/).filter(Boolean);
      if (queryParts.length > 1) {
        const found = syllables.some((_, i) =>
          queryParts.every((qp, j) => syllables[i + j]?.startsWith(qp)),
        );
        if (found) return true;
      } else {
        if (syllables.some((s) => s.startsWith(qStrip))) return true;
        const syllablesRaw = pyLower.split(/\s+/).filter(Boolean);
        if (syllablesRaw.some((s) => s.startsWith(q))) return true;
      }
    }

    if (isID) {
      const artiWords = arti.split(/[\s\/,;\-\(\)]+/).filter(Boolean);
      const queryParts = q.split(/\s+/).filter(Boolean);
      if (queryParts.length > 1) {
        return artiWords.some((_, i) =>
          queryParts.every((qp, j) => artiWords[i + j]?.startsWith(qp)),
        );
      }
      return artiWords.some((w) => w === q);
    }
    return arti.includes(q);
  });
  renderKosItems();
}

export function renderKosItems() {
  const listEl = document.getElementById("kos-list");
  const countEl = document.getElementById("kos-count-label");
  if (!listEl) return;

  if (kosFiltered.length === 0) {
    if (countEl) countEl.style.display = "none";
    listEl.innerHTML =
      '<div class="kos-empty"><div style="font-size:32px;margin-bottom:8px;">🔍</div><div>Tidak ditemukan</div></div>';
    return;
  }

  if (countEl) {
    countEl.style.display = "";
    countEl.textContent = `${kosFiltered.length} kata`;
  }
  window._kosFilteredData = kosFiltered;

  const frag = document.createDocumentFragment();
  kosFiltered.forEach((c, idx) => {
    // FIX: hapus referensi contoh_hanzi/contoh_pinyin yang tidak ada di DB
    const hasContoh = false;

    const item = document.createElement("div");
    item.className = "kos-item";
    item.dataset.idx = idx;
    item.style.cursor = "pointer";

    const hzEl = document.createElement("div");
    hzEl.className = "kos-hz";
    hzEl.textContent = c.hanzi || "";

    const infoEl = document.createElement("div");
    infoEl.className = "kos-info";
    infoEl.innerHTML = `<div class="kos-py">${colorPy(c.pinyin || "")}</div><div class="kos-arti">${c.arti || ""}</div>`;

    const metaEl = document.createElement("div");
    metaEl.className = "kos-meta";
    // FIX: hapus badge contoh karena kolom tidak ada
    metaEl.innerHTML = `<span class="kos-no">#${idx + 1}</span>`;

    item.appendChild(hzEl);
    item.appendChild(infoEl);
    item.appendChild(metaEl);

    const hanzi = c.hanzi || "";
    let pressTimer = null,
      didLongPress = false,
      startX = 0,
      startY = 0,
      didMove = false,
      _handled = false;

    item.addEventListener(
      "touchstart",
      (e) => {
        didLongPress = false;
        didMove = false;
        _handled = false;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        pressTimer = setTimeout(() => {
          if (didMove) return;
          didLongPress = true;
          if (hanzi) speakMandarin(hanzi, 0.7);
          item.style.opacity = "0.6";
          setTimeout(() => {
            item.style.opacity = "";
          }, 300);
        }, 500);
      },
      { passive: true },
    );

    item.addEventListener(
      "touchmove",
      (e) => {
        const dx = Math.abs(e.touches[0].clientX - startX);
        const dy = Math.abs(e.touches[0].clientY - startY);
        if (dx > 8 || dy > 8) {
          didMove = true;
          clearTimeout(pressTimer);
        }
      },
      { passive: true },
    );

    item.addEventListener("touchend", () => {
      clearTimeout(pressTimer);
      if (!didLongPress && !didMove) {
        _handled = true;
        openKosWord(window._kosFilteredData[idx]);
      }
    });

    item.addEventListener("mousedown", () => {
      didLongPress = false;
      didMove = false;
      pressTimer = setTimeout(() => {
        if (didMove) return;
        didLongPress = true;
        if (hanzi) speakMandarin(hanzi, 0.7);
        item.style.opacity = "0.6";
        setTimeout(() => {
          item.style.opacity = "";
        }, 300);
      }, 500);
    });

    item.addEventListener("mouseup", () => {
      clearTimeout(pressTimer);
      if (_handled) {
        _handled = false;
        return;
      }
      if (!didLongPress) openKosWord(window._kosFilteredData[idx]);
    });

    item.addEventListener("mouseleave", () => clearTimeout(pressTimer));
    item.addEventListener("contextmenu", (e) => e.preventDefault());
    frag.appendChild(item);
  });

  listEl.innerHTML = "";
  listEl.appendChild(frag);
}

/* ── Latihan Actions ── */
export async function openKosFlashcard() {
  closeKosTooltip();
  if (!kosCurrentSetId) return;

  const mulaiBtn = document.getElementById("kos-mulai-btn");
  if (mulaiBtn?.dataset.locked === "1") {
    const reason = mulaiBtn.dataset.lockReason;
    const sorted = (kosSetsCache ?? []).slice().sort((a, b) => a.id - b.id);
    const idx = sorted.findIndex((s) => s.id === kosCurrentSetId);
    const prevTitle = idx > 0 ? sorted[idx - 1].description : "";
    showToast(lockMessage(reason, { prevTitle }), "err");
    return;
  }

  document
    .querySelectorAll(".layer")
    .forEach((l) => l.classList.remove("active"));
  startFC(`fc${kosCurrentSetId}`, kosCurrentSetId);
}

export function openKosNada() {
  closeKosTooltip();
  if (!kosCurrentSetId) return;

  const mulaiBtn = document.getElementById("kos-mulai-btn");
  if (mulaiBtn?.dataset.locked === "1") {
    const reason = mulaiBtn.dataset.lockReason;
    const sorted = (kosSetsCache ?? []).slice().sort((a, b) => a.id - b.id);
    const idx = sorted.findIndex((s) => s.id === kosCurrentSetId);
    const prevTitle = idx > 0 ? sorted[idx - 1].description : "";
    showToast(lockMessage(reason, { prevTitle }), "err");
    return;
  }

  if (typeof window.startNadaLatihan === "function") {
    window.startNadaLatihan(kosAllData, kosCurrentTitle);
  }
}

export function openKosTulis() {
  closeKosTooltip();
  if (!kosCurrentSetId) return;

  const mulaiBtn = document.getElementById("kos-mulai-btn");
  if (mulaiBtn?.dataset.locked === "1") {
    const reason = mulaiBtn.dataset.lockReason;
    const sorted = (kosSetsCache ?? []).slice().sort((a, b) => a.id - b.id);
    const idx = sorted.findIndex((s) => s.id === kosCurrentSetId);
    const prevTitle = idx > 0 ? sorted[idx - 1].description : "";
    showToast(lockMessage(reason, { prevTitle }), "err");
    return;
  }

  window.startTulisHanzi(kosAllData, kosCurrentTitle, "layer-kos-deck");
}

export function refreshKosPersonal() {
  if (!kosInitialized || !kosCurrentSetId) return;
  const defaults = kosAllData.filter((c) => !c.added_by);
  const currentUser = getCurrentUser();
  const personal = (currentUser ? kosvokData : []).filter(
    (c) => c.set_id === kosCurrentSetId,
  );
  kosAllData = [...defaults, ...personal];
  filterKos();
}

export function invalidateKosLockCache() {
  // dipertahankan untuk kompatibilitas pemanggil eksternal
}

/* ══════════════════════════════════════════════════════════════
   KOSAKATA PERSONAL
══════════════════════════════════════════════════════════════ */
export async function loadKosvok() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  // FIX: gunakan kolom eksplisit
  const { data, error } = await supa
    .from("flashcard_cards")
    .select(FC_CARD_COLS)
    .eq("added_by", currentUser.id)
    .order("id", { ascending: false });
  if (!error && data) {
    kosvokData = data;
    if (typeof window.updateAuthUI === "function") window.updateAuthUI();
    renderFCPersonalList();
    refreshKosPersonal();
  }
}

export function renderFCPersonalList() {
  const listEl = document.getElementById("fc-personal-list");
  const countEl = document.getElementById("fc-personal-count");
  const emptyTxt = document.getElementById("fc-personal-empty-txt");
  if (!listEl) return;

  const currentUser = getCurrentUser();
  if (!currentUser) {
    if (countEl) countEl.textContent = "0";
    if (emptyTxt) emptyTxt.textContent = "Login untuk tambah kosakata personal";
    listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--dim);font-size:12px;"><div style="font-size:28px;margin-bottom:8px;">🔒</div><div>Login untuk tambah kosakata personal</div><button class="btn-login-now" style="margin-top:12px;" onclick="window.openAuthModal()">Masuk dengan Google</button></div>`;
    return;
  }

  if (countEl) countEl.textContent = kosvokData.length;
  if (kosvokData.length === 0) {
    listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--dim);font-size:12px;"><div style="font-size:28px;margin-bottom:8px;">✨</div><div>Belum ada kosakata personal</div><div style="margin-top:6px;font-size:11px;">Klik "+ Tambah" untuk menambahkan</div></div>`;
    return;
  }

  listEl.innerHTML = kosvokData
    .map(
      (v) => `
    <div class="vok-card" style="margin-bottom:8px;">
      <div class="vok-hanzi">${v.hanzi}</div>
      <div class="vok-info">
        <div class="vok-pinyin">${colorPy(v.pinyin)}</div>
        <div class="vok-arti">${v.arti}</div>
        <div style="font-size:10px;color:var(--gold);margin-top:3px;">📌 Flashcard Set #${v.set_id}</div>
        ${v.catatan ? `<div class="vok-catatan">📝 ${v.catatan}</div>` : ""}
      </div>
    </div>`,
    )
    .join("");
}

let _kosWordCache = {};
let _currentKosWord = null;

export async function openKosWord(card) {
  _currentKosWord = card;
  const subEl = document.getElementById("kos-word-sub");
  const bodyEl = document.getElementById("kos-word-body");

  const deckDesc =
    kosSetsCache?.find((s) => s.id === card.set_id)?.description || "";
  if (subEl) subEl.textContent = deckDesc;

  if (bodyEl)
    bodyEl.innerHTML =
      '<div style="text-align:center;padding:60px 20px;color:var(--dim);font-size:13px;"><span class="spinner"></span>Memuat contoh...</div>';

  if (typeof window.openLayer === "function")
    window.openLayer("layer-kos-word");

  const _heroHz = card.hanzi || "";

  const _WORD_CLASS_LABEL = {
    noun: "Nomina · 名词 (míngcí)",
    verb: "Verba · 动词 (dòngcí)",
    adj: "Adjektiva · 形容词 (xíngróngcí)",
    adv: "Adverbia · 副词 (fùcí)",
    conj: "Konjungsi · 连词 (liáncí)",
    particle: "Partikel · 助词 (zhùcí)",
    pron: "Pronomina · 代词 (dàicí)",
    num: "Numeralia · 数词 (shùcí)",
    classifier: "Klasifikator · 量词 (liàngcí)",
    prep: "Preposisi · 介词 (jiècí)",
    interj: "Interjeksi · 叹词 (tàncí)",
    onom: "Onomatope · 拟声词 (nǐshēngcí)",
  };
  const wcLabel = _WORD_CLASS_LABEL[card.word_class] || "";

  // FIX: hapus semua referensi contoh_hanzi/contoh_pinyin/contoh_arti
  let html = `
    <div class="kwd-hero" style="position:relative;">
      <button class="kwd-speak-icon" onclick="window.speakMandarin(document.querySelector('.kwd-hz').textContent, 0.7)" title="Dengar pengucapan">🔊</button>
      <div class="kwd-hz">${_heroHz}</div>
      <div class="kwd-py">${colorPy(card.pinyin || "")}</div>
      <div class="kwd-arti">${card.arti || ""}</div>
      ${wcLabel ? `<div class="kwd-word-class">${wcLabel}</div>` : ""}
      ${card.catatan ? `<div class="kwd-catatan">📝 ${card.catatan}</div>` : ""}
    </div>`;

  if (bodyEl) {
    bodyEl.innerHTML =
      html +
      `<div id="kwd-examples-list" style="padding-top:8px;"><div style="text-align:center;padding:28px;color:var(--dim);font-size:12px;"><span class="spinner"></span></div></div>`;
  }

  await _loadKosWordExamples(card.hanzi);
}

async function _loadKosWordExamples(hanzi) {
  const listEl = document.getElementById("kwd-examples-list");
  if (!listEl) return;

  try {
    const { data: hData } = await supa
      .from("hanzi_items")
      .select("hanzi, pinyin, arti")
      .ilike("hanzi", `%${hanzi}%`)
      .limit(15);
    const { data: uData } = await supa
      .from("word_examples")
      .select("id, hanzi, pinyin, arti, added_by")
      .ilike("hanzi", `%${hanzi}%`)
      .order("id", { ascending: true });
    _renderKosWordExamples(listEl, hData || [], uData || []);
  } catch (e) {
    listEl.innerHTML = `<div style="text-align:center;padding:24px;color:var(--dim);font-size:12px;">Gagal memuat contoh.</div>`;
  }
}

function _renderKosWordExamples(listEl, hanziItems, userExamples) {
  let html = "";
  const allItems = [];

  hanziItems.forEach((h, idx) => {
    allItems.push(h.hanzi || "");
    html += `<div class="kwd-example-card" data-speak-idx="${idx}" style="cursor:pointer;">
      <div class="kwd-ex-hz">${h.hanzi}</div>
      <div class="kwd-ex-py">${colorPy(h.pinyin)}</div>
      <div class="kwd-ex-id">${h.arti}</div>
    </div>`;
  });

  const baseIdx = allItems.length;
  const currentUser = getCurrentUser();
  userExamples.forEach((u, idx) => {
    const isOwner = currentUser && u.added_by === currentUser.id;
    allItems.push(u.hanzi || "");
    const actions = isOwner
      ? `<div class="kwd-ex-actions">
        <button class="kwd-ex-btn" onclick="event.stopPropagation();window.openContohEdit(${u.id},'${(u.hanzi || "").replace(/'/g, "\\'")}','${(u.pinyin || "").replace(/'/g, "\\'")}','${(u.arti || "").replace(/'/g, "\\'")}')">✏️ Edit</button>
        <button class="kwd-ex-btn del" onclick="event.stopPropagation();window.deleteContoh(${u.id})">✕</button>
      </div>`
      : "";
    html += `<div class="kwd-example-card" data-speak-idx="${baseIdx + idx}" style="cursor:pointer;">
      ${u.hanzi ? `<div class="kwd-ex-hz">${u.hanzi}</div>` : ""}
      ${u.pinyin ? `<div class="kwd-ex-py">${colorPy(u.pinyin)}</div>` : ""}
      ${u.arti ? `<div class="kwd-ex-id">${u.arti}</div>` : ""}
      ${actions}
    </div>`;
  });

  if (!html) {
    html = `<div class="kwd-empty">Belum ada contoh kalimat.<br>Klik <strong>+ Tambah</strong> untuk menambahkan.</div>`;
  }

  listEl.innerHTML = html;
  listEl
    .querySelectorAll(".kwd-example-card[data-speak-idx]")
    .forEach((card) => {
      card.addEventListener("click", () => {
        const idx = parseInt(card.dataset.speakIdx);
        const text = allItems[idx];
        if (text) speakMandarin(text, 0.8);
      });
    });
}

export function closeKosWord() {
  const wordLayer = document.getElementById("layer-kos-word");
  if (wordLayer) wordLayer.classList.remove("active");
  setNavStack(_navStack.filter((s) => s.id !== "layer-kos-word"));
  document.body.style.overflow = document.querySelector(".layer.active")
    ? "hidden"
    : "";
  _pushAppHistory();
}

/* ── Contoh Kalimat Form ── */
let _editingContohId = null;

export function openKosContohForm() {
  _editingContohId = null;
  _renderContohForm(null);
}

export function openContohEdit(id, hanzi, pinyin, arti) {
  _editingContohId = id;
  _renderContohForm({ id, hanzi, pinyin, arti });
}

function _renderContohForm(data) {
  const contentEl = document.getElementById("contoh-form-content");
  if (!contentEl) return;

  contentEl.innerHTML = `
    <div class="modal-title">${data ? "Edit Contoh" : "Tambah Contoh Kalimat"}</div>
    <div class="modal-sub">Untuk kata: <strong style="color:var(--gold);font-family:'Noto Sans SC',sans-serif;">${_currentKosWord?.hanzi || ""}</strong></div>
    <div class="auth-msg" id="contoh-msg"></div>
    <div class="form-group">
      <label class="form-label">Kalimat Hanzi *</label>
      <input class="form-input" id="contoh-hanzi" placeholder="例: 请进，请坐！" value="${data?.hanzi || ""}" style="font-family:'Noto Sans SC',sans-serif;font-size:17px;">
    </div>
    <div class="form-group">
      <label class="form-label">Pinyin</label>
      <input class="form-input" id="contoh-pinyin" placeholder="例: Qǐng jìn, qǐng zuò!" value="${data?.pinyin || ""}">
    </div>
    <div class="form-group">
      <label class="form-label">Arti (Indonesia)</label>
      <input class="form-input" id="contoh-arti" placeholder="例: Silakan masuk, silakan duduk!" value="${data?.arti || ""}">
    </div>
    <button class="btn-primary" id="contoh-save-btn" onclick="window.saveContoh()">${data ? "Simpan Perubahan" : "+ Tambah Contoh"}</button>`;

  const modalEl = document.getElementById("contoh-form-modal");
  if (modalEl) modalEl.classList.add("active");
  setTimeout(() => document.getElementById("contoh-hanzi")?.focus(), 100);
}

export function closeContohForm() {
  const modalEl = document.getElementById("contoh-form-modal");
  if (modalEl) modalEl.classList.remove("active");
  _editingContohId = null;
}

export async function saveContoh() {
  const hanzi = document.getElementById("contoh-hanzi")?.value.trim();
  const pinyin = document.getElementById("contoh-pinyin")?.value.trim() || null;
  const arti = document.getElementById("contoh-arti")?.value.trim() || null;
  const msg = document.getElementById("contoh-msg");

  if (!hanzi) {
    if (msg) {
      msg.className = "auth-msg err";
      msg.textContent = "Kalimat Hanzi wajib diisi.";
    }
    return;
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    if (msg) {
      msg.className = "auth-msg err";
      msg.textContent = "Login dulu untuk menambah contoh.";
    }
    return;
  }

  const btn = document.getElementById("contoh-save-btn");
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Menyimpan...';
  }

  const wordHanzi = _currentKosWord?.hanzi;
  let error;

  if (_editingContohId) {
    ({ error } = await supa
      .from("word_examples")
      .update({ hanzi, pinyin, arti })
      .eq("id", _editingContohId)
      .eq("added_by", currentUser.id));
  } else {
    ({ error } = await supa.from("word_examples").insert({
      word_hanzi: wordHanzi,
      hanzi,
      pinyin,
      arti,
      added_by: currentUser.id,
    }));
  }

  if (error) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = _editingContohId
        ? "Simpan Perubahan"
        : "+ Tambah Contoh";
    }
    if (msg) {
      msg.className = "auth-msg err";
      msg.textContent = "Gagal: " + error.message;
    }
    return;
  }

  closeContohForm();
  await _loadKosWordExamples(wordHanzi);
}

export async function deleteContoh(id) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  if (!confirm("Hapus contoh kalimat ini?")) return;

  const { error } = await supa
    .from("word_examples")
    .delete()
    .eq("id", id)
    .eq("added_by", currentUser.id);
  if (error) {
    showToast("Gagal hapus. Coba lagi.", "err");
    return;
  }
  await _loadKosWordExamples(_currentKosWord?.hanzi);
}

document.addEventListener("DOMContentLoaded", () => {
  const observer = new MutationObserver(() => {
    const screen = document.getElementById("search-screen");
    if (screen?.classList.contains("active")) {
      _injectSearchBgCards();
    }
  });
  const searchScreen = document.getElementById("search-screen");
  if (searchScreen)
    observer.observe(searchScreen, { attributeFilter: ["class"] });
});

/* ── Expose ke window untuk dipanggil dari HTML ── */
window.filterKosHSK = filterKosHSK;
window.warmUpGlobalSearchCache = warmUpGlobalSearchCache;
window.onKosGlobalSearch = onKosGlobalSearch;
window.openKosWordFromGlobal = openKosWordFromGlobal;
window.clearKosGlobalSearch = clearKosGlobalSearch;
window.refreshKosDashboardProgress = refreshKosDashboardProgress;
window.renderKosDeckGrid = renderKosDeckGrid;
window.openKosDeck = openKosDeck;
window.restoreKosDeckLayer = restoreKosDeckLayer;
window.closeKosDeck = closeKosDeck;
window.filterKos = filterKos;
window.renderKosItems = renderKosItems;
window.openKosFlashcard = openKosFlashcard;
window.openKosNada = openKosNada;
window.loadKosDeckData = loadKosDeckData;
window.refreshKosPersonal = refreshKosPersonal;
window.invalidateKosLockCache = invalidateKosLockCache;
window.loadKosvok = loadKosvok;
window.renderFCPersonalList = renderFCPersonalList;
window.openKosWord = openKosWord;
window.closeKosWord = closeKosWord;
window.openKosContohForm = openKosContohForm;
window.openContohEdit = openContohEdit;
window.closeContohForm = closeContohForm;
window.saveContoh = saveContoh;
window.deleteContoh = deleteContoh;
window.initGlobalSearchCache = initGlobalSearchCache;
window.toggleKosTooltip = toggleKosTooltip;
window.closeKosTooltip = closeKosTooltip;
window.openKosTulis = openKosTulis;
window._injectSearchBgCards = _injectSearchBgCards;
