/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   HISTORY-RESULTS.JS — Rendering segmented history in Search UI
   ============================================================ */

import { colorPy } from "./pinyin.js";

export function showSegmentedInSearch(query) {
  const resultsEl = document.getElementById("kos-global-results");
  const input = document.getElementById("kos-global-search");
  const deckSection = document.getElementById("kos-deck-section");
  const hskFilter = document.getElementById("hsk-filter-kos");

  if (!resultsEl || !input) return;

  // 1. Setup UI
  input.value = query;
  resultsEl.style.display = "block";
  resultsEl.innerHTML = `<div class="loading-state" style="padding: 20px; text-align: center; color: var(--dim)">Memecah kalimat...</div>`;
  
  if (deckSection) deckSection.style.display = "none";
  if (hskFilter) hskFilter.style.display = "none";

  // 2. Gunakan mesin pemecah kata dari OCR
  if (typeof window._segmentText === "function") {
    const words = window._segmentText(query);
    window._globalResults = words; // Untuk click handler jika dibutuhkan

    let html = `
      <div class="search-sentence-context" onclick="window.speakMandarin('${query.replace(/'/g, "\\'")}')" style="animation: fadeIn 0.3s ease-out">
        <div class="ssc-label">KONTEKS KALIMAT</div>
        <div class="ssc-text">${query}</div>
      </div>
      <div style="font-size: 11px; color: var(--dim); margin-bottom: 12px; padding-left: 20px">KOSAKATA DITEMUKAN:</div>
      <div id="kos-global-list" style="display:flex;flex-direction:column;gap:6px;padding:0 16px 80px;">
    `;

    if (words.length === 0) {
        html += `<div style="text-align: center; padding: 40px; color: var(--dim)">Tidak ada kata yang dikenali.</div>`;
    }

    words.forEach((w, idx) => {
      if (w.found) {
        const hskVal = w.hsk_level || w.hsk || 1;
        const badgeLabel = w.badge === "common" ? "Common" : (w.badge === "native" ? "Native" : `HSK ${hskVal}`);
        const badgeClass = w.badge === "common" ? "badge-common" : (w.badge === "native" ? "badge-native" : "badge-hsk");
        
        html += `
          <div class="kos-item" onclick="window.openKosWordFromGlobal('${idx}')" style="cursor:pointer; animation: slideUp 0.3s ease-out forwards">
            <div class="kos-hz">${w.hanzi}</div>
            <div class="kos-info">
              <div class="kos-py">${colorPy(w.pinyin)}</div>
              <div class="kos-arti">${w.arti}</div>
            </div>
            <div class="kos-meta">
              <span class="${badgeClass}">${badgeLabel}</span>
            </div>
          </div>
        `;
      }
    });

    html += `</div>`;
    resultsEl.innerHTML = html;
  } else {
    resultsEl.innerHTML = `<div style="padding: 20px; color: var(--red)">Mesin OCR belum siap. Silakan buka menu OCR sekali untuk inisialisasi.</div>`;
  }
}

window.showSegmentedInSearch = showSegmentedInSearch;
