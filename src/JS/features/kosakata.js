/* ============================================================
   KOSAKATA.JS — Daftar Kata (Deck Grid, Isi Deck, Vok Forms)
   ============================================================ */

import HanziWriter from "hanzi-writer";
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
let _extractedWordsCache = null;
let _globalSearchTimer = null;
let _initGlobalSearchCachePromise = null;
let _initExtractedWordsPromise = null;

export async function initExtractedWordsCache() {
  if (_extractedWordsCache) return;
  if (_initExtractedWordsPromise) return _initExtractedWordsPromise;

  _initExtractedWordsPromise = (async () => {
    try {
      await initGlobalSearchCache();
      const { count: totalItems } = await supa
        .from("hanzi_items")
        .select("*", { count: "exact", head: true });
      const cached = lsGet("extracted_words_cache");
      if (cached && cached.version === totalItems) {
        _extractedWordsCache = cached.words;
        return;
      }
      await _generateExtractedWords(totalItems);
    } catch (e) {
      console.error("[Kosakata] Cache init error:", e);
    }
  })();

  return _initExtractedWordsPromise;
}

async function _generateExtractedWords(totalItems) {
  const allItems = await _fetchAllHanziItems();
  const hskMap = new Set((_globalSearchCache || []).map((c) => c.hanzi));
  const wordFrequency = {};
  const wordPinyin = {};

  allItems.forEach((item) => {
    const tokens = _tokenizeByPinyin(item.hanzi, item.pinyin);
    tokens.forEach((token) => {
      if (token.hanzi.length < 2) return;
      if (hskMap.has(token.hanzi)) return;
      if (!/[\u4e00-\u9fff]/.test(token.hanzi)) return;
      wordFrequency[token.hanzi] = (wordFrequency[token.hanzi] || 0) + 1;
      if (!wordPinyin[token.hanzi]) wordPinyin[token.hanzi] = token.pinyin;
    });
  });

  const words = Object.keys(wordFrequency)
    .filter((hz) => wordFrequency[hz] >= 2)
    .map((hz) => ({
      hanzi: hz,
      pinyin: wordPinyin[hz],
      frequency: wordFrequency[hz],
      badge: wordFrequency[hz] >= 5 ? "common" : "native",
    }));

  _extractedWordsCache = words;
  lsSet("extracted_words_cache", {
    version: totalItems,
    generated_at: Date.now(),
    words: words,
  });
}

async function _fetchAllHanziItems() {
  const PAGE = 1000;
  let from = 0;
  let all = [];
  while (true) {
    const { data, error } = await supa
      .from("hanzi_items")
      .select("hanzi, pinyin")
      .order("hanzi_key", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

function _tokenizeByPinyin(hanzi, pinyin) {
  if (!hanzi || !pinyin) return [];
  const pyParts = pinyin.split(/\s+/).filter(Boolean);
  const tokens = [];
  let hzIdx = 0;
  pyParts.forEach((py) => {
    const syllableCount = _countSyllables(py);
    const hzPart = hanzi.substring(hzIdx, hzIdx + syllableCount);
    if (hzPart) tokens.push({ hanzi: hzPart, pinyin: py });
    hzIdx += syllableCount;
  });
  return tokens;
}

function _countSyllables(pinyinToken) {
  const syllables = pinyinToken
    .toLowerCase()
    .match(/[a-zü]+[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ1-5]?/gi);
  return syllables ? syllables.length : 0;
}

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

  if (!_extractedWordsCache && _initExtractedWordsPromise === null) {
    initExtractedWordsCache();
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

  const hskResults = _globalSearchCache.filter((c) => {
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

  let extraResults = [];
  if (_extractedWordsCache) {
    extraResults = _extractedWordsCache.filter((w) => {
      const hanzi = w.hanzi.toLowerCase();
      const py = w.pinyin.toLowerCase();
      if (hanzi.includes(q)) return true;
      if (hasTone) {
        if (_matchPinyinTokens(py, queryTokens)) return true;
      } else {
        const qStrip = _stripTones(q);
        if (
          _stripTones(py)
            .replace(/\s+/g, "")
            .includes(qStrip.replace(/\s+/g, ""))
        )
          return true;
      }
      return false;
    });
  }

  const totalCount = hskResults.length + extraResults.length;
  if (totalCount === 0) {
    resultsEl.innerHTML = `<div style="text-align:center;padding:48px 24px;color:var(--dim);"><div style="font-size:32px;margin-bottom:10px;">🔍</div><div>Tidak ditemukan untuk "<strong style="color:var(--txt);">${raw}</strong>"</div></div>`;
    return;
  }

  const deckMap = {};
  if (kosSetsCache)
    kosSetsCache.forEach((s) => {
      deckMap[s.id] = s.badge || s.title;
    });

  resultsEl.innerHTML = `<div style="font-size:11px;color:var(--dim);padding:12px 20px 8px;">${totalCount} kata ditemukan</div><div id="kos-global-list" style="display:flex;flex-direction:column;gap:6px;padding:0 16px 80px;"></div>`;

  const listEl = document.getElementById("kos-global-list");
  const mergedResults = [
    ...hskResults.map((r) => ({ ...r, type: "hsk" })),
    ...extraResults.map((r) => ({ ...r, type: "extra" })),
  ];
  window._globalResults = mergedResults;

  const frag = document.createDocumentFragment();
  mergedResults.forEach((c, idx) => {
    let badgeHtml = "";
    if (c.type === "hsk") {
      const label = deckMap[c.set_id] || `HSK ${c.hsk_level}`;
      badgeHtml = `<span class="badge-hsk">${label}</span>`;
    } else {
      const label = c.badge === "common" ? "Common" : "Native";
      badgeHtml = `<span class="badge-${c.badge}">${label}</span>`;
    }

    const item = document.createElement("div");
    item.className = "kos-item";
    item.dataset.gidx = idx;
    item.style.cursor = "pointer";
    item.innerHTML = `<div class="kos-hz">${c.hanzi || ""}</div><div class="kos-info"><div class="kos-py">${colorPy(c.pinyin || "")}</div><div class="kos-arti">${c.arti || ""}</div></div><div class="kos-meta">${badgeHtml}</div>`;

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
        didLongPress = true;
        if (hanzi) speakMandarin(hanzi, 0.7);
      }, 500);
    });

    item.addEventListener("mouseup", () => {
      clearTimeout(pressTimer);
      if (!didLongPress) openKosWordFromGlobal(idx);
    });

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
  if (isOpen) closeKosTooltip();
  else _openKosTooltip();
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

export function invalidateKosLockCache() {}

/* ══════════════════════════════════════════════════════════════
   KOSAKATA PERSONAL
══════════════════════════════════════════════════════════════ */
export async function loadKosvok() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
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

/* ══════════════════════════════════════════════════════════════
   KOS WORD DETAIL
══════════════════════════════════════════════════════════════ */
let _kosWordCache = {};
let _currentKosWord = null;
let _activeKwdTab = "kalimat";
let _strokeWriters = [];

// ── Stroke state ──
let _strokeChars = [];
let _strokeCharIdx = 0;
let _strokeStrokeIdx = 0;
let _strokeLocked = false;
let _strokeTotalStrokes = 0;
let _strokeCharTotalStrokes = []; // Simpan jumlah stroke per karakter
// Flag: true = animasi sedang berjalan, null = idle
let _strokeAnimation = null;

export async function openKosWord(card) {
  _currentKosWord = card;
  _activeKwdTab = "kalimat";

  const titleEl = document.getElementById("kos-word-title");
  const subEl = document.getElementById("kos-word-sub");
  if (titleEl) titleEl.textContent = "Detail Kata";
  const deckDesc =
    kosSetsCache?.find((s) => s.id === card.set_id)?.description || "";
  if (subEl) subEl.textContent = deckDesc;

  if (typeof window.openLayer === "function")
    window.openLayer("layer-kos-word");

  _switchTab("kalimat", true);
  _renderHero();
  _initKwdGestures();

  await _loadKosWordExamples(card.hanzi);
}

function _renderHero() {
  const container = document.getElementById("kwd-hero-container");
  if (!container) return;

  const card = _currentKosWord;
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

  container.innerHTML = `
    <div class="kwd-hero" style="position:relative; cursor:pointer;" onclick="window.speakMandarin('${card.hanzi}', 0.7)">
      <div class="kwd-hz">${card.hanzi || ""}</div>
      <div class="kwd-py">${colorPy(card.pinyin || "")}</div>
      <div class="kwd-arti">${card.arti || ""}</div>
      ${wcLabel ? `<div class="kwd-word-class">${wcLabel}</div>` : ""}
      ${card.catatan ? `<div class="kwd-catatan">📝 ${card.catatan}</div>` : ""}
    </div>`;
}

export function _switchTab(tabName, force = false) {
  if (_activeKwdTab === tabName && !force) return;

  if (_activeKwdTab === "stroke" && tabName !== "stroke") {
    _destroyStrokeBottomBar();
  }

  _activeKwdTab = tabName;

  const tabs = document.querySelectorAll(".kwd-tab");
  const contents = document.querySelectorAll(".kwd-tab-content");
  const indicator = document.querySelector(".kwd-tab-indicator");

  tabs.forEach((t, i) => {
    const isActive = t.dataset.tab === tabName;
    t.classList.toggle("active", isActive);
    if (isActive && indicator) {
      indicator.style.transform = `translateX(${i * 100}%)`;
    }
  });

  contents.forEach((c) => {
    c.classList.toggle("active", c.id === `kwd-content-${tabName}`);
  });

  const addBtn = document.getElementById("btn-kwd-add");
  if (addBtn) addBtn.style.display = tabName === "kalimat" ? "" : "none";

  if (tabName === "stroke") _renderStrokeTab();
  if (tabName === "word") _renderWordTab();
}

/* ══════════════════════════════════════════════════════════════
   STROKE TAB — PLECO STYLE
   - Tidak auto play saat dibuka
   - Play button: jalankan animasi stroke per stroke
   - Pause/stop: hentikan sequence
   - Next/Prev: lompat stroke, hentikan sequence
══════════════════════════════════════════════════════════════ */
function _renderStrokeTab() {
  const contentEl = document.getElementById("kwd-content-stroke");
  if (!contentEl) return;

  const hanzi = _currentKosWord.hanzi || "";
  _strokeChars = [...hanzi];
  _strokeCharIdx = 0;
  _strokeStrokeIdx = 0;
  _strokeLocked = false;
  _strokeTotalStrokes = 0;
  _strokeCharTotalStrokes = new Array(_strokeChars.length).fill(0);
  _strokeAnimation = null;

  _destroyStrokeWriters();

  const charDotsHtml =
    _strokeChars.length > 1
      ? `<div class="kwd-sb-char-dots" id="kwd-sb-char-dots">
          ${_strokeChars
            .map(
              (_, i) =>
                `<div class="kwd-sb-char-dot ${i === 0 ? "active" : ""}" data-idx="${i}" onclick="window._strokeGoToChar(${i})"></div>`,
            )
            .join("")}
        </div>`
      : "";

  contentEl.innerHTML = `
    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;position:relative;">
      <div id="kwd-stroke-slider" class="kwd-stroke-slider">
        ${_strokeChars
          .map(
            (char, i) => `
          <div class="kwd-stroke-slide" data-index="${i}">
            <div id="stroke-target-${i}" class="kwd-stroke-target"></div>
          </div>
        `,
          )
          .join("")}
      </div>
      ${charDotsHtml}
    </div>
    <div class="kwd-stroke-bottom" id="kwd-stroke-bottom" style="padding: 10px 0; background: transparent; position: relative;">
      <div class="kwd-sb-controls" style="background: none; box-shadow: none; border: none; display: flex; justify-content: center; align-items: center; gap: 45px; width: 100%;">
        <button class="kwd-sb-btn" id="kwd-sb-prev-btn" onclick="window._strokePrev()" title="Stroke sebelumnya" style="background:none; border:none; box-shadow:none; padding:0; color:var(--txt); width:auto; height:auto;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <button class="kwd-sb-btn" id="kwd-sb-play-btn" onclick="window._strokePlayPause()" title="Play / Pause" style="background:none; border:none; box-shadow:none; padding:0; color:var(--gold); width:auto; height:auto;">
          <svg id="kwd-sb-play-icon" width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"/>
          </svg>
        </button>
        <button class="kwd-sb-btn" id="kwd-sb-next-btn" onclick="window._strokeNext()" title="Stroke berikutnya" style="background:none; border:none; box-shadow:none; padding:0; color:var(--txt); width:auto; height:auto;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        
        <!-- Lock button di pojok kanan -->
        <button class="kwd-sb-btn" id="kwd-sb-lock-btn" onclick="window._strokeToggleLock()" title="Lock / Unlock slide" style="position: absolute; right: 20px; background:none; border:none; box-shadow:none; padding:0; color:var(--dim); width:auto; height:auto;">
          <svg id="kwd-sb-lock-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </button>
      </div>
    </div>`;

  _strokeChars.forEach((char, i) => _initStrokeWriter(char, i));

  const slider = document.getElementById("kwd-stroke-slider");
  if (slider) {
    slider.addEventListener("scroll", () => {
      if (_strokeLocked) return;
      const slideH = slider.clientHeight;
      if (slideH === 0) return;
      const idx = Math.round(slider.scrollTop / slideH);
      const counter = document.getElementById("kwd-stroke-counter-fixed");
      if (counter) counter.textContent = `${idx + 1} / ${_strokeChars.length}`;

      if (idx !== _strokeCharIdx) {
        // Stop sequence saat ganti karakter
        _strokeAnimation = null;
        _updatePlayIcon(false);
        _strokeCharIdx = idx;
        _strokeStrokeIdx = 0;
        _strokeTotalStrokes = _strokeCharTotalStrokes[idx] || 0;
        _updateStrokeUI();
      }
      _syncCharDots(idx);
    });
  }

  setTimeout(() => {
    _updateStrokeUI();
  }, 300);
}

function _initStrokeWriter(char, index) {
  const targetId = `stroke-target-${index}`;
  const size = Math.min(window.innerWidth * 0.82, 380);

  const writer = HanziWriter.create(targetId, char, {
    width: size,
    height: size,
    padding: Math.floor(size * 0.08),
    strokeColor: "#e8e8f4",
    outlineColor: "#2a2a3e",
    drawingColor: "#e8c96d",
    showOutline: true,
    showCharacter: false,
    strokeAnimationSpeed: 0.5, // Lebih lambat lagi
    delayBetweenStrokes: 400,
    charDataLoader: (char, onLoad, onError) => {
      fetch(
        `https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/${char}.json`,
      )
        .then((r) => r.json())
        .then((data) => {
          const count = data.strokes?.length || 0;
          _strokeCharTotalStrokes[index] = count;
          if (index === _strokeCharIdx) {
            _strokeTotalStrokes = count;
            _updateStrokeUI();
          }
          onLoad(data);
        })
        .catch(onError);
    },
  });

  _strokeWriters[index] = writer;
}

// Pastikan visual writer sesuai dengan _strokeStrokeIdx (untuk navigasi mundur)
function _strokeSolidify(charIdx, targetCount) {
  const writer = _strokeWriters[charIdx];
  if (!writer) return;

  if (writer.cancelAnimation) writer.cancelAnimation();
  writer.hideCharacter({ duration: 0 });
  writer.showOutline({ duration: 0 });

  if (targetCount <= 0) return;

  // Gambar semua stroke sampai targetCount secara instan
  for (let i = 0; i < targetCount; i++) {
    writer.animateStroke(i, { strokeAnimationSpeed: 999 });
  }
}

// Play stroke satu per satu secara berurutan
function _playStrokeSequence(charIdx, fromIdx) {
  const writer = _strokeWriters[charIdx];
  if (!writer || !_strokeAnimation) {
    _updatePlayIcon(false);
    _strokeAnimation = null;
    return;
  }

  if (fromIdx >= _strokeTotalStrokes) {
    _strokeAnimation = null;
    _strokeStrokeIdx = _strokeTotalStrokes;
    _updatePlayIcon(false);
    _updateStrokeUI();
    return;
  }

  _strokeStrokeIdx = fromIdx + 1;
  _updateStrokeUI();

  writer.animateStroke(fromIdx, {
    onComplete: () => {
      if (_strokeAnimation && _strokeCharIdx === charIdx) {
        if (fromIdx + 1 >= _strokeTotalStrokes) {
          _strokeAnimation = null;
          _strokeStrokeIdx = _strokeTotalStrokes;
          _updatePlayIcon(false);
          _updateStrokeUI();
        } else {
          _playStrokeSequence(charIdx, fromIdx + 1);
        }
      }
    },
  });
}

function _strokePlayFromBeginning(charIdx) {
  const writer = _strokeWriters[charIdx];
  if (!writer) return;

  if (writer.cancelAnimation) writer.cancelAnimation();
  writer.hideCharacter({ duration: 0 });
  writer.showOutline({ duration: 0 });

  _strokeStrokeIdx = 0;
  _strokeAnimation = true;
  _updatePlayIcon(true);
  _playStrokeSequence(charIdx, 0);
}

function _strokePlayStroke(charIdx, strokeIdx) {
  const writer = _strokeWriters[charIdx];
  if (!writer) return;

  if (writer.cancelAnimation) writer.cancelAnimation();
  // Kita tidak panggil Solidify di sini agar tidak flicker/reset
  _strokeAnimation = true;
  _updatePlayIcon(true);
  _playStrokeSequence(charIdx, strokeIdx);
}

window._strokePlayPause = () => {
  const writer = _strokeWriters[_strokeCharIdx];
  if (!writer) return;

  if (_strokeAnimation) {
    _strokeAnimation = null;
    if (writer.cancelAnimation) writer.cancelAnimation();
    _updatePlayIcon(false);
  } else {
    if (_strokeStrokeIdx >= _strokeTotalStrokes) {
      _strokePlayFromBeginning(_strokeCharIdx);
    } else {
      _strokePlayStroke(_strokeCharIdx, _strokeStrokeIdx);
    }
  }
};

window._strokeNext = () => {
  _strokeAnimation = null;
  _updatePlayIcon(false);

  const writer = _strokeWriters[_strokeCharIdx];
  if (!writer) return;

  if (writer.cancelAnimation) writer.cancelAnimation();

  if (_strokeStrokeIdx >= _strokeTotalStrokes) {
    // Reset ke awal
    _strokeStrokeIdx = 0;
    writer.hideCharacter({ duration: 0 });
    writer.showOutline({ duration: 0 });
    _updateStrokeUI();
    return;
  }

  // Cukup gambar stroke berikutnya secara instan (meneruskan)
  writer.animateStroke(_strokeStrokeIdx, { strokeAnimationSpeed: 999 });
  _strokeStrokeIdx++;
  _updateStrokeUI();
};

window._strokePrev = () => {
  _strokeAnimation = null;
  _updatePlayIcon(false);

  const writer = _strokeWriters[_strokeCharIdx];
  if (!writer || _strokeStrokeIdx <= 0) return;

  // Untuk mundur, kita harus reset dan gambar ulang sampai (N-1)
  _strokeStrokeIdx--;
  _strokeSolidify(_strokeCharIdx, _strokeStrokeIdx);
  _updateStrokeUI();
};

window._strokeGoToChar = (idx) => {
  if (_strokeLocked) return;
  const slider = document.getElementById("kwd-stroke-slider");
  if (!slider) return;
  slider.scrollTo({ top: idx * slider.clientHeight, behavior: "smooth" });
};

window._strokeToggleLock = () => {
  _strokeLocked = !_strokeLocked;
  const slider = document.getElementById("kwd-stroke-slider");
  const lockBtn = document.getElementById("kwd-sb-lock-btn");
  if (slider) slider.style.overflowY = _strokeLocked ? "hidden" : "scroll";
  if (lockBtn) lockBtn.classList.toggle("active", _strokeLocked);
  const lockIcon = document.getElementById("kwd-sb-lock-icon");
  if (lockIcon) {
    lockIcon.innerHTML = _strokeLocked
      ? `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`
      : `<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>`;
  }
};

function _syncCharDots(activeIdx) {
  document.querySelectorAll(".kwd-sb-char-dot").forEach((d, i) => {
    d.classList.toggle("active", i === activeIdx);
  });
}

function _updatePlayIcon(isPlaying) {
  const icon = document.getElementById("kwd-sb-play-icon");
  if (!icon) return;
  if (isPlaying) {
    icon.innerHTML = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
  } else {
    icon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"/>`;
  }
}

function _updateStrokeUI() {
  const label = document.getElementById("kwd-sb-stroke-label");
  if (label) {
    if (_strokeTotalStrokes === 0) {
      label.textContent = "Memuat data stroke...";
    } else {
      label.textContent = `Stroke ${_strokeStrokeIdx} / ${_strokeTotalStrokes}`;
    }
  }

  // Update button states
  const prevBtn = document.getElementById("kwd-sb-prev-btn");
  if (prevBtn) {
    prevBtn.style.opacity = _strokeStrokeIdx <= 0 ? "0.3" : "1";
    prevBtn.style.pointerEvents = _strokeStrokeIdx <= 0 ? "none" : "";
  }
}

function _destroyStrokeBottomBar() {
  _strokeAnimation = null;
  _strokeWriters.forEach((w) => {
    if (w && w.cancelAnimation) w.cancelAnimation();
  });
}

function _destroyStrokeWriters() {
  _strokeAnimation = null;
  _strokeWriters.forEach((w) => {
    if (w && w.cancelAnimation) w.cancelAnimation();
  });
  _strokeWriters = [];
}

/* ── Word Tab Logic ── */
async function _renderWordTab() {
  const container = document.getElementById("kwd-native-list");
  if (!container) return;

  const hanzi = _currentKosWord.hanzi;

  container.innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--dim);"><span class="spinner"></span></div>';

  const { data, error } = await supa
    .from("word_compounds")
    .select("hanzi, pinyin, arti, badge")
    .ilike("hanzi", `%${hanzi}%`)
    .order("frequency", { ascending: false });

  if (error || !data || data.length === 0) {
    container.innerHTML =
      '<div style="text-align:center;padding:48px 20px;color:var(--dim);">Tidak ada kata gabungan ditemukan.</div>';
    return;
  }

  const frag = document.createDocumentFragment();

  data.forEach((w, idx) => {
    const item = document.createElement("div");
    item.className = "kos-item";
    item.style.cursor = "pointer";

    item.innerHTML = `
      <div class="kos-hz">${w.hanzi}</div>
      <div class="kos-info">
        <div class="kos-py">${colorPy(w.pinyin)}</div>
        <div class="kos-arti">${w.arti || ""}</div>
      </div>
      <div class="kos-meta">
        <span class="kos-no">#${idx + 1}</span>
      </div>`;

    let pressTimer = null,
      didLongPress = false,
      didMove = false,
      startX = 0,
      startY = 0,
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
          speakMandarin(w.hanzi, 0.7);
          item.style.opacity = "0.6";
          setTimeout(() => (item.style.opacity = ""), 300);
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
        speakMandarin(w.hanzi, 0.7);
        item.style.opacity = "0.6";
        setTimeout(() => (item.style.opacity = ""), 300);
      }
    });

    item.addEventListener("mousedown", () => {
      didLongPress = false;
      didMove = false;
      pressTimer = setTimeout(() => {
        if (didMove) return;
        didLongPress = true;
        speakMandarin(w.hanzi, 0.7);
        item.style.opacity = "0.6";
        setTimeout(() => (item.style.opacity = ""), 300);
      }, 500);
    });

    item.addEventListener("mouseup", () => {
      clearTimeout(pressTimer);
      if (_handled) {
        _handled = false;
        return;
      }
      if (!didLongPress) {
        speakMandarin(w.hanzi, 0.7);
        item.style.opacity = "0.6";
        setTimeout(() => (item.style.opacity = ""), 300);
      }
    });

    item.addEventListener("mouseleave", () => clearTimeout(pressTimer));
    item.addEventListener("contextmenu", (e) => e.preventDefault());

    frag.appendChild(item);
  });

  container.innerHTML = "";
  container.appendChild(frag);
}

function _openWordCompound(w) {
  // Cari di flashcard cache dulu
  const hskWord = _globalSearchCache?.find((h) => h.hanzi === w.hanzi);
  if (hskWord) {
    openKosWord(hskWord);
  } else {
    // Buka dengan data dari word_compounds langsung
    openKosWord({
      hanzi: w.hanzi,
      pinyin: w.pinyin,
      arti: w.arti,
      set_id: null,
      word_class: null,
      catatan: null,
    });
  }
}

export function _openKwdRelated(hanzi) {
  const hskWord = _globalSearchCache?.find((h) => h.hanzi === hanzi);
  if (hskWord) {
    openKosWord(hskWord);
  } else {
    showToast(
      `"${hanzi}" adalah kata natural yang ditemukan di contoh kalimat.`,
      "info",
    );
  }
}

/* ── Gesture System ── */
function _initKwdGestures() {
  const body = document.getElementById("kos-word-body");
  if (!body) return;

  let startX = 0,
    startY = 0;

  body.ontouchstart = (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  };

  body.ontouchend = (e) => {
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - startX;
    const dy = endY - startY;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx > 0) _navTab(-1);
      else _navTab(1);
    }
  };
}

function _navTab(dir) {
  const tabNames = ["kalimat", "stroke", "word"];
  let idx = tabNames.indexOf(_activeKwdTab);
  idx += dir;
  if (idx >= 0 && idx < tabNames.length) _switchTab(tabNames[idx]);
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
  _destroyStrokeWriters();
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
  const msg = document.getElementById("contoh-msg");
  const btn = document.getElementById("contoh-save-btn");

  try {
    const hanzi = document.getElementById("contoh-hanzi")?.value.trim();
    const pinyin =
      document.getElementById("contoh-pinyin")?.value.trim() || null;
    const arti = document.getElementById("contoh-arti")?.value.trim() || null;

    if (!hanzi) {
      if (msg) {
        msg.className = "auth-msg err";
        msg.textContent = "Kalimat Hanzi wajib diisi.";
      }
      return;
    }

    if (!_currentKosWord || !_currentKosWord.hanzi) {
      if (msg) {
        msg.className = "auth-msg err";
        msg.textContent =
          "Data kata dasar tidak ditemukan. Silakan buka ulang detail kata.";
      }
      return;
    }

    const currentUser = getCurrentUser();
    if (!currentUser) {
      if (msg) {
        msg.className = "auth-msg err";
        msg.textContent = "Sesi habis. Silakan login kembali.";
      }
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span>Menyimpan...';
    }

    const wordHanzi = _currentKosWord.hanzi;
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

    if (error) throw error;

    closeContohForm();
    await _loadKosWordExamples(wordHanzi);
  } catch (err) {
    console.error("saveContoh Error:", err);
    if (btn) {
      btn.disabled = false;
      btn.textContent = _editingContohId
        ? "Simpan Perubahan"
        : "+ Tambah Contoh";
    }
    if (msg) {
      msg.className = "auth-msg err";
      msg.textContent =
        "Gagal menyimpan: " + (err.message || "Terjadi kesalahan jaringan");
    }
  }
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
    if (screen?.classList.contains("active")) _injectSearchBgCards();
  });
  const searchScreen = document.getElementById("search-screen");
  if (searchScreen)
    observer.observe(searchScreen, { attributeFilter: ["class"] });
});

/* ── Expose ke window ── */
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
window.initExtractedWordsCache = initExtractedWordsCache;
window.toggleKosTooltip = toggleKosTooltip;
window.closeKosTooltip = closeKosTooltip;
window.openKosTulis = openKosTulis;
window._injectSearchBgCards = _injectSearchBgCards;
window._switchTab = _switchTab;
window._openKwdRelated = _openKwdRelated;
window._currentKosWord = null;
