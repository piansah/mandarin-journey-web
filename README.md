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

### Konvensi lain

- Semua fungsi yang perlu diakses dari HTML harus di-assign ke `window.X = X` di bagian bawah file
- UI text seluruhnya dalam **Bahasa Indonesia**
- CSS dark theme variables: `--bg`, `--sur`, `--sur2`, `--txt`, `--dim`, `--dim2`, `--gold`, `--bdr`
- Layer navigation: `openLayer(id)` / `closeLayer(id)` — layer adalah div `.layer` yang di-show/hide
- Word list item menggunakan class `.kos-item` yang sudah ada di kosakata.css
- Anti double-bind: gunakan `cloneNode(true)` + `replaceChild()` bukan `dataset.bound`

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
│                        └── list kata favorit (.kos-item style)
│                            tap kata → openKosWord(card)
│
└── [Deck Personal] ──→ layer-personal-themes
                           └── grid tema (tap tema)
                                └── layer-personal-decks
                                      ├── [state A] list deck
                                      │     tap deck → state B
                                      └── [state B] isi deck (kata-kata)
                                            tap kata → openKosWord(card)
```

**Catatan navigasi penting:**

- `layer-personal-decks` memiliki **dua state header** yang di-toggle:
  - `#pd-hd-decklist` — tampil saat di list deck, berisi tombol `＋` untuk tambah deck baru
  - `#pd-hd-cards` — tampil saat di dalam deck, berisi judul deck + jumlah kata + tombol `＋` untuk tambah kata
- Tidak ada navigasi baru saat masuk ke isi deck — cukup hide/show elemen dalam layer yang sama
- Tombol back di `#pd-hd-cards` → kembali ke list deck (bukan tutup layer)

---

## Spesifikasi UI

### Section "Koleksi Saya" di Profile

Ditempatkan di bawah grid 6 stat, di atas section "Lencana Diraih".

```
KOLEKSI SAYA
┌──────────────────────────────────┐
│ ❤️  Kata Favorit             ❯  │
├──────────────────────────────────┤
│ 📚  Deck Personal            ❯  │
└──────────────────────────────────┘
```

Karena section ini di-render via `innerHTML` di `profile.js`, tombol-tombol di dalamnya **tidak boleh menggunakan `onclick` string inline**. Gunakan ID unik (`pd-btn-open-favorites`, `pd-btn-open-themes`) lalu attach event listener via `bindKoleksiButtons()` yang dipanggil setelah render selesai.

### Layer: Kata Favorit (`layer-favorites`)

- Header: "❤️ Kata Favorit" + back button
- List kata menggunakan `.kos-item` style yang sudah ada
- Tiap item: hanzi, `colorPy(pinyin)`, arti, badge word class
- Tap → `openKosWord(card)`
- Long press → `speakMandarin(hanzi)`
- Empty state: icon besar + teks "Belum ada kata favorit" + sub "Buka detail kata lalu ketuk tombol hati."

### Layer: Pilih Tema (`layer-personal-themes`)

- Header: "📚 Deck Personal" + back button
- Form "+ Tema Baru" selalu tampil di atas: input nama + emoji picker (grid ~20 emoji) + tombol simpan
- Grid tema: setiap tema tampil sebagai card dengan gradient background (6 preset gradient, cycle)
  - Isi card: emoji besar, nama tema, jumlah deck
  - Tap → masuk ke `layer-personal-decks` untuk tema itu
  - Long press → konfirmasi hapus tema (cascade hapus deck + kata)

### Layer: Deck Personal (`layer-personal-decks`)

**State A — List Deck:**

- Header `#pd-hd-decklist`: judul tema (icon + nama) + back button + tombol `＋` di kanan
- Tombol `＋` → buka bottom-sheet modal `#pd-add-deck-modal`
- List deck: setiap deck tampil sebagai card `.item-card`
  - Isi: badge "PERSONAL", jumlah kata, judul deck, waktu dibuat, tombol "Buka"
  - Tap card atau tap "Buka" → masuk State B
  - Long press card → konfirmasi hapus deck (cascade hapus kata)
- Empty state: "Belum ada deck. Ketuk ＋ untuk membuat deck baru."

**State B — Isi Deck:**

- Header `#pd-hd-cards`: judul deck + jumlah kata sebagai subtitle + back button (→ kembali State A) + tombol `＋` di kanan
- Tombol `＋` → buka bottom-sheet modal `#pd-add-card-modal` (search kata)
- List kata menggunakan `.kos-item` style
  - Tap → `openKosWord(card)`
  - Long press → konfirmasi hapus kata dari deck
- Empty state: "Belum ada kata. Ketuk ＋ untuk menambahkan kata."

**Modal: Tambah Deck (`#pd-add-deck-modal`):**

- Bottom-sheet overlay (fixed, z-index tinggi)
- Drag bar di atas
- Input judul deck + tombol "Tambah Deck"
- Enter key juga submit
- Setelah berhasil: tutup modal, refresh list deck

**Modal: Tambah Kata ke Deck (`#pd-add-card-modal`):**

- Bottom-sheet overlay
- Search bar: cari dari `flashcard_cards` dan `word_compounds` (debounce 300ms)
- Hasil pencarian: tiap item tampil hanzi + `colorPy(pinyin)` + arti + tombol "＋ Tambah"
- Tap "＋ Tambah" → insert ke `personal_cards` untuk deck yang sedang aktif → update jumlah kata di header

### Toggle Favorit di Detail Kata

Di `kosakata.js`, fungsi `_renderHero()` perlu ditambahkan tombol ❤️:

- Saat pertama load: cek `personal_favorites` apakah kata ini sudah difavoritkan
- Jika ya: tampilkan ❤️ (filled), tap → hapus dari favorit
- Jika tidak: tampilkan 🤍 (empty), tap → tambah ke favorit
- `source`: `'hsk'` jika card punya `set_id`, `'compound'` jika dari `word_compounds`

---

## File yang Perlu Dibuat / Dimodifikasi

### 1. `personal-deck.js` (file baru)

Fungsi yang harus ada:

```js
renderKoleksiSection(); // return HTML string untuk section di profile
bindKoleksiButtons(); // attach event listener ke tombol koleksi (dipanggil setelah profile render)
renderFavorites(); // load + render personal_favorites ke #favorites-list
toggleFavorite(card); // insert/delete personal_favorites, return boolean isFavorited
isFavorited(hanzi); // cek apakah hanzi sudah difavoritkan, return boolean
renderThemes(); // load + render personal_themes ke #pd-theme-grid
createTheme(name, icon); // insert ke personal_themes
openTheme(themeId, themeData); // switch layer ke personal-decks, set state aktif
renderDecks(themeId); // load + render personal_decks, switch ke State A
openDeck(deckId, title); // load personal_cards, switch ke State B
pdBackToDecks(); // kembali dari State B ke State A
pdShowAddDeckModal(); // tampilkan #pd-add-deck-modal
pdHideAddDeckModal(); // sembunyikan #pd-add-deck-modal
pdShowAddCardModal(); // tampilkan #pd-add-card-modal
pdHideAddCardModal(); // sembunyikan #pd-add-card-modal
addDeck(themeId, title); // insert personal_decks, close modal, refresh
addCard(deckId, cardData); // insert personal_cards, close modal, update count
deleteTheme(id); // delete personal_themes
deleteDeck(id); // delete personal_decks
deleteCard(id); // delete personal_cards
bindPersonalDeckActions(); // bind semua tombol di layer-personal-themes & layer-personal-decks
```

### 2. `index.html`

Tambahkan layer-layer berikut di dalam container layer yang sudah ada:

```html
<!-- Layer: Kata Favorit -->
<div class="layer" id="layer-favorites">
  <div class="layer-hd">
    <div class="btn-back" onclick="window.closeLayer('layer-favorites')">
      ❮❮
    </div>
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
    <div class="btn-back" onclick="window.closeLayer('layer-personal-themes')">
      ❮❮
    </div>
    <div>
      <div class="layer-title">📚 Deck Personal</div>
      <div class="layer-sub">Kelola tema deck belajarmu</div>
    </div>
  </div>
  <div class="layer-body">
    <div class="layer-sec">
      <!-- Form tema baru -->
      <div class="pd-form-card">
        <div class="pd-form-title">+ Tema Baru</div>
        <input
          id="pd-theme-name"
          class="pd-input"
          placeholder="Nama tema (contoh: Makanan)"
        />
        <div id="pd-emoji-grid" class="pd-emoji-grid"></div>
        <button id="pd-btn-add-theme" class="pd-btn-main">Simpan Tema</button>
      </div>
      <!-- Grid tema -->
      <div id="pd-theme-grid" class="pd-theme-grid"></div>
    </div>
  </div>
</div>

<!-- Layer: Deck Personal per Tema -->
<div class="layer" id="layer-personal-decks">
  <!-- Header: state list deck -->
  <div class="layer-hd" id="pd-hd-decklist">
    <div
      class="btn-back"
      onclick="window.closeLayer('layer-personal-decks',true);window.backToLayer('layer-personal-themes')"
    >
      ❮❮
    </div>
    <div style="flex:1">
      <div class="layer-title" id="pd-decks-theme-title">📚 Deck Personal</div>
      <div class="layer-sub">Pilih deck untuk melihat isi kata</div>
    </div>
    <button
      onclick="window.pdShowAddDeckModal()"
      style="background:var(--gold);color:#000;border:none;border-radius:10px;padding:6px 14px;font-weight:700;font-size:13px;cursor:pointer;flex-shrink:0;"
    >
      ＋ Deck
    </button>
  </div>
  <!-- Header: state dalam deck -->
  <div class="layer-hd" id="pd-hd-cards" style="display:none">
    <div class="btn-back" onclick="window.pdBackToDecks()">❮❮</div>
    <div style="flex:1">
      <div class="layer-title" id="pd-selected-deck-title">Deck</div>
      <div class="layer-sub" id="pd-selected-deck-count">0 kata</div>
    </div>
    <button
      onclick="window.pdShowAddCardModal()"
      style="background:var(--sur2);color:var(--gold);border:1px solid var(--bdr);border-radius:10px;padding:6px 14px;font-weight:700;font-size:13px;cursor:pointer;flex-shrink:0;"
    >
      ＋ Kata
    </button>
  </div>
  <!-- Body -->
  <div class="layer-body">
    <div class="layer-sec">
      <div id="pd-deck-grid" class="kos-deck-grid"></div>
      <div id="pd-cards-wrap" style="display:none">
        <div
          id="pd-cards-list"
          class="pd-list-wrap"
          style="margin-bottom:20px;"
        ></div>
      </div>
    </div>
  </div>
</div>

<!-- Modal: Tambah Deck Baru -->
<div
  id="pd-add-deck-modal"
  style="display:none;position:fixed;inset:0;z-index:1200;"
>
  <div
    style="position:absolute;inset:0;background:rgba(0,0,0,0.55);"
    onclick="window.pdHideAddDeckModal()"
  ></div>
  <div
    style="position:absolute;bottom:0;left:0;right:0;background:var(--sur);border-radius:20px 20px 0 0;padding:20px 16px 36px;max-width:480px;margin:0 auto;"
  >
    <div
      style="width:36px;height:4px;background:var(--bdr);border-radius:2px;margin:0 auto 18px;"
    ></div>
    <div class="pd-form-title">+ Deck Baru</div>
    <input
      id="pd-deck-title-input"
      class="pd-input"
      placeholder="Judul deck (contoh: Kata kerja harian)"
    />
    <button id="pd-btn-add-deck" class="pd-btn-main" style="margin-top:4px;">
      Tambah Deck
    </button>
  </div>
</div>

<!-- Modal: Tambah Kata ke Deck -->
<div
  id="pd-add-card-modal"
  style="display:none;position:fixed;inset:0;z-index:1200;"
>
  <div
    style="position:absolute;inset:0;background:rgba(0,0,0,0.55);"
    onclick="window.pdHideAddCardModal()"
  ></div>
  <div
    style="position:absolute;bottom:0;left:0;right:0;background:var(--sur);border-radius:20px 20px 0 0;padding:20px 16px 36px;max-width:480px;margin:0 auto;"
  >
    <div
      style="width:36px;height:4px;background:var(--bdr);border-radius:2px;margin:0 auto 18px;"
    ></div>
    <div class="pd-form-title">🔍 Cari &amp; Tambah Kata</div>
    <input
      id="pd-card-search"
      class="pd-input"
      placeholder="Cari Hanzi, Pinyin, atau Arti..."
      autocomplete="off"
    />
    <div
      id="pd-card-search-results"
      class="pd-search-results-mini"
      style="margin-top:8px;"
    ></div>
  </div>
</div>
```

### 3. `profile.js`

Tambahkan import:

```js
import {
  renderKoleksiSection,
  bindKoleksiButtons,
  bindPersonalDeckActions,
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

Di fungsi `_renderHero()`, tambahkan tombol favorit:

```js
// Di dalam HTML hero, setelah pinyin/arti
<button id="kos-fav-btn" class="kos-fav-btn" aria-label="Favorit">
  🤍
</button>
```

Setelah render hero, cek status favorit:

```js
isFavorited(card.hanzi).then((faved) => {
  const btn = document.getElementById("kos-fav-btn");
  if (btn) btn.textContent = faved ? "❤️" : "🤍";
});
```

Bind tombol:

```js
document.getElementById("kos-fav-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("kos-fav-btn");
  const nowFaved = await toggleFavorite(currentCard);
  if (btn) btn.textContent = nowFaved ? "❤️" : "🤍";
});
```

### 5. CSS (tambahkan ke `profile.css` atau file CSS baru `personal-deck.css`)

Class-class baru yang dibutuhkan:

```
.pd-menu-card         — container tombol koleksi (border-radius, border, background)
.pd-menu-row          — baris tombol (full width, flex, space-between, padding)
.pd-theme-grid        — grid 2 kolom untuk kartu tema
.pd-theme-card        — kartu tema (gradient bg, flex column, center)
.pd-theme-icon        — emoji besar (font-size: 32px)
.pd-theme-name        — nama tema (font-weight: 700)
.pd-theme-count       — jumlah deck (opacity: 0.8, font-size kecil)
.pd-form-card         — card form (background: var(--sur2), border, border-radius, padding)
.pd-form-title        — label section form (uppercase, font kecil, gold/dim)
.pd-input             — input field (full width, dark bg, border, border-radius, padding)
.pd-btn-main          — tombol utama (full width, gold bg, hitam, bold)
.pd-emoji-grid        — grid 6 kolom untuk emoji picker
.pd-emoji-btn         — tombol emoji (square, border, border-radius)
.pd-emoji-btn.active  — border gold, background gold transparan
.pd-search-results-mini — container hasil search (max-height: 240px, overflow-y: auto)
.pd-search-item       — baris hasil search (flex, space-between, border-bottom)
.pd-search-hz         — hanzi di hasil search (font-hanzi, font besar)
.pd-search-add        — tombol tambah (gold border, gold color, kecil)
.pd-list-wrap         — flex column, gap 8px
.pd-loading           — loading state (center, gap, spinner)
.pd-empty             — empty state (center, opacity dim)
.pd-empty-icon        — icon besar di empty state
.pd-empty-title       — judul empty state
.pd-empty-sub         — subtitle empty state
.pd-word-class        — badge kelas kata (font kecil, dim)
.kos-fav-btn          — tombol favorit di detail kata (ukuran 28px, no border)
```

---

## Catatan Implementasi Penting

1. **Anti double-bind**: Selalu gunakan `element.cloneNode(true)` + `parentNode.replaceChild(fresh, old)` lalu `fresh.addEventListener(...)`. Jangan gunakan `dataset.bound` — tidak reliable setelah `innerHTML` di-replace.

2. **bindKoleksiButtons()**: Harus dipanggil setiap kali `_renderProfileFull()` selesai, karena `innerHTML` yang di-set ulang menghancurkan semua listener sebelumnya. Karena pakai cloneNode, aman dipanggil berkali-kali.

3. **bindPersonalDeckActions()**: Dipanggil dari `openTheme()` setelah layer terbuka, dan dari `renderDecks()` setelah list deck dirender. Juga pakai cloneNode.

4. **State header layer-personal-decks**: Dua div header (`pd-hd-decklist` dan `pd-hd-cards`) di-toggle display flex/none. Jangan gunakan satu header yang kontennya diganti — lebih rawan bug.

5. **openDeck()**: Tidak membuka layer baru. Cukup hide `pd-deck-grid`, show `pd-cards-wrap`, switch header ke `pd-hd-cards`.

6. **pdBackToDecks()**: Reset `_activeDeckId` dan `_activeDeckCards`, lalu panggil `renderDecks()` untuk refresh list (karena mungkin ada perubahan jumlah kata).

7. **Search debounce**: 300ms. Cari di dua tabel sekaligus (`Promise.all`): `flashcard_cards` dan `word_compounds`.
