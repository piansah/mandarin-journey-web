# Personal Deck — Spesifikasi Fitur (Revisi)

## Konteks Aplikasi

Aplikasi belajar Mandarin berbasis web (mandarin-journey.vercel.app).
Tech stack: Vanilla JS ES Modules, HTML, CSS, Supabase. Tidak ada framework, tidak ada build tool.

### Konvensi yang sudah ada

| Kebutuhan        | Import                                                          |
| ---------------- | --------------------------------------------------------------- |
| Supabase client  | `import { supa } from "../core/config.js"`                      |
| Auth             | `import { getCurrentUser } from "../core/auth.js"`              |
| Navigasi layer   | `import { openLayer, closeLayer } from "../core/navigation.js"` |
| Toast notifikasi | `import { showToast } from "../utilities/helpers.js"`           |
| Warna pinyin     | `import { colorPy } from "../utilities/pinyin.js"`              |
| TTS Mandarin     | `import { speakMandarin } from "../utilities/tts.js"`           |
| Engine flashcard | `import { startFC } from "./flashcard.js"`                      |
| Detail kata      | `import { openKosWord } from "./kosakata.js"`                   |
| Global search    | `import { initGlobalSearchCache, _globalSearchCache } from "./kosakata.js"` |
| Long press TTS   | Reuse `_attachLongPressTTS()` dari kosakata.js (export atau duplikasi) |

### Konvensi lain

- Semua fungsi yang perlu diakses dari HTML harus di-assign ke `window.X = X` di bagian bawah file
- UI text seluruhnya dalam **Bahasa Indonesia**
- CSS dark theme variables: `--bg`, `--sur`, `--sur2`, `--txt`, `--dim`, `--dim2`, `--gold`, `--bdr`
- Layer navigation: `openLayer(id)` / `closeLayer(id)` — layer adalah div `.layer` yang di-show/hide
- **PRINSIP UTAMA: Reuse semua komponen UI dari `kosakata.js` dan `flashcard.js`**. Tidak ada render engine baru.

---

## Database Tables (sudah ada di Supabase, RLS aktif)

```sql
-- Tema / kategori deck
personal_themes (
  id          bigint PK,
  user_id     uuid FK auth.users,
  name        text,
  icon        text,  -- emoji
  created_at  timestamptz
)

-- Deck di dalam tema
personal_decks (
  id          bigint PK,
  theme_id    bigint FK personal_themes,
  title       text,
  description text,
  created_at  timestamptz
)

-- Kata di dalam deck
personal_cards (
  id          bigint PK,
  deck_id     bigint FK personal_decks,
  hanzi       text,
  pinyin      text,
  arti        text,
  word_class  text,
  catatan     text,
  source      text,   -- 'hsk' | 'compound'
  source_id   bigint,
  created_at  timestamptz
)

-- Kata favorit
personal_favorites (
  id          bigint PK,
  user_id     uuid FK auth.users,
  hanzi       text,
  pinyin      text,
  arti        text,
  word_class  text,
  source      text,   -- 'hsk' | 'compound'
  source_id   bigint,
  created_at  timestamptz,
  UNIQUE(user_id, hanzi)
)
```

---

## Alur Navigasi

```
Profile Screen
├── [Kata Favorit] ──→ layer-favorites
│                        └── list kata (.kos-item, reuse renderKosItems style)
│                            tap kata → openKosWord(card)
│                            long press → speakMandarin(hanzi)
│
└── [Deck Personal] ──→ layer-personal-themes
                           ├── header: "📚 Deck Personal" + button [+ Tema] di kanan
                           └── grid tema (tap tema → layer-personal-decks)
                                    ├── header: icon+nama tema + button [+ Deck] di kanan
                                    ├── hold tap card deck → modal 2 opsi (Edit / Hapus)
                                    └── tap deck → layer-personal-cards
                                             ├── header: judul deck + button [+ Kosakata] di kanan
                                             ├── button [Latihan] → tooltip 3 latihan (reuse kos-latihan-tooltip)
                                             └── list kata (.kos-item style)
                                                  ├── tap → openKosWord(card)
                                                  ├── long press → speakMandarin(hanzi)
                                                  └── swipe kiri → reveal tombol hapus (merah transparan)
```

---

## Spesifikasi UI Detail

### Section "Koleksi Saya" di Profile

Ditempatkan di bawah grid stat, di atas section "Lencana Diraih".
Di-render via `innerHTML` di `profile.js`, tombol pakai ID unik + event listener via `bindKoleksiButtons()`.

```
KOLEKSI SAYA
┌──────────────────────────────────┐
│ ❤️  Kata Favorit             ❯  │
├──────────────────────────────────┤
│ 📚  Deck Personal            ❯  │
└──────────────────────────────────┘
```

### Layer: Kata Favorit (`layer-favorites`)

- Header: "❤️ Kata Favorit" + back button
- **Reuse `.kos-item` style** persis dari `renderKosItems()` di kosakata.js
- Tiap item: hanzi, `colorPy(pinyin)`, arti, badge word_class
- Tap → `openKosWord(card)`
- Long press → `speakMandarin(hanzi)` via `_attachLongPressTTS`
- Empty state: icon + "Belum ada kata favorit" + sub "Buka detail kata lalu ketuk tombol hati."

### Layer: Pilih Tema (`layer-personal-themes`)

- Header: "📚 Deck Personal" + back button + **button `+ Tema` di kanan header**
- Tap `+ Tema` → buka bottom-sheet modal `#pd-add-theme-modal`:
  - Input nama tema
  - Emoji picker grid (~20 emoji)
  - Tombol "Simpan Tema"
- Grid tema: card dengan gradient background (6 preset, cycle by index)
  - Isi: emoji besar, nama tema, jumlah deck
  - Tap → masuk `layer-personal-decks` untuk tema itu
  - **Hold tap** → modal 2 opsi: "✏️ Edit Tema" / "🗑️ Hapus Tema"
    - Edit: form nama + emoji muncul (pre-filled)
    - Hapus: konfirmasi → cascade delete deck + kata

### Layer: Deck per Tema (`layer-personal-decks`)

- Header: icon+nama tema + back button + **button `+ Deck` di kanan header**
- Tap `+ Deck` → buka bottom-sheet modal `#pd-add-deck-modal`:
  - Input judul deck
  - Input description (opsional)
  - Tombol "Tambah Deck"
- **List deck: reuse `.item-card` style dari `buildKosDeckGrid()`**
  - Badge "PERSONAL", judul deck, description, jumlah kata, tombol "Buka"
  - **Hold tap card** → modal 2 opsi: "✏️ Edit" / "🗑️ Hapus"
    - Edit: popup form pre-filled title + description
    - Hapus: konfirmasi → cascade delete kata
  - Tap card atau "Buka" → masuk `layer-personal-cards`
- Empty state: "Belum ada deck. Ketuk + untuk membuat deck baru."

### Layer: Isi Deck (`layer-personal-cards`) — Layer Baru

Layer terpisah dari `layer-personal-decks`. Tidak toggle state dalam layer yang sama.

- Header: judul deck + subtitle jumlah kata + back button + **button `+ Kosakata` di kanan**
- **Button `Latihan`** di bawah header (atau di atas list) → **reuse `kos-latihan-tooltip`** dengan 3 opsi: Flashcard, Nada, Tulis
- Tap `+ Kosakata` → buka bottom-sheet modal `#pd-add-card-modal`:
  - Search bar (debounce 300ms)
  - **Reuse fungsi `_runKosGlobalSearch()`** — cari di `flashcard_cards` + `word_compounds`
  - Hasil: list `.kos-item` mini, tiap item + tombol "＋ Tambah"
  - Tap "＋ Tambah" → insert ke `personal_cards`, update subtitle jumlah kata
- **List kata: reuse `.kos-item` style persis dari `renderKosItems()`**
  - Tap → `openKosWord(card)`
  - Long press → `speakMandarin(hanzi)` via `_attachLongPressTTS`
  - **Swipe kiri** → reveal tombol hapus merah transparan di kanan card
    - Pola: `transform: translateX(-Xpx)` + tombol `position: absolute; right: 0`
    - Tap tombol hapus → konfirmasi → delete dari `personal_cards`
    - Swipe kanan kembali atau tap di luar → hide tombol hapus
- Empty state: "Belum ada kata. Ketuk + untuk menambahkan kata."

### Toggle Favorit di Detail Kata (kosakata.js)

Di `_renderHero()`, tambahkan tombol ❤️ di pojok kanan atas hero:

```
┌─────────────────────────────────┐
│  [❤️/🤍]              (pojok)   │
│                                 │
│      我          (hanzi)        │
│      wǒ          (pinyin)       │
│      saya        (arti)         │
└─────────────────────────────────┘
```

- Saat load: cek `personal_favorites` → tampilkan ❤️ atau 🤍
- Tap ❤️ → hapus dari favorit + showToast "Dihapus dari favorit"
- Tap 🤍 → tambah ke favorit + showToast "Ditambahkan ke favorit"
- `source`: `'hsk'` jika card punya `set_id`, `'compound'` jika dari `word_compounds`

---

## Komponen yang Di-Reuse (Tidak Ditulis Ulang)

| Komponen | Sumber | Cara Reuse |
|---|---|---|
| `.item-card` deck grid | `buildKosDeckGrid()` di kosakata.js | Render HTML yang sama, data dari `personal_decks` |
| `.kos-item` list kata | `renderKosItems()` di kosakata.js | Render HTML yang sama, data dari `personal_cards` |
| `_attachLongPressTTS` | kosakata.js | Export fungsi atau duplikasi kecil di personal-deck.js |
| Global search engine | `_runKosGlobalSearch()` di kosakata.js | Panggil langsung atau extract ke shared utility |
| `openKosWord()` | kosakata.js | Panggil langsung |
| `kos-latihan-tooltip` | kosakata.js + index.html | Reuse HTML tooltip yang sama, bind ulang handler |
| `startFC()` | flashcard.js | Panggil untuk latihan Flashcard dari personal deck |
| `.kos-deck-grid` CSS | kosakata.css | Pakai class yang sama |
| `.kos-item` CSS | kosakata.css | Pakai class yang sama |

---

## File yang Perlu Dibuat / Dimodifikasi

### 1. `personal-deck.js` (file baru)

```js
// ── Koleksi section di profile ──
renderKoleksiSection()      // return HTML string untuk section di profile
bindKoleksiButtons()        // attach listener ke tombol koleksi (dipanggil setelah profile render)

// ── Favorit ──
renderFavorites()           // load + render personal_favorites ke #favorites-list
toggleFavorite(card)        // insert/delete personal_favorites, return boolean
isFavorited(hanzi)          // cek apakah sudah difavoritkan, return boolean

// ── Tema ──
renderThemes()              // load + render personal_themes ke #pd-theme-grid
createTheme(name, icon)     // insert personal_themes, refresh grid
editTheme(id, name, icon)   // update personal_themes, refresh grid
deleteTheme(id)             // delete cascade, refresh grid
openTheme(themeId, data)    // openLayer('layer-personal-decks'), set context, renderDecks()

// ── Deck ──
renderDecks(themeId)        // load + render personal_decks, reuse .item-card style
createDeck(themeId, title, desc)  // insert, refresh
editDeck(id, title, desc)   // update, refresh
deleteDeck(id)              // delete cascade, refresh
openDeck(deckId, title)     // openLayer('layer-personal-cards'), set context, renderCards()

// ── Kartu ──
renderCards(deckId)         // load + render personal_cards, reuse .kos-item style
addCard(deckId, cardData)   // insert personal_cards, refresh count + list
deleteCard(id)              // delete, refresh list

// ── Search modal ──
pdSearchCards(query)        // wrapper _runKosGlobalSearch untuk modal tambah kata
                            // tampilkan hasil dengan tombol "＋ Tambah" bukan tap-to-open

// ── Modal helpers ──
pdShowAddThemeModal()
pdHideAddThemeModal()
pdShowAddDeckModal()
pdHideAddDeckModal()
pdShowAddCardModal()
pdHideAddCardModal()

// ── Swipe to delete ──
_bindSwipeDelete(listEl)    // attach swipe listener ke semua .kos-item di listEl
                            // swipe kiri → reveal delete button merah transparan di kanan
```

### 2. `index.html`

Tambahkan layer-layer berikut:

```html
<!-- Layer: Kata Favorit -->
<div class="layer" id="layer-favorites">
  <div class="layer-hd">
    <div class="btn-back" onclick="window.closeLayer('layer-favorites')">❮❮</div>
    <div>
      <div class="layer-title">❤️ Kata Favorit</div>
      <div class="layer-sub">Semua kata yang kamu simpan</div>
    </div>
  </div>
  <div class="layer-body">
    <div class="layer-sec">
      <div id="favorites-list" class="pd-list-wrap"></div>
    </div>
  </div>
</div>

<!-- Layer: Pilih Tema -->
<div class="layer" id="layer-personal-themes">
  <div class="layer-hd">
    <div class="btn-back" onclick="window.closeLayer('layer-personal-themes')">❮❮</div>
    <div style="flex:1">
      <div class="layer-title">📚 Deck Personal</div>
      <div class="layer-sub">Kelola tema deck belajarmu</div>
    </div>
    <button onclick="window.pdShowAddThemeModal()" class="pd-hd-btn">＋ Tema</button>
  </div>
  <div class="layer-body">
    <div class="layer-sec">
      <div id="pd-theme-grid" class="pd-theme-grid"></div>
    </div>
  </div>
</div>

<!-- Layer: Deck per Tema -->
<div class="layer" id="layer-personal-decks">
  <div class="layer-hd">
    <div class="btn-back" onclick="window.closeLayer('layer-personal-decks', true); window.backToLayer('layer-personal-themes')">❮❮</div>
    <div style="flex:1">
      <div class="layer-title" id="pd-decks-theme-title">Deck</div>
      <div class="layer-sub" id="pd-decks-theme-sub">Pilih deck</div>
    </div>
    <button onclick="window.pdShowAddDeckModal()" class="pd-hd-btn">＋ Deck</button>
  </div>
  <div class="layer-body">
    <div class="layer-sec">
      <div id="pd-deck-grid" class="kos-deck-grid"></div>
    </div>
  </div>
</div>

<!-- Layer: Isi Deck (Kata-kata) -->
<div class="layer" id="layer-personal-cards">
  <div class="layer-hd">
    <div class="btn-back" onclick="window.closeLayer('layer-personal-cards', true); window.backToLayer('layer-personal-decks')">❮❮</div>
    <div style="flex:1">
      <div class="layer-title" id="pd-cards-deck-title">Deck</div>
      <div class="layer-sub" id="pd-cards-deck-count">0 kata</div>
    </div>
    <button onclick="window.pdShowAddCardModal()" class="pd-hd-btn pd-hd-btn-outline">＋ Kosakata</button>
  </div>
  <!-- Tombol Latihan (reuse style kos-mulai-btn) -->
  <div style="padding: 8px 16px 0;">
    <button id="pd-latihan-btn" class="kos-mulai-btn" style="width:100%;" onclick="window.pdToggleLatihan()">
      Mulai Latihan
    </button>
    <!-- Tooltip latihan (reuse struktur kos-latihan-tooltip) -->
    <div class="kos-latihan-tooltip" id="pd-latihan-tooltip">
      <button id="pd-tt-fc" class="kos-tt-btn" onclick="window.pdOpenFlashcard()">
        <span class="kos-tt-icon">🃏</span>
        <span class="kos-tt-label">Flashcard</span>
      </button>
      <button id="pd-tt-nada" class="kos-tt-btn" onclick="window.pdOpenNada()">
        <span class="kos-tt-icon">🎵</span>
        <span class="kos-tt-label">Nada</span>
      </button>
      <button id="pd-tt-tulis" class="kos-tt-btn" onclick="window.pdOpenTulis()">
        <span class="kos-tt-icon">✍️</span>
        <span class="kos-tt-label">Tulis</span>
      </button>
    </div>
  </div>
  <div class="layer-body">
    <div class="layer-sec">
      <div id="pd-cards-list" class="pd-list-wrap" style="margin-bottom:20px;"></div>
    </div>
  </div>
</div>

<!-- Modal: Tambah / Edit Tema -->
<div id="pd-add-theme-modal" style="display:none;position:fixed;inset:0;z-index:1200;">
  <div style="position:absolute;inset:0;background:rgba(0,0,0,0.55);" onclick="window.pdHideAddThemeModal()"></div>
  <div style="position:absolute;bottom:0;left:0;right:0;background:var(--sur);border-radius:20px 20px 0 0;padding:20px 16px 36px;max-width:480px;margin:0 auto;">
    <div style="width:36px;height:4px;background:var(--bdr);border-radius:2px;margin:0 auto 18px;"></div>
    <div class="pd-form-title" id="pd-theme-modal-title">＋ Tema Baru</div>
    <input id="pd-theme-name" class="pd-input" placeholder="Nama tema (contoh: Makanan)" />
    <div id="pd-emoji-grid" class="pd-emoji-grid"></div>
    <button id="pd-btn-save-theme" class="pd-btn-main">Simpan Tema</button>
  </div>
</div>

<!-- Modal: Tambah / Edit Deck -->
<div id="pd-add-deck-modal" style="display:none;position:fixed;inset:0;z-index:1200;">
  <div style="position:absolute;inset:0;background:rgba(0,0,0,0.55);" onclick="window.pdHideAddDeckModal()"></div>
  <div style="position:absolute;bottom:0;left:0;right:0;background:var(--sur);border-radius:20px 20px 0 0;padding:20px 16px 36px;max-width:480px;margin:0 auto;">
    <div style="width:36px;height:4px;background:var(--bdr);border-radius:2px;margin:0 auto 18px;"></div>
    <div class="pd-form-title" id="pd-deck-modal-title">＋ Deck Baru</div>
    <input id="pd-deck-title-input" class="pd-input" placeholder="Judul deck (contoh: Kata kerja harian)" />
    <input id="pd-deck-desc-input" class="pd-input" placeholder="Deskripsi (opsional)" style="margin-top:8px;" />
    <button id="pd-btn-save-deck" class="pd-btn-main" style="margin-top:4px;">Simpan Deck</button>
  </div>
</div>

<!-- Modal: Tambah Kata ke Deck -->
<div id="pd-add-card-modal" style="display:none;position:fixed;inset:0;z-index:1200;">
  <div style="position:absolute;inset:0;background:rgba(0,0,0,0.55);" onclick="window.pdHideAddCardModal()"></div>
  <div style="position:absolute;bottom:0;left:0;right:0;background:var(--sur);border-radius:20px 20px 0 0;padding:20px 16px 36px;max-width:480px;margin:0 auto;">
    <div style="width:36px;height:4px;background:var(--bdr);border-radius:2px;margin:0 auto 18px;"></div>
    <div class="pd-form-title">🔍 Cari &amp; Tambah Kata</div>
    <input id="pd-card-search" class="pd-input" placeholder="Cari Hanzi, Pinyin, atau Arti..." autocomplete="off" />
    <div id="pd-card-search-results" class="pd-search-results-mini" style="margin-top:8px;"></div>
  </div>
</div>

<!-- Modal: Opsi Deck (Edit / Hapus) — reuse style action-sheet -->
<div id="pd-deck-options-modal" style="display:none;position:fixed;inset:0;z-index:1200;">
  <div style="position:absolute;inset:0;background:rgba(0,0,0,0.55);" onclick="window.pdHideDeckOptions()"></div>
  <div style="position:absolute;bottom:0;left:0;right:0;background:var(--sur);border-radius:20px 20px 0 0;padding:20px 16px 36px;max-width:480px;margin:0 auto;">
    <div style="width:36px;height:4px;background:var(--bdr);border-radius:2px;margin:0 auto 18px;"></div>
    <button id="pd-deck-opt-edit" class="pd-btn-option" onclick="window.pdDeckOptEdit()">✏️ Edit Deck</button>
    <button id="pd-deck-opt-delete" class="pd-btn-option pd-btn-option-danger" onclick="window.pdDeckOptDelete()">🗑️ Hapus Deck</button>
  </div>
</div>

<!-- Modal: Opsi Tema (Edit / Hapus) -->
<div id="pd-theme-options-modal" style="display:none;position:fixed;inset:0;z-index:1200;">
  <div style="position:absolute;inset:0;background:rgba(0,0,0,0.55);" onclick="window.pdHideThemeOptions()"></div>
  <div style="position:absolute;bottom:0;left:0;right:0;background:var(--sur);border-radius:20px 20px 0 0;padding:20px 16px 36px;max-width:480px;margin:0 auto;">
    <div style="width:36px;height:4px;background:var(--bdr);border-radius:2px;margin:0 auto 18px;"></div>
    <button id="pd-theme-opt-edit" class="pd-btn-option" onclick="window.pdThemeOptEdit()">✏️ Edit Tema</button>
    <button id="pd-theme-opt-delete" class="pd-btn-option pd-btn-option-danger" onclick="window.pdThemeOptDelete()">🗑️ Hapus Tema</button>
  </div>
</div>
```

### 3. `profile.js`

```js
import {
  renderKoleksiSection,
  bindKoleksiButtons,
} from "./personal-deck.js";
```

Di `_renderProfileFull()`, setelah `scroll.innerHTML = ...`:

```js
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    // ... animasi xp fill yang sudah ada ...
    bindKoleksiButtons(); // ← tambahkan ini
  }),
);
```

Di HTML yang di-inject, tambahkan `${renderKoleksiSection()}` di antara stats grid dan section lencana.

### 4. `kosakata.js`

Di fungsi `_renderHero()`, tambahkan tombol favorit di pojok kanan atas:

```js
// Tambah di dalam HTML hero
<button id="kos-fav-btn" class="kos-fav-btn" aria-label="Favorit">🤍</button>
```

Setelah render, import dan bind:

```js
import { isFavorited, toggleFavorite } from "./personal-deck.js";

// Setelah _renderHero():
isFavorited(card.hanzi).then((faved) => {
  const btn = document.getElementById("kos-fav-btn");
  if (btn) btn.textContent = faved ? "❤️" : "🤍";
});

document.getElementById("kos-fav-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("kos-fav-btn");
  const nowFaved = await toggleFavorite(_currentKosWord);
  if (btn) btn.textContent = nowFaved ? "❤️" : "🤍";
  showToast(nowFaved ? "Ditambahkan ke favorit" : "Dihapus dari favorit", "ok");
});
```

---

## CSS Baru (`personal-deck.css` atau tambah ke `profile.css`)

```css
/* Header button */
.pd-hd-btn {
  background: var(--gold);
  color: #000;
  border: none;
  border-radius: 10px;
  padding: 6px 14px;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
}
.pd-hd-btn-outline {
  background: var(--sur2);
  color: var(--gold);
  border: 1px solid var(--bdr);
}

/* Koleksi section di profile */
.pd-menu-card { border: 1px solid var(--bdr); border-radius: 14px; overflow: hidden; background: var(--sur); margin-bottom: 20px; }
.pd-menu-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; }
.pd-menu-row + .pd-menu-row { border-top: 1px solid var(--bdr); }
.pd-menu-icon { font-size: 20px; }
.pd-menu-label { flex: 1; font-size: 14px; font-weight: 600; color: var(--txt); }
.pd-menu-arrow { color: var(--dim); font-size: 12px; }

/* Tema grid */
.pd-theme-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 4px 0; }
.pd-theme-card {
  border-radius: 14px;
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  position: relative;
  min-height: 110px;
  justify-content: center;
}
.pd-theme-icon { font-size: 32px; }
.pd-theme-name { font-weight: 700; font-size: 14px; color: #fff; text-align: center; }
.pd-theme-count { font-size: 11px; color: rgba(255,255,255,0.75); }

/* Gradient preset untuk tema (6 warna, cycle by index) */
.pd-theme-card[data-grad="0"] { background: linear-gradient(135deg, #667eea, #764ba2); }
.pd-theme-card[data-grad="1"] { background: linear-gradient(135deg, #f093fb, #f5576c); }
.pd-theme-card[data-grad="2"] { background: linear-gradient(135deg, #4facfe, #00f2fe); }
.pd-theme-card[data-grad="3"] { background: linear-gradient(135deg, #43e97b, #38f9d7); }
.pd-theme-card[data-grad="4"] { background: linear-gradient(135deg, #fa709a, #fee140); }
.pd-theme-card[data-grad="5"] { background: linear-gradient(135deg, #a18cd1, #fbc2eb); }

/* Form elements */
.pd-input {
  width: 100%;
  background: var(--sur2);
  border: 1px solid var(--bdr);
  border-radius: 10px;
  padding: 12px 14px;
  color: var(--txt);
  font-size: 15px;
  box-sizing: border-box;
  outline: none;
}
.pd-input:focus { border-color: var(--gold); }
.pd-btn-main {
  width: 100%;
  background: var(--gold);
  color: #000;
  border: none;
  border-radius: 12px;
  padding: 14px;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
  margin-top: 12px;
}
.pd-form-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dim);
  margin-bottom: 12px;
}

/* Emoji picker */
.pd-emoji-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin: 12px 0; }
.pd-emoji-btn {
  aspect-ratio: 1;
  border: 2px solid var(--bdr);
  border-radius: 8px;
  background: var(--sur2);
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pd-emoji-btn.active { border-color: var(--gold); background: rgba(232,201,109,0.15); }

/* Action sheet options */
.pd-btn-option {
  width: 100%;
  background: var(--sur2);
  border: 1px solid var(--bdr);
  border-radius: 12px;
  padding: 14px;
  color: var(--txt);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  margin-bottom: 8px;
}
.pd-btn-option-danger { color: #ff6b6b; border-color: rgba(255,107,107,0.3); background: rgba(255,107,107,0.08); }

/* Search results di modal tambah kata */
.pd-search-results-mini { max-height: 280px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.pd-search-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--bdr);
}
.pd-search-item:last-child { border-bottom: none; }
.pd-search-hz { font-family: var(--font-hanzi); font-size: 22px; min-width: 36px; }
.pd-search-info { flex: 1; min-width: 0; }
.pd-search-py { font-size: 12px; color: var(--dim); }
.pd-search-arti { font-size: 13px; color: var(--txt); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pd-search-add {
  border: 1px solid var(--gold);
  color: var(--gold);
  background: transparent;
  border-radius: 8px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}

/* List wrap */
.pd-list-wrap { display: flex; flex-direction: column; gap: 8px; }

/* Empty & loading state */
.pd-empty { text-align: center; padding: 60px 24px; color: var(--dim); }
.pd-empty-icon { font-size: 40px; margin-bottom: 12px; }
.pd-empty-title { font-size: 15px; font-weight: 600; color: var(--txt); margin-bottom: 6px; }
.pd-empty-sub { font-size: 13px; }

/* Swipe to delete pada .kos-item */
.kos-item { position: relative; overflow: hidden; }
.kos-item-inner { transition: transform 0.2s ease; display: flex; align-items: center; width: 100%; }
.kos-item-del-btn {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 72px;
  background: rgba(255, 80, 80, 0.18);
  border: none;
  color: #ff6b6b;
  font-size: 20px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateX(100%);
  transition: transform 0.2s ease;
}
.kos-item.swiped .kos-item-inner { transform: translateX(-72px); }
.kos-item.swiped .kos-item-del-btn { transform: translateX(0); }

/* Favorit button di hero detail kata */
.kos-fav-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}
```

---

## Catatan Implementasi Penting

1. **Reuse maksimal**: Jangan render ulang `.kos-item` atau `.item-card` dari nol. Gunakan pola HTML yang identik dengan `renderKosItems()` dan `buildKosDeckGrid()`.

2. **Layer terpisah untuk isi deck**: Gunakan `layer-personal-cards` sebagai layer baru, bukan toggle state dalam `layer-personal-decks`. Lebih bersih dan konsisten dengan pola navigasi yang ada.

3. **Anti double-bind**: Gunakan `cloneNode(true)` + `replaceChild()` untuk semua event listener yang di-attach ulang setelah render.

4. **Swipe to delete**: Implementasi sederhana — track `touchstart`/`touchend` dx, jika swipe kiri > 50px toggle class `.swiped`. Tap di luar atau swipe kanan reset. Hanya satu item bisa terbuka sekaligus (reset item lain saat buka baru).

5. **Modal edit vs tambah**: Modal tema dan deck menggunakan form yang sama (satu modal, judul berubah). Simpan `_editingThemeId` / `_editingDeckId` di state modul — null = tambah baru, ada nilai = edit.

6. **Search di modal tambah kata**: Wrap `_runKosGlobalSearch()` — hasil yang sama, tapi tombol aksi diganti dari "tap to open detail" menjadi "＋ Tambah". Cukup filter hasil dan render ulang dengan tombol berbeda.

7. **Latihan dari personal deck**: Kumpulkan `personal_cards` lalu panggil `startFC()`, `startNadaLatihan()`, `startTulisHanzi()` dengan data array tersebut — sama persis dengan cara `openKosNada()` dan `openKosTulis()` bekerja di kosakata.js.

8. **`bindKoleksiButtons()`**: Harus dipanggil setiap kali `_renderProfileFull()` selesai karena `innerHTML` di-replace ulang menghancurkan semua listener.

create table public.personal_themes (
  id bigserial not null,
  user_id uuid not null,
  name text not null,
  icon text not null default '📚'::text,
  created_at timestamp with time zone not null default now(),
  constraint personal_themes_pkey primary key (id),
  constraint personal_themes_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.personal_favorites (
  id bigserial not null,
  user_id uuid not null,
  hanzi text not null,
  pinyin text not null,
  arti text null,
  word_class text null,
  source text null,
  source_id bigint null,
  created_at timestamp with time zone not null default now(),
  constraint personal_favorites_pkey primary key (id),
  constraint personal_favorites_user_hanzi_key unique (user_id, hanzi),
  constraint personal_favorites_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create table public.personal_decks (
  id bigserial not null,
  theme_id bigint not null,
  title text not null,
  created_at timestamp with time zone not null default now(),
  day_number integer not null default 0,
  is_default boolean null default false,
  description text null,
  created_by uuid null,
  hsk_level integer not null default 1,
  badge text not null default 'PERSONAL'::text,
  sort_order integer not null default 0,
  constraint personal_decks_pkey primary key (id),
  constraint personal_decks_created_by_fkey foreign KEY (created_by) references auth.users (id) on delete CASCADE,
  constraint personal_decks_theme_id_fkey foreign KEY (theme_id) references personal_themes (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists personal_decks_created_by_idx on public.personal_decks using btree (created_by) TABLESPACE pg_default;

create index IF not exists personal_decks_theme_id_idx on public.personal_decks using btree (theme_id) TABLESPACE pg_default;

create index IF not exists personal_decks_hsk_level_idx on public.personal_decks using btree (hsk_level) TABLESPACE pg_default;

create index IF not exists personal_decks_sort_idx on public.personal_decks using btree (created_by, sort_order, id) TABLESPACE pg_default;