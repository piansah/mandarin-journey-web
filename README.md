# Mandarin Journey — Dokumentasi & Roadmap

Aplikasi belajar Mandarin berbasis web (mandarin-journey.vercel.app) yang dirancang untuk penguasaan kosa kata HSK 3.0 melalui sistem Spaced Repetition (SRS) dan eksplorasi kosa kata ala Pleco.

## 🚀 Tech Stack & Konvensi
- **Core**: Vanilla JS (ES Modules), HTML5, CSS3 (Modern Theme).
- **Backend**: Supabase (Database & Auth).
- **Pola Navigasi**: Single Page Application (SPA) dengan History State Management (mendukung tombol back hardware/mobile/mouse).
- **UI/UX**: Dark mode premium, glassmorphism, dan animasi mikro berbasis state.

## ✨ Fitur Utama (Implemented)
- **HSK Vocabulary Library**: Akses lengkap HSK 1-9 dengan progres per level.
- **SRS Flashcards**: Sistem belajar berulang dengan status "Hafal/Lupa" untuk efisiensi memori.
- **Personal Deck & Collection**: User bisa membuat kategori tema, deck, dan menambahkan kosa kata favorit atau pribadi.
- **Contextual Bug & Content Reporting**: Sistem pelaporan kesalahan konten yang terintegrasi langsung dengan metadata kosa kata.
- **Pleco-Style Interaction**: Navigasi detail kosa kata melalui hold-tap pada Hanzi di dalam kalimat.
- **Reading & Speaking Practice**: Mode cerita dengan auto-scroll dan latihan pengucapan (TTS).

---

## 🗺️ Rencana Pengembangan (Roadmap)

### 🧠 Spaced Repetition (SRS) Enhancement
- **Simple Gradiasi (Hafal / Lupa)**: Mempertahankan sistem 2 tombol untuk memudahkan pengambilan keputusan cepat.
- **Statistik Retensi (Memory Health)**: Visualisasi kesehatan ingatan user (contoh: "500 Kata Matang", "100 Kata Rentan/Hampir Lupa").
- **Import/Export Personal Deck**: Memungkinkan user pro untuk mengelola database kata mereka sendiri via CSV.
- **Deep Audio Recognition**: Upgrade engine pengenalan suara untuk latihan speaking agar lebih akurat dan tidak hanya bergantung pada bot bawaan browser.
- **Audio/Image Assets**: Dukungan untuk menambahkan gambar atau audio kustom pada kartu di Personal Deck.


Statistik Retensi & "Memory Health" (Ala Anki/Pleco)
Problem: Statistik kita sekarang masih fokus ke "Berapa banyak yang sudah dipelajari" dan "XP/Level".
Analisis: Anki hebat karena dia kasih tahu "Memory Health". Kita belum punya visualisasi yang kasih tahu: "Ada 50 kata yang kritis (hampir lupa) dalam 24 jam ke depan".
Saran: Tambahkan grafik "Forgetting Curve" atau "Retention Rate" di statistic.js. Kasih lihat ke user persentase keberhasilan mereka menjawab kartu di pertemuan pertama vs pertemuan ke-X.

Hanzi Feedback Loop (Hanzi.js)
Problem: Saat latihan menulis Hanzi (tulis-hanzi.js), sistem kita sangat "pemaaf".
Analisis: Di Pleco, ada mode "Test Mode" di mana garis panduannya hilang total. Kita sekarang masih terlalu banyak kasih "bantuan" visual.
Saran: Tambahkan "Strict Mode" di latihan menulis. User harus bener-bener hafal urutan stroke tanpa bayangan abu-abu di bawahnya.
