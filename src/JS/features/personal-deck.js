import { supa } from "../core/config.js";
import { getCurrentUser, openAuthModal } from "../core/auth.js";
import { openLayer, closeLayer, backToLayer } from "../core/navigation.js";
import { showToast } from "../utilities/helpers.js";
import { colorPy } from "../utilities/pinyin.js";
import { startFC } from "./flashcard.js";
import { openKosWord, _attachLongPressTTS, performSmartSearch, showConfirm, closeKosDelModal } from "./kosakata.js";
import { speakMandarin } from "../utilities/tts.js";
import { SVG_DECK_STACK, SVG_HEART_OUTLINE } from "../../assets/icon.js";

let activeTheme = null;
let activeDeck = null;
let activeCards = [];
let editingThemeId = null;
let editingDeckId = null;
let optionTheme = null;
let optionDeck = null;
let searchTimer = null;
let _pdSearchFilter = "all";
let _currentDeckHanzi = new Set();

// Race condition guards — render request IDs
let _renderFavoritesId = 0;
let _renderThemesId = 0;
let _renderDecksId = 0;
let _renderCardsId = 0;
let _searchRequestId = 0;
let _isSaving = false;

// Helper: Timeout agar tidak stuck skeleton
async function _withPdTimeout(promise, ms = 15000) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("Timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

function _initPdSearchFilters() {
  const container = document.getElementById("pd-search-filters");
  if (!container) return;
  const btns = container.querySelectorAll(".search-filter-btn");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _pdSearchFilter = btn.dataset.filter;
      const q = document.getElementById("pd-card-search")?.value.trim();
      if (q) pdSearchCardsV2(q);
    });
  });
}

const EMOJIS = [
  "📚", "✏️", "💼", "🍜", "🌍", "🎮", "🎵", "🀄",
  "🚗", "🏠", "✨", "🔥", "💎", "⭐", "💡", "🎯", "🚀", "🧠",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function userOrLogin() {
  const user = getCurrentUser();
  if (!user) openAuthModal?.();
  return user;
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeIntId(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("active");
}

function bindClick(id, handler) {
  const old = document.getElementById(id);
  if (!old) return null;
  const el = old.cloneNode(true);
  old.parentNode.replaceChild(el, old);
  el.addEventListener("click", handler);
  return el;
}

// ─── Koleksi section ──────────────────────────────────────────────────────────

export function renderKoleksiSection() {
  return `
    <div class="prof-section">
      <div class="prof-section-header">
        <div class="prof-section-title">KOLEKSI SAYA</div>
      </div>
      <div class="pd-menu-card">
        <div class="pd-menu-row" id="pd-btn-open-favorites">
          <span class="pd-menu-icon">${SVG_HEART_OUTLINE}</span>
          <span class="pd-menu-label">Kata Favorit</span>
          <span class="pd-menu-arrow">❯</span>
        </div>
        <div class="pd-menu-row" id="pd-btn-open-themes">
          <span class="pd-menu-icon">${SVG_DECK_STACK}</span>
          <span class="pd-menu-label">Deck Personal</span>
          <span class="pd-menu-arrow">❯</span>
        </div>
      </div>
    </div>`;
}

export function bindKoleksiButtons() {
  bindClick("pd-btn-open-favorites", () => {
    openLayer("layer-favorites");
    renderFavorites();
  });
  bindClick("pd-btn-open-themes", () => {
    openLayer("layer-personal-themes");
    renderThemes();
  });
}

// ─── Favorites ────────────────────────────────────────────────────────────────

export async function isFavorited(hanzi) {
  const user = getCurrentUser();
  if (!user || !hanzi) return false;
  const { data } = await supa
    .from("personal_favorites")
    .select("id")
    .eq("user_id", user.id)
    .eq("hanzi", hanzi)
    .maybeSingle();
  return !!data;
}

export async function toggleFavorite(card) {
  const user = userOrLogin();
  if (!user || !card?.hanzi) return false;

  const faved = await isFavorited(card.hanzi);
  if (faved) {
    const { error } = await supa
      .from("personal_favorites")
      .delete()
      .eq("user_id", user.id)
      .eq("hanzi", card.hanzi);
    if (error) {
      showToast("Gagal menghapus favorit", "err");
      return true;
    }
    showToast("Dihapus dari favorit");
    renderFavoritesIfOpen();
    return false;
  }

  let safeSourceId = card.source_id || card.id || null;
  if (typeof safeSourceId === "string" && safeSourceId.includes("-")) {
    safeSourceId = null; // UUID cannot be cast to integer
  } else if (safeSourceId) {
    safeSourceId = parseInt(safeSourceId);
    if (isNaN(safeSourceId)) safeSourceId = null;
  }

  const { error } = await supa.from("personal_favorites").insert({
    user_id: user.id,
    hanzi: card.hanzi,
    pinyin: card.pinyin || "",
    arti: card.arti || "",
    word_class: card.word_class || null,
    catatan: card.catatan || null, // Tambahkan catatan
    source: card.source || (card.deck_id ? "personal" : (card.set_id ? "hsk" : "compound")),
    source_id: safeSourceId,
  });
  if (error) {
    showToast("Gagal menambah favorit", "err");
    return false;
  }
  showToast("Ditambahkan ke favorit", "ok");
  renderFavoritesIfOpen();
  return true;
}

function renderFavoritesIfOpen() {
  if (document.getElementById("layer-favorites")?.classList.contains("active")) {
    renderFavorites();
  }
}

export async function renderFavorites() {
  const list = document.getElementById("favorites-list");
  if (!list) return;
  const user = userOrLogin();
  if (!user) return;
  const reqId = ++_renderFavoritesId;

  list.innerHTML = `
    <div class="pd-loading">
      <span class="spinner" style="width:24px; height:24px; border-width:3px; margin:0 0 12px 0;"></span>
      <div style="color:var(--dim); font-size:14px;">Memuat favorit...</div>
    </div>`;

  try {
    const { data, error } = await _withPdTimeout(
      supa
        .from("personal_favorites")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      15000
    );

    if (reqId !== _renderFavoritesId) return;

    if (error) throw error;
    if (!data?.length) {
      list.innerHTML = `<div class="pd-empty"><div class="pd-empty-icon">❤️</div><div class="pd-empty-title">Belum ada kata favorit</div><div class="pd-empty-sub">Buka detail kata lalu ketuk tombol hati.</div></div>`;
      return;
    }
    renderCardList(list, data, { deletable: true, returnLayer: "layer-favorites", isFavoriteList: true });
  } catch (err) {
    if (reqId !== _renderFavoritesId) return;
    console.error("renderFavorites error:", err);
    list.innerHTML = `
      <div class="pd-empty">
        <div>Gagal memuat favorit.</div>
        <button class="pd-btn-retry" onclick="renderFavorites()" style="margin-top:12px; font-size:12px; padding:6px 12px;">Coba Lagi</button>
      </div>`;
  }
}

// ─── Emoji picker ─────────────────────────────────────────────────────────────

function renderEmojiPicker(selected = "📚") {
  const grid = document.getElementById("pd-emoji-grid");
  if (!grid) return;
  grid.innerHTML = "";
  EMOJIS.forEach((emoji) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `pd-emoji-btn${emoji === selected ? " active" : ""}`;
    btn.textContent = emoji;
    btn.addEventListener("click", () => {
      grid.dataset.selected = emoji;
      grid.querySelectorAll(".pd-emoji-btn").forEach((el) => {
        el.classList.toggle("active", el === btn);
      });
    });
    grid.appendChild(btn);
  });
  grid.dataset.selected = selected;
}

// ─── Themes ───────────────────────────────────────────────────────────────────

export async function renderThemes() {
  const grid = document.getElementById("pd-theme-grid");
  if (!grid) return;
  const user = userOrLogin();
  if (!user) return;
  const reqId = ++_renderThemesId;

  grid.innerHTML = `
    <div class="pd-loading" style="grid-column:1/-1;">
      <span class="spinner" style="width:24px; height:24px; border-width:3px; margin:0 0 12px 0;"></span>
      <div style="color:var(--dim); font-size:14px;">Memuat tema...</div>
    </div>`;

  try {
    const { data, error } = await _withPdTimeout(
      supa
        .from("personal_themes")
        .select("*, personal_decks(count)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      15000
    );

    if (reqId !== _renderThemesId) return;
    if (error) throw error;
    if (!data?.length) {
      grid.innerHTML = `<div class="pd-empty" style="grid-column:1/-1;"><div class="pd-empty-title">Belum ada tema</div><div class="pd-empty-sub">Ketuk + Tema untuk membuat tema baru.</div></div>`;
      return;
    }

    grid.innerHTML = "";
    data.forEach((theme, idx) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "pd-theme-card";
      card.dataset.grad = String(idx % 6);
      card.innerHTML = `
        <div class="pd-theme-icon">${esc(theme.icon || "📚")}</div>
        <div class="pd-theme-name">${esc(theme.name)}</div>
        <div class="pd-theme-count">${theme.personal_decks?.[0]?.count || 0} deck</div>`;

      bindLongPress(card, () => pdShowThemeOptions(theme), () => openTheme(theme.id, theme));
      grid.appendChild(card);
    });
  } catch (err) {
    if (reqId !== _renderThemesId) return;
    console.error("renderThemes error:", err);
    grid.innerHTML = `
      <div class="pd-empty" style="grid-column:1/-1;">
        <div>Gagal memuat tema.</div>
        <button class="pd-btn-retry" onclick="renderThemes()" style="margin-top:12px; font-size:12px; padding:6px 12px;">Coba Lagi</button>
      </div>`;
  }
}

export function pdShowAddThemeModal(theme = null) {
  editingThemeId = theme?.id || null;
  setText("pd-theme-modal-title", editingThemeId ? "Edit Tema" : "+ Tema Baru");
  const input = document.getElementById("pd-theme-name");
  if (input) input.value = theme?.name || "";
  renderEmojiPicker(theme?.icon || "📚");
  bindClick("pd-btn-save-theme", saveTheme);
  showModal("pd-add-theme-modal");
  setTimeout(() => input?.focus(), 80);
}

export function pdHideAddThemeModal() {
  hideModal("pd-add-theme-modal");
}

async function saveTheme() {
  if (_isSaving) return;
  const user = userOrLogin();
  if (!user) return;
  const name = document.getElementById("pd-theme-name")?.value.trim();
  const icon = document.getElementById("pd-emoji-grid")?.dataset.selected || "📚";
  if (!name) {
    showToast("Nama tema tidak boleh kosong", "warn");
    return;
  }
  
  _isSaving = true;
  try {
    const query = editingThemeId
      ? supa.from("personal_themes").update({ name, icon }).eq("id", editingThemeId)
      : supa.from("personal_themes").insert({ user_id: user.id, name, icon });
    const { error } = await query;
    if (error) {
      showToast("Gagal menyimpan tema", "err");
      return;
    }
    pdHideAddThemeModal();
    showToast(editingThemeId ? "Tema diperbarui" : "Tema ditambahkan", "ok");
    renderThemes();
  } finally {
    _isSaving = false;
  }
}

export function pdShowThemeOptions(theme) {
  optionTheme = theme;
  setText("pd-theme-opt-edit", "Edit Tema");
  setText("pd-theme-opt-delete", "Hapus Tema");
  showModal("pd-theme-options-modal");
}

export function pdHideThemeOptions() {
  hideModal("pd-theme-options-modal");
}

export function pdThemeOptEdit() {
  pdHideThemeOptions();
  pdShowAddThemeModal(optionTheme);
}

export async function pdThemeOptDelete() {
  const user = userOrLogin();
  if (!user || !optionTheme) return;

  showConfirm("Hapus Tema?", `Hapus tema "${optionTheme.name}" beserta semua deck?`, async () => {
    const { error } = await supa
      .from("personal_themes")
      .delete()
      .eq("id", optionTheme.id)
      .eq("user_id", user.id);
    if (error) {
      showToast("Gagal menghapus tema", "err");
      return;
    }
    showToast("Tema dihapus");
    pdHideThemeOptions();
    renderThemes();
  });
}

// ─── Decks ────────────────────────────────────────────────────────────────────

export function openTheme(themeId, theme) {
  activeTheme = { id: themeId, ...theme };
  setText("pd-decks-theme-title", `${theme.icon || "📚"} ${theme.name}`);
  setText("pd-decks-theme-sub", "Pilih deck");
  openLayer("layer-personal-decks");
  renderDecks(themeId);
}

export async function renderDecks(themeId = activeTheme?.id) {
  const grid = document.getElementById("pd-deck-grid");
  if (!grid || !themeId) return;
  const reqId = ++_renderDecksId;
  grid.innerHTML = `
    <div class="pd-loading">
      <span class="spinner" style="width:24px; height:24px; border-width:3px; margin:0 0 12px 0;"></span>
      <div style="color:var(--dim); font-size:14px;">Memuat deck...</div>
    </div>`;

  try {
    const { data, error } = await _withPdTimeout(
      supa
        .from("personal_decks")
        .select("*, personal_cards(count)")
        .eq("theme_id", themeId)
        .order("created_at", { ascending: true }),
      15000
    );

    if (reqId !== _renderDecksId) return;
    if (error) throw error;
    if (!data?.length) {
      grid.innerHTML = `<div class="pd-empty"><div class="pd-empty-title">Belum ada deck</div><div class="pd-empty-sub">Ketuk + Deck untuk membuat deck baru.</div></div>`;
      return;
    }

    grid.innerHTML = "";
    data.forEach((deck) => {
      const count = deck.personal_cards?.[0]?.count || 0;
      const title = deck.title || "Deck";
      const card = document.createElement("div");
      card.className = "item-card";
      card.innerHTML = `
        <div class="item-title">${esc(title)}</div>
        <div class="item-desc">${esc(deck.description || "")}</div>
        <div class="item-meta">
          <span class="item-date">${count} Kosakata ⬩ HSK 3.0</span>
          <button class="btn-open">Buka</button>
        </div>`;

      card.querySelector(".btn-open")?.addEventListener("click", (e) => {
        e.stopPropagation();
        openDeck(deck.id, deck);
      });
      bindLongPress(card, () => pdShowDeckOptions(deck), () => openDeck(deck.id, deck));
      grid.appendChild(card);
    });
  } catch (err) {
    if (reqId !== _renderDecksId) return;
    console.error("renderDecks error:", err);
    grid.innerHTML = `
      <div class="pd-empty">
        <div>Gagal memuat deck.</div>
        <button class="pd-btn-retry" onclick="renderDecks()" style="margin-top:12px; font-size:12px; padding:6px 12px;">Coba Lagi</button>
      </div>`;
  }
}

export function pdShowAddDeckModal(deck = null) {
  editingDeckId = deck?.id || null;
  setText("pd-deck-modal-title", editingDeckId ? "Edit Deck" : "+ Deck Baru");
  const modal = document.getElementById("pd-add-deck-modal");
  modal?.classList.toggle("pd-edit-popup", !!editingDeckId);
  const title = document.getElementById("pd-deck-title-input");
  const desc = document.getElementById("pd-deck-desc-input");
  if (title) title.value = deck?.title || "";
  if (desc) desc.value = deck?.description || "";
  bindClick("pd-btn-save-deck", saveDeck);
  showModal("pd-add-deck-modal");
  setTimeout(() => title?.focus(), 80);
}

export function pdHideAddDeckModal() {
  document.getElementById("pd-add-deck-modal")?.classList.remove("pd-edit-popup");
  hideModal("pd-add-deck-modal");
}

async function saveDeck() {
  if (_isSaving) return;
  const user = userOrLogin();
  if (!user || !activeTheme?.id) return;
  const title = document.getElementById("pd-deck-title-input")?.value.trim();
  const description = document.getElementById("pd-deck-desc-input")?.value.trim() || null;
  if (!title) {
    showToast("Judul deck tidak boleh kosong", "warn");
    return;
  }

  _isSaving = true;
  try {
    const payload = { title, description };
    const query = editingDeckId
      ? supa.from("personal_decks").update(payload).eq("id", editingDeckId)
      : supa.from("personal_decks").insert({ ...payload, theme_id: activeTheme.id, created_by: user.id });
    const { error } = await query;
    if (error) {
      showToast("Gagal menyimpan deck", "err");
      return;
    }
    pdHideAddDeckModal();
    showToast(editingDeckId ? "Deck diperbarui" : "Deck ditambahkan", "ok");
    renderDecks();
  } finally {
    _isSaving = false;
  }
}

export function pdShowDeckOptions(deck) {
  optionDeck = deck;
  const modal = document.getElementById("pd-deck-options-modal");
  const container = modal?.querySelector(".pd-modal-content");
  if (!modal || !container) return;

  // Update judul
  const titleEl = container.querySelector(".pd-modal-label");
  if (titleEl) titleEl.textContent = "OPSI DECK";

  // Tampilkan kembali tombol Edit & Hapus
  const btnEdit = document.getElementById("pd-deck-opt-edit");
  const btnDel = document.getElementById("pd-deck-opt-delete");
  if (btnEdit) { btnEdit.style.display = ""; btnEdit.textContent = "Edit Deck"; }
  if (btnDel) { btnDel.style.display = ""; btnDel.textContent = "Hapus Deck"; }

  // Sembunyikan tombol HSK yang tidak relevan
  const btnBuka = document.getElementById("hsk-opt-open");
  if (btnBuka) btnBuka.style.display = "none";

  // Tombol Cetak PDF — di paling atas, styling konsisten
  let btnPrint = document.getElementById("pd-deck-opt-print");
  if (!btnPrint) {
    btnPrint = document.createElement("button");
    btnPrint.id = "pd-deck-opt-print";
    btnPrint.className = "pd-modal-btn";
    container.appendChild(btnPrint);
  }
  // Pindahkan ke paling atas (sebelum Edit Deck)
  if (btnEdit && btnPrint.nextSibling !== btnEdit) {
    container.insertBefore(btnPrint, btnEdit);
  }
  btnPrint.style.cssText = "display:block; width:100%; padding:16px; background:transparent; color:var(--gold); border:1.5px solid rgba(232,201,109,0.35); border-radius:14px; font-size:15px; font-weight:600; cursor:pointer; text-align:center; margin-bottom:10px; box-sizing:border-box;";
  btnPrint.textContent = "🖨️ Cetak PDF (Lembar Latihan)";
  btnPrint.onclick = () => {
    pdHideDeckOptions();
    window.preparePrintDeck?.(optionDeck.id, optionDeck.title);
  };

  showModal("pd-deck-options-modal");
}

export function pdHideDeckOptions() {
  hideModal("pd-deck-options-modal");
}

export function pdDeckOptEdit() {
  pdHideDeckOptions();
  pdShowAddDeckModal(optionDeck);
}

export async function pdDeckOptDelete() {
  if (!optionDeck) return;
  showConfirm("Hapus Deck?", `Deck "${optionDeck.title}" dan semua katanya akan dihapus.`, async () => {
    const { error } = await supa.from("personal_decks").delete().eq("id", optionDeck.id);
    if (error) showToast("Gagal menghapus deck", "err");
    else {
      showToast(`Deck "${optionDeck.title}" dihapus`);
      pdHideDeckOptions();
      renderDecks();
    }
  });
}

// ─── Cards ────────────────────────────────────────────────────────────────────

export function openDeck(deckId, deck) {
  activeDeck = { id: deckId, ...deck };
  _currentDeckHanzi = new Set(); // Bug #16: reset saat pindah deck
  setText("pd-cards-deck-title", deck.title || "Deck");
  openLayer("layer-personal-cards");
  renderCards(deckId);
}

export async function renderCards(deckId = activeDeck?.id) {
  const list = document.getElementById("pd-cards-list");
  if (!list || !deckId) return;
  const reqId = ++_renderCardsId;
  list.innerHTML = `
    <div class="pd-loading">
      <span class="spinner" style="width:24px; height:24px; border-width:3px; margin:0 0 12px 0;"></span>
      <div style="color:var(--dim); font-size:14px;">Memuat kata...</div>
    </div>`;

  try {
    const { data, error } = await _withPdTimeout(
      supa
        .from("personal_cards")
        .select("*")
        .eq("deck_id", deckId)
        .order("created_at", { ascending: true }),
      15000
    );

    if (reqId !== _renderCardsId) return;
    if (error) throw error;

    activeCards = data || [];
    setText("pd-cards-deck-count", `${activeCards.length} kata`);
    if (!activeCards.length) {
      list.innerHTML = `<div class="pd-empty"><div class="pd-empty-title">Belum ada kata</div><div class="pd-empty-sub">Ketuk + Kosakata untuk menambahkan kata.</div></div>`;
      return;
    }
    renderCardList(list, activeCards, { deletable: true, returnLayer: "layer-personal-cards" });
  } catch (err) {
    if (reqId !== _renderCardsId) return;
    console.error("renderCards error:", err);
    list.innerHTML = `
      <div class="pd-empty">
        <div>Gagal memuat kata.</div>
        <button class="pd-btn-retry" onclick="renderCards()" style="margin-top:12px; font-size:12px; padding:6px 12px;">Coba Lagi</button>
      </div>`;
  }
}

function renderCardList(list, cards, { deletable, returnLayer, isFavoriteList }) {
  list.innerHTML = "";
  cards.forEach((card, idx) => {
    const item = buildKosItem(card, idx);

    if (deletable) {
      const wrap = document.createElement("div");
      wrap.className = "pd-swipe-wrap";
      const del = document.createElement("button");
      del.type = "button";
      del.className = "pd-swipe-delete";
      del.textContent = "✕";
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (isFavoriteList) {
          await toggleFavorite(card);
          renderFavorites();
        } else {
          deleteCard(card.id, card.hanzi);
        }
      });
      wrap.appendChild(del);
      wrap.appendChild(item);
      bindCardInteractions(item, wrap, card, returnLayer);
      list.appendChild(wrap);
    } else {
      bindCardInteractions(item, null, card, returnLayer);
      list.appendChild(item);
    }
  });
}

// ─── Touch gesture engine (Menggunakan _attachLongPressTTS dari kosakata.js) ───

function bindCardInteractions(item, wrap, card, returnLayer) {
  const onTap = () => {
    openPersonalCardDetail(card, returnLayer);
  };

  _attachLongPressTTS(item, card.hanzi, onTap);

  if (!wrap) return;

  let startX = 0;

  wrap.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX;
  }, { passive: true });

  wrap.addEventListener("touchmove", (e) => {
    const diff = e.touches[0].clientX - startX;
    if (diff < -30) {
      wrap.classList.add("swiped");
    } else if (diff > 30) {
      wrap.classList.remove("swiped");
    }
  }, { passive: true });
}

// personal-deck.js
function bindLongPress(el, onLongPress, onTap = null) {
  _attachLongPressTTS(el, null, onTap ?? (() => { }));
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    onLongPress();
  });
}

// ─── Card detail ──────────────────────────────────────────────────────────────

function openPersonalCardDetail(card, returnLayer) {
  if (!card) return;
  openKosWord({ ...card, _returnLayer: returnLayer || "layer-personal-cards" });
}

function buildKosItem(card, idx) {
  const item = document.createElement("div");
  item.className = "kos-item";
  item.dataset.idx = String(idx);
  item.style.cursor = "pointer";

  item.innerHTML = `
    <div class="kos-hz">${esc(card.hanzi)}</div>
    <div class="kos-info">
      <div class="kos-py">${colorPy(card.pinyin || "")}</div>
      <div class="kos-arti">${esc(card.arti || "")}</div>
    </div>
    <div class="kos-meta">
      <span class="kos-no">#${idx + 1}</span>
    </div>`;
  return item;
}

// ─── Card CRUD ────────────────────────────────────────────────────────────────

export async function deleteCard(cardId, hanzi) {
  showConfirm("Hapus Kata?", `Hapus "${hanzi}" dari deck ini?`, async () => {
    if (_isSaving) return;
    _isSaving = true;
    try {
      const { error } = await supa.from("personal_cards").delete().eq("id", cardId);
      if (error) {
        showToast("Gagal menghapus kata", "err");
        return;
      }
      showToast("Kata dihapus");
      closeKosDelModal();
      renderCards();
    } finally {
      _isSaving = false;
    }
  });
}

export async function pdShowAddCardModal() {
  const input = document.getElementById("pd-card-search");
  const results = document.getElementById("pd-card-search-results");

  // Bug #15: clear stale timer from previous open
  clearTimeout(searchTimer);
  searchTimer = null;

  // Bug #2: Load hanzi set BEFORE opening layer to avoid wrong button states
  if (activeDeck?.id) {
    const { data } = await supa
      .from("personal_cards")
      .select("hanzi")
      .eq("deck_id", activeDeck.id);
    _currentDeckHanzi = new Set(data?.map((d) => d.hanzi) || []);
  }

  if (input) {
    input.value = "";
    input.oninput = () => {
      clearTimeout(searchTimer);
      const q = input.value.trim();
      if (!q) {
        if (results) results.innerHTML = "";
        return;
      }
      searchTimer = setTimeout(() => pdSearchCardsV2(q), 300);
    };
  }
  if (results) results.innerHTML = "";
  openLayer("layer-pd-add-card");
  setTimeout(() => input?.focus(), 300);
}

export function pdHideAddCardModal() {
  // Bug #3: Clear search timer saat layer ditutup
  clearTimeout(searchTimer);
  searchTimer = null;
  backToLayer("layer-personal-cards");
}

export async function pdSearchCardsV2(query) {
  const box = document.getElementById("pd-card-search-results");
  if (!box) return;
  const reqId = ++_searchRequestId;
  box.innerHTML = `
    <div class="pd-loading" style="padding:40px 0;">
      <span class="spinner" style="width:24px; height:24px; border-width:3px; margin:0 0 12px 0;"></span>
      <div style="color:var(--dim); font-size:14px;">Mencari kata...</div>
    </div>`;

  const q = query.trim();
  if (!q) {
    box.innerHTML = "";
    return;
  }

  const results = await performSmartSearch(q, _pdSearchFilter);
  if (reqId !== _searchRequestId) return; // stale response

  if (!results || results.length === 0) {
    // Bug #14: escape query to prevent XSS
    box.innerHTML = `<div class="pd-empty" style="padding:18px;">Tidak ditemukan kata untuk "${esc(query)}"</div>`;
    return;
  }

  box.innerHTML = `<div style="font-size:11px;color:var(--dim);padding:0 4px 8px;">${results.length} kata ditemukan</div>`;
  const seen = new Set();
  const frag = document.createDocumentFragment();

  results.forEach((card, idx) => {
    if (!card.hanzi || seen.has(card.hanzi)) return;
    seen.add(card.hanzi);

    const isAdded = _currentDeckHanzi.has(card.hanzi);
    const row = document.createElement("div");
    row.className = "pd-search-item";
    row.style.cursor = "pointer";
    row.innerHTML = `
      <div class="pd-search-hz">${esc(card.hanzi)}</div>
      <div class="pd-search-info">
        <div class="pd-search-py">${colorPy(card.pinyin || "")}</div>
        <div class="pd-search-arti">${esc(card.arti || "")}</div>
      </div>
      <button type="button" class="pd-search-add ${isAdded ? "is-added" : ""}">${isAdded ? "Hapus" : "+ Tambah"}</button>`;

    row.addEventListener("click", () =>
      openPersonalCardDetail(card, "layer-pd-add-card"),
    );
    row.querySelector(".pd-search-add")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const btn = e.target;
      if (btn.classList.contains("is-added")) {
        removeCardFromSearch(card, row);
      } else {
        addCard(card, row);
      }
    });
    frag.appendChild(row);
  });
  box.appendChild(frag);
}

export async function addCard(card, row) {
  if (_isSaving) return;
  const user = userOrLogin();
  if (!user || !activeDeck?.id) return;

  const btn = row?.querySelector(".pd-search-add");
  if (btn) {
    btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;"></span>';
    btn.disabled = true;
  }

  _isSaving = true;
  try {
    const { error } = await supa.from("personal_cards").insert({
      user_id: user.id,
      deck_id: activeDeck.id,
      hanzi: card.hanzi,
      pinyin: card.pinyin || "",
      arti: card.arti || "",
    });

    if (error) {
      console.error("addCard error:", error);
      showToast("Gagal menambah kata", "err");
      if (btn) {
        btn.innerHTML = "+ Tambah";
        btn.disabled = false;
      }
      return;
    }

    _currentDeckHanzi.add(card.hanzi);
    if (btn) {
      btn.innerHTML = "Hapus";
      btn.classList.add("is-added");
      btn.disabled = false;
    }
    showToast(`"${card.hanzi}" ditambahkan ke deck`, "ok");
    renderCards();
  } finally {
    _isSaving = false;
  }
}

export async function removeCardFromSearch(card, row) {
  if (_isSaving || !activeDeck?.id) return;
  const btn = row?.querySelector(".pd-search-add");
  if (btn) btn.disabled = true;

  _isSaving = true;
  try {
    const { error } = await supa
      .from("personal_cards")
      .delete()
      .eq("deck_id", activeDeck.id)
      .eq("hanzi", card.hanzi);

    if (error) {
      showToast("Gagal menghapus", "err");
      return;
    }

    if (btn) {
      btn.textContent = "+ Tambah";
      btn.classList.remove("is-added");
    }
    _currentDeckHanzi.delete(card.hanzi);
    showToast("Kata dihapus", "ok");
    renderCards();
  } catch (err) {
    console.error("removeCardFromSearch failed:", err);
  } finally {
    _isSaving = false;
    if (btn) btn.disabled = false;
  }
}

// ─── Latihan ──────────────────────────────────────────────────────────────────

export function pdToggleLatihan() {
  const sheet = document.getElementById("pd-latihan-tooltip");
  if (!sheet) return;
  const visible = sheet.classList.toggle("visible");
  const btn = document.getElementById("pd-latihan-btn");
  if (btn) btn.textContent = visible ? "Tutup Latihan" : "Mulai Latihan";
}

export function pdCloseLatihan() {
  document.getElementById("pd-latihan-tooltip")?.classList.remove("visible");
  const btn = document.getElementById("pd-latihan-btn");
  if (btn) btn.textContent = "Mulai Latihan";
}

export function pdOpenFlashcard() {
  pdCloseLatihan();
  if (!activeDeck?.id) return;
  startFC(`pd${activeDeck.id}`, activeDeck.id, {
    title: activeDeck.title,
    description: "Deck Personal",
    sourceType: "personal",
    cards: activeCards,
    returnLayer: "layer-personal-cards",
  });
}

export function pdOpenNada() {
  pdCloseLatihan();
  if (typeof window.startNadaLatihan === "function") {
    window.startNadaLatihan(activeCards, activeDeck?.title || "Deck Personal", true);
  }
}

export function pdOpenTulis() {
  pdCloseLatihan();
  if (typeof window.startTulisHanzi === "function") {
    window.startTulisHanzi(
      activeCards,
      activeDeck?.title || "Deck Personal",
      "layer-personal-cards",
      true
    );
  }
}

// ─── Global exports ───────────────────────────────────────────────────────────

Object.assign(window, {
  renderFavorites,
  toggleFavorite,
  isFavorited,
  renderThemes,
  renderDecks,
  renderCards,
  openTheme,
  openDeck,
  pdShowAddThemeModal,
  pdHideAddThemeModal,
  pdShowAddDeckModal,
  pdHideAddDeckModal,
  pdShowAddCardModal,
  pdHideAddCardModal,
  pdShowThemeOptions,
  pdHideThemeOptions,
  pdThemeOptEdit,
  pdThemeOptDelete,
  pdShowDeckOptions,
  pdHideDeckOptions,
  pdDeckOptEdit,
  pdDeckOptDelete,
  deleteCard,
  pdSearchCardsV2,
  pdToggleLatihan,
  pdCloseLatihan,
  pdOpenFlashcard,
  pdOpenNada,
  pdOpenTulis,
  bindKoleksiButtons,
  renderKoleksiSection,
});

document.addEventListener("DOMContentLoaded", _initPdSearchFilters);
