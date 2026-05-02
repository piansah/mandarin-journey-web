/* ============================================================
   MAIN.JS — Entry Point Mandarin Journey
   © 2026 Piansah — Mandarin Journey. All rights reserved.
   ============================================================ */
/* ── CSS ── */
import "./CSS/base.css";
import "./CSS/utils.css";
import "./CSS/layers.css";
import "./CSS/auth.css";
import "./CSS/kosakata.css";
import "./CSS/onboarding.css";
import "./CSS/tour.css";
import "./CSS/navbar.css";
import "./CSS/dashboard.css";
import "./CSS/level.css";
import "./CSS/quiz.css";
import "./CSS/hanzi.css";
import "./CSS/kalimat.css";
import "./CSS/flashcard.css";
import "./CSS/grammar.css";
import "./CSS/cerita.css";
import "./CSS/speaking.css";
import "./CSS/nada.css";
import "./CSS/tulis-hanzi.css";
import "./CSS/srs-dashboard.css";
import "./CSS/profile.css";
import "./CSS/sosial.css";
import "./CSS/avatar.css";
import "./CSS/done-screen.css";
import "./CSS/search.css";
import "./CSS/personal-deck.css";
import "./CSS/app-init.css";
import "./CSS/report.css";
/* ── Icons ── */
import "/src/assets/icon.js";
/* ── JS: Core (config harus paling pertama) ── */
import "./JS/core/config.js";
import "./JS/core/auth.js";
import "./JS/core/navigation.js";
import "./JS/core/level.js";
import "./JS/core/done-screen.js";
/* ── JS: Utilities ── */
import "./JS/utilities/helpers.js";
import "./JS/utilities/pinyin.js";
import "./JS/utilities/tts.js";
import "./JS/utilities/sfx.js";
import "./JS/utilities/screen-anim.js";
import "./JS/utilities/xp.js";
import "./JS/utilities/stats-api.js";
import "./JS/utilities/tier-unlock.js";
/* ── JS: Features ── */
import "./JS/features/avatar.js";
import "./JS/features/dashboard.js";
import "./JS/features/quiz.js";
import "./JS/features/kalimat.js";
import "./JS/features/hanzi.js";
import "./JS/features/flashcard.js";
import "./JS/features/kosakata.js";
import "./JS/features/grammar.js";
import "./JS/features/cerita.js";
import "./JS/features/nada.js";
import "./JS/features/speaking.js";
import "./JS/features/tulis-hanzi.js";
import "./JS/features/personal-deck.js";
import "./JS/features/profile.js";
import "./JS/features/sosial.js";
import { initBugReportFAB } from "./JS/features/report.js";
/* ── JS: App Screens ── */
import "./JS/app/onboarding.js";
/* ── JS: App Init (paling akhir) ── */
import "./JS/app/app-init.js";
import "./JS/app/pwa-install.js";
/* ── Service Worker ── */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/service-worker.js")
      .then((reg) => console.log("SW registered:", reg.scope))
      .catch((err) => console.warn("SW registration failed:", err));
  });
}
