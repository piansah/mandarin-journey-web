/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   HISTORY-UI.JS — UI Logic for Search History Dropdown
   ============================================================ */

import { getSearchHistory, updateHistoryStatus } from "./history.js";

export function initHistoryUI() {
  const input = document.getElementById("kos-global-search");
  if (!input) return;

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
    if (
      !e.target.closest(".search-history-container") && 
      !e.target.closest(".search-history-trigger") &&
      e.target !== input
    ) {
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
        <div class="history-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
            <path d="M12 7v5l4 2"></path>
          </svg>
        </div>
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
    const input = document.getElementById("kos-global-search");
    if (input) {
      input.value = query;
      // Trigger search manually if needed
      if (typeof window.onKosGlobalSearch === "function") {
        window.onKosGlobalSearch();
      }
    }
    hideHistoryDropdown();
    if (typeof window.showSegmentedInSearch === "function") {
      window.showSegmentedInSearch(query);
    }
  }
};

window.handleHistoryAction = async function(id) {
  await updateHistoryStatus(id, 'delete');
  showSearchHistoryDropdown();
};

/* ── Expose to window ── */
window.showSearchHistoryDropdown = showSearchHistoryDropdown;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHistoryUI);
} else {
  initHistoryUI();
}
