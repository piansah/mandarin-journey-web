import { supa } from "../core/config.js";
import { getCurrentUser, openAuthModal } from "../core/auth.js";
import { openLayer, closeLayer, backToLayer } from "../core/navigation.js";
import { showToast } from "../utilities/helpers.js";
import { colorPy } from "../utilities/pinyin.js";
import { startFC } from "./flashcard.js";
import { openKosWord, _attachLongPressTTS, performSmartSearch, showConfirm, closeKosDelModal } from "./kosakata.js";
import { speakMandarin } from "../utilities/tts.js";

let activeTheme = null;
let activeDeck = null;
let activeCards = [];
let editingThemeId = null;
let editingDeckId = null;
let optionTheme = null;
let optionDeck = null;
let searchTimer = null;

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

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function showModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
}

function hideModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
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
          <span class="pd-menu-icon">❤️</span>
          <span class="pd-menu-label">Kata Favorit</span>
          <span class="pd-menu-arrow">❯</span>
        </div>
        <div class="pd-menu-row" id="pd-btn-open-themes">
          <span class="pd-menu-icon">📚</span>
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

  list.innerHTML = `<div class="pd-loading"><span class="spinner"></span> Memuat favorit...</div>`;
  const { data, error } = await supa
    .from("personal_favorites")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = `<div class="pd-empty">Gagal memuat favorit.</div>`;
    return;
  }
  if (!data?.length) {
    list.innerHTML = `<div class="pd-empty"><div class="pd-empty-icon">❤️</div><div class="pd-empty-title">Belum ada kata favorit</div><div class="pd-empty-sub">Buka detail kata lalu ketuk tombol hati.</div></div>`;
    return;
  }
  renderCardList(list, data, { deletable: true, returnLayer: "layer-favorites", isFavoriteList: true });
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

  grid.innerHTML = `<div class="pd-loading" style="grid-column:1/-1;"><span class="spinner"></span> Memuat tema...</div>`;
  const { data, error } = await supa
    .from("personal_themes")
    .select("*, personal_decks(count)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    grid.innerHTML = `<div class="pd-empty" style="grid-column:1/-1;">Gagal memuat tema.</div>`;
    return;
  }
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
    card.addEventListener("click", () => openTheme(theme.id, theme));
    bindLongPress(card, () => pdShowThemeOptions(theme));
    grid.appendChild(card);
  });
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
  const user = userOrLogin();
  if (!user) return;
  const name = document.getElementById("pd-theme-name")?.value.trim();
  const icon = document.getElementById("pd-emoji-grid")?.dataset.selected || "📚";
  if (!name) {
    showToast("Nama tema tidak boleh kosong", "warn");
    return;
  }
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
  grid.innerHTML = `<div class="pd-loading"><span class="spinner"></span> Memuat deck...</div>`;

  const { data, error } = await supa
    .from("personal_decks")
    .select("*, personal_cards(count)")
    .eq("theme_id", themeId)
    .order("created_at", { ascending: true });

  if (error) {
    grid.innerHTML = `<div class="pd-empty">Gagal memuat deck.</div>`;
    return;
  }
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
      <div class="item-card-top">
        <span class="day-badge">PERSONAL</span>
      </div>
      <div class="item-title">${esc(title)}</div>
      <div class="item-desc">${esc(deck.description || "Deck Personal")}</div>
      <div class="item-meta">
        <span class="item-date">${count} Kosakata • Deck Personal</span>
        <button class="btn-open">Buka</button>
      </div>`;

    // Open button: stop propagation, openDeck directly
    card.querySelector(".btn-open")?.addEventListener("click", (e) => {
      e.stopPropagation();
      openDeck(deck.id, deck);
    });

    // Tap on card body opens deck; long press shows options
    bindLongPress(card, () => pdShowDeckOptions(deck), () => openDeck(deck.id, deck));
    grid.appendChild(card);
  });
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
  const user = userOrLogin();
  if (!user || !activeTheme?.id) return;
  const title = document.getElementById("pd-deck-title-input")?.value.trim();
  const description = document.getElementById("pd-deck-desc-input")?.value.trim() || null;
  if (!title) {
    showToast("Judul deck tidak boleh kosong", "warn");
    return;
  }
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
}

export function pdShowDeckOptions(deck) {
  optionDeck = deck;
  setText("pd-deck-opt-edit", "Edit Deck");
  setText("pd-deck-opt-delete", "Hapus Deck");
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
  setText("pd-cards-deck-title", deck.title || "Deck");
  openLayer("layer-personal-cards");
  renderCards(deckId);
}

export async function renderCards(deckId = activeDeck?.id) {
  const list = document.getElementById("pd-cards-list");
  if (!list || !deckId) return;
  list.innerHTML = `<div class="pd-loading"><span class="spinner"></span> Memuat kata...</div>`;

  const { data, error } = await supa
    .from("personal_cards")
    .select("*")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: true });

  if (error) {
    list.innerHTML = `<div class="pd-empty">Gagal memuat kata.</div>`;
    return;
  }
  activeCards = data || [];
  setText("pd-cards-deck-count", `${activeCards.length} kata`);
  if (!activeCards.length) {
    list.innerHTML = `<div class="pd-empty"><div class="pd-empty-title">Belum ada kata</div><div class="pd-empty-sub">Ketuk + Kosakata untuk menambahkan kata.</div></div>`;
    return;
  }
  renderCardList(list, activeCards, { deletable: true, returnLayer: "layer-personal-cards" });
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

  const wcLabels = {
    noun: "N", verb: "V", adj: "Adj", adv: "Adv", pron: "Pron",
    num: "Num", classifier: "Clas", prep: "Prep", conj: "Conj",
    particle: "Part", interj: "Interj", onom: "Onom",
  };
  const wc = card.word_class
    ? `<span class="badge-native" style="margin-left:4px;">${esc(wcLabels[card.word_class] || card.word_class)}</span>`
    : "";

  item.innerHTML = `
    <div class="kos-hz">${esc(card.hanzi)}</div>
    <div class="kos-info">
      <div class="kos-py">${colorPy(card.pinyin || "")}</div>
      <div class="kos-arti">${esc(card.arti || "")}</div>
    </div>
    <div class="kos-meta">
      ${wc}
      <span class="kos-no">#${idx + 1}</span>
    </div>`;
  return item;
}

// ─── Card CRUD ────────────────────────────────────────────────────────────────

export async function deleteCard(cardId, hanzi) {
  showConfirm("Hapus Kata?", `Hapus "${hanzi}" dari deck ini?`, async () => {
    const { error } = await supa.from("personal_cards").delete().eq("id", cardId);
    if (error) {
      showToast("Gagal menghapus kata", "err");
      return;
    }
    showToast("Kata dihapus");
    closeKosDelModal();
    renderCards();
  });
}

export function pdShowAddCardModal() {
  const input = document.getElementById("pd-card-search");
  const results = document.getElementById("pd-card-search-results");
  if (input) input.value = "";
  if (results) results.innerHTML = "";
  const cloned = input?.cloneNode(true);
  if (input && cloned) {
    input.parentNode.replaceChild(cloned, input);
    cloned.addEventListener("input", () => {
      clearTimeout(searchTimer);
      const q = cloned.value.trim();
      if (!q) {
        const box = document.getElementById("pd-card-search-results");
        if (box) box.innerHTML = "";
        return;
      }
      searchTimer = setTimeout(() => pdSearchCards(q), 300);
    });
  }
  showModal("pd-add-card-modal");
  setTimeout(() => document.getElementById("pd-card-search")?.focus(), 80);
}

export function pdHideAddCardModal() {
  hideModal("pd-add-card-modal");
}

export async function pdSearchCards(query) {
  const box = document.getElementById("pd-card-search-results");
  if (!box) return;
  box.innerHTML = `<div class="pd-loading" style="padding:18px;"><span class="spinner"></span> Mencari...</div>`;

  const q = query.trim();
  if (!q) {
    box.innerHTML = "";
    return;
  }

  const cards = await performSmartSearch(q);

  if (!cards || cards.length === 0) {
    box.innerHTML = `<div class="pd-empty" style="padding:18px;">Tidak ditemukan kata untuk "${query}"</div>`;
    return;
  }

  box.innerHTML = "";
  const seen = new Set();
  cards.forEach((card) => {
    if (!card.hanzi || seen.has(card.hanzi)) return;
    seen.add(card.hanzi);
    const row = document.createElement("div");
    row.className = "pd-search-item";
    row.style.cursor = "pointer";
    row.innerHTML = `
      <div class="pd-search-hz">${esc(card.hanzi)}</div>
      <div class="pd-search-info">
        <div class="pd-search-py">${colorPy(card.pinyin || "")}</div>
        <div class="pd-search-arti">${esc(card.arti || "")}</div>
      </div>
      <button type="button" class="pd-search-add">+ Tambah</button>`;

    row.addEventListener("click", () => openPersonalCardDetail(card, "layer-personal-cards"));
    row.querySelector(".pd-search-add")?.addEventListener("click", (e) => {
      e.stopPropagation();
      addCard(card, row);
    });
    box.appendChild(row);
  });
}

export async function addCard(card, row) {
  const user = userOrLogin();
  if (!user || !activeDeck?.id) return;
  const btn = row?.querySelector(".pd-search-add");
  if (btn) btn.disabled = true;

  const { error } = await supa.from("personal_cards").insert({
    deck_id: activeDeck.id,
    hanzi: card.hanzi,
    pinyin: card.pinyin || "",
    arti: card.arti || "",
    word_class: card.word_class || null,
    catatan: card.catatan || null,
    added_by: user.id,
  });
  if (error) {
    showToast(
      error.code === "23505" ? "Kata sudah ada di deck" : "Gagal menambah kata",
      "err",
    );
    if (btn) btn.disabled = false;
    return;
  }
  if (btn) btn.textContent = "OK";
  showToast("Kata ditambahkan", "ok");
  renderCards();
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
  pdToggleLatihan,
  pdCloseLatihan,
  pdOpenFlashcard,
  pdOpenNada,
  pdOpenTulis,
  bindKoleksiButtons,
  renderKoleksiSection,
});