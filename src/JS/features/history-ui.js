/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   HISTORY-UI.JS — UI Logic for Search History Dropdown
   ============================================================ */

import { getSearchHistory, updateHistoryStatus } from "./history.js";

export function initHistoryUI() {
  const input = document.getElementById("kos-global-search");
  if (!input) return;

  // Tampilkan history saat fokus
  input.addEventListener("focus", () => showSearchHistoryDropdown());

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
    html += `
      <div class="history-item" onclick="window.useSearchHistory('${item.query.replace(/'/g, "\\'")}')">
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

// Global Handlers
window.useSearchHistory = function(query) {
  const input = document.getElementById("kos-global-search");
  if (input) {
    input.value = query;
    hideHistoryDropdown();
    if (typeof window.onKosGlobalSearch === "function") {
        window.onKosGlobalSearch();
    }
  }
};

window.handleHistoryAction = async function(id) {
  await updateHistoryStatus(id, 'delete');
  showSearchHistoryDropdown();
};

// Auto Init
document.addEventListener("DOMContentLoaded", initHistoryUI);
