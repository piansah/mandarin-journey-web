# Mandarin Journey — Dokumentasi & Roadmap

Aplikasi belajar Mandarin berbasis web (mandarin-journey.vercel.app) untuk penguasaan kosa kata HSK 3.0.

## 🚀 Tech Stack & Konvensi
- **Core**: Vanilla JS (ES Modules), HTML5, CSS3.
- **Backend**: Supabase (Database & Auth).
- **Data Source**: Local `dictionary.json` (Berisi data dekomposisi, etimologi, dan radikal).
- **Pola Navigasi**: SPA dengan History State Management (Back button support).
- **Gamifikasi**: Sistem Liga Tier & Leaderboard XP.

## ✨ Fitur Utama (Implemented)
- **HSK Vocabulary & SRS Flashcards**: Drills kosa kata dengan sistem Hafal/Lupa (SM-2).
- **Hanzi Decomposition**: Analisis komponen pembentuk karakter di detail kosa kata (Tab Karakter).
- **Personal Deck & Collection**: Manajemen tema, deck pribadi, dan kosa kata favorit.
- **Contextual Bug Reporting**: Pelaporan kesalahan konten langsung dari kosa kata terkait.
- **Pleco-Style Interaction**: Hold-tap Hanzi dalam kalimat untuk melihat detail.

---

## 🗺️ Rencana Pengembangan (Roadmap)

### 📈 Smart Learning & Data Visualization
- ~~**Statistik Retensi (Memory Health)**: Visualisasi "Kesehatan Memori" berdasarkan histori jawaban di `user_scores` untuk menunjukkan kartu yang sudah matang (Mature) vs yang masih dipelajari (Learning).~~ ✅ **(Implemented)**
- **Etimologi Hanzi Integration**: Menampilkan data filosofi/asal-usul karakter dari field `etymology` di `dictionary.json` (Data sudah ada, tinggal implementasi UI).
- **AI Example Generator**: Pembuatan contoh kalimat otomatis yang natural untuk kosa kata baru di Personal Deck menggunakan AI.

### 🛡️ Stabilitas & Performa (Recent Fixes)
- **Race Condition Prevention**: Implementasi LoadId guards dan Promise-based loading pada Quiz & Hanzi list untuk memastikan UI tetap stabil saat navigasi cepat. ✅
- **Profile UI Modernization**: Restrukturisasi grid statistik profil menjadi 2x2 dengan akses detail statistik tiap kategori. ✅

### 🎙️ Audio & Multimedia Enhancement
- **Deep Audio Recognition**: Peningkatan akurasi latihan pengucapan agar memberikan feedback yang lebih presisi (Upgrade dari standar Speech API).
- **Audio/Image Assets**: Dukungan untuk melampirkan gambar atau rekaman audio kustom pada kartu di Personal Deck.

### 🔍 Advanced Input & Tools
- **Handwriting Search**: Fitur input tulisan tangan pada menu pencarian untuk membantu menemukan Hanzi yang tidak diketahui Pinyin-nya.
- **OCR Scanner**: Pemindaian Hanzi secara real-time melalui kamera perangkat untuk pembacaan teks instan.
- **Batch Import/Export**: Fitur impor/ekspor data Personal Deck via CSV untuk manajemen data masal.