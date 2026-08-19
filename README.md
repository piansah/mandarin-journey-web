# Mandarin Journey — Documentation & Roadmap

A premium web-based Mandarin learning application ([mandarin-journey.vercel.app](https://mandarin-journey.vercel.app)) designed for mastering HSK 3.0 vocabulary through a Spaced Repetition System (SRS) and Pleco-style exploration.

## 🚀 Tech Stack & Conventions
- **Core**: Vanilla JS (ES Modules), HTML5, CSS3 (Modern Premium Theme).
- **Backend**: Supabase (Database, Auth & Real-time).
- **Navigation Pattern**: Single Page Application (SPA) with History State Management (supporting hardware/mobile/mouse back buttons).
- **UI/UX**: Premium dark mode, glassmorphism, and state-driven micro-animations.

## ✨ Key Features (Implemented)
- **HSK Vocabulary Library**: Full access to HSK 1-9 with level-based progress tracking.
- **SRS Flashcards**: Efficient spaced repetition system with "Memorized/Forgotten" logic.
- **Hanzi Writing Practice (Strict Mode)**: 🛡️
    - **Test Mode**: Hide outlines for memory-based practice.
    - **Penalty System**: Automatic reset after 3 failed strokes for high-stakes learning.
    - **Responsive Canvas**: Smooth scaling across portrait and landscape orientations.
- **Social Rankings & Leagues**: 🐲
    - Competitive tier system (from **Miáo** 🌱 to **Yùhuáng** 🐲).
    - Unified 500 XP per Level system for fair and consistent progress tracking.
- **Personal Decks & Collections**: Create custom themes, organize decks, and add personal/favorite vocabulary.
- **Contextual Reporting**: Integrated feedback system for content errors tied directly to vocabulary metadata.
- **Pleco-Style Interaction**: Deep-dive into vocabulary details via hold-tap/long-press on Hanzi within sentences.
- **Reading & Speaking Practice**: Story mode with auto-scroll and Text-to-Speech (TTS) pronunciation.

---

## 🗺️ Roadmap

### 🧠 Spaced Repetition (SRS) Enhancement
- **Deep Audio Recognition**: Upgrade the voice recognition engine for more accurate speaking practice beyond native browser bots.
- **Audio/Image Assets**: Support for custom media (images/audio) on cards within Personal Decks.

### 🖨️ Printable PDF Writing Sheet Generator
- **Concept**: Automatically generate handwriting practice sheets (Tianzige/Mizige) from Personal Decks or specific themes.
- **Main Features**: 
    - **Auto-populate**: Hanzi, Pinyin, and Definitions.
    - **Stroke Order Diagrams**: Display step-by-step stroke sequences (using SVG data) as a guide on every line.
    - **A4 Optimized**: Precision layouts designed for A4 printing via CSS Print Media.
    - **Smart Selection**: Option to focus printing on "Critical Words" (words frequently missed in SRS).
- **Workflow**: Select Theme -> Click "Print" -> New tab opens with print-ready layout -> Save as PDF or Print.

---
© 2026 Piansah — Mandarin Journey. All rights reserved.



BUG REPORT
- UPDATE DATA SOAL QUIZ KUMULATIF LENGKAPI KALIMMAT DENGAN ARTI