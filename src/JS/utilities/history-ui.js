/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   HISTORY-UI.JS — UI Logic for Search History Dropdown
   ============================================================ */

import { getSearchHistory, updateHistoryStatus } from "./history.js";

export function initHistoryUI() {
  const input = document.getElementById("kos-global-search");
  if (!input) return;

  // Tampilkan history saat fokus atau klik
  const triggerShow = () => showSearchHistoryDropdown();
  input.addEventListener("focus", triggerShow);
  input.addEventListener("click", triggerShow);

  // Auto-hide saat mulai mengetik
  input.addEventListener("input", () => {
    if (input.value.trim().length > 0) {
      hideHistoryDropdown();
    } else {
      showSearchHistoryDropdown();
    }
  });

  // Sembunyikan history saat klik di luar
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-history-container") && e.target !== input) {
      hideHistoryDropdown();
    }
  });
}

export async function showSearchHistoryDropdown() {
  const input = document.getElementById("kos-global-search");
  if (!input || input.value.trim().length > 0) return;

  const parent = input.parentElement;
  if (!parent) return;

  hideHistoryDropdown();

  const history = await getSearchHistory() || [];
  if (history.length === 0) return;

  const container = document.createElement("div");
  container.className = "search-history-container";
  
  let html = `
    <div class="history-header">
      <span>Pencarian Terakhir</span>
    </div>
    <div class="history-list">
  `;

  history.forEach(item => {
    const safeQuery = (item.query || "").replace(/'/g, "\\'");
    html += `
      <div class="history-item" onclick="window.useSearchHistory('${safeQuery}')">
        <div class="history-icon">🕒</div>
        <div class="history-text">${item.query}</div>
        <div class="history-actions">
          <button class="h-action-btn del" onclick="event.stopPropagation(); window.handleHistoryAction('${item.id}')">✕</button>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
  parent.appendChild(container);
}

export function hideHistoryDropdown() {
  const old = document.querySelector(".search-history-container");
  if (old) old.remove();
}

window.useSearchHistory = function(query) {
  if (query) {
    hideHistoryDropdown();
    if (typeof window.showSegmentedInSearch === "function") {
      window.showSegmentedInSearch(query);
    }
  }
};

window.handleHistoryAction = async function(id) {
  if (typeof window.updateHistoryStatus === "function") {
    await window.updateHistoryStatus(id, 'delete');
    showSearchHistoryDropdown();
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHistoryUI);
} else {
  initHistoryUI();
}
