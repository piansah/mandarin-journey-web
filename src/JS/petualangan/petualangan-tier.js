/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   PETUALANGAN-TIER.JS — Tier switching, dropdown, skip modal
   ============================================================ */

const TIER_ORDER = ["pemula", "menengah", "lanjut", "master", "fasih"];
const TIER_LABEL = {
  pemula: "Tingkat Pemula",
  menengah: "Tingkat Menengah",
  lanjut: "Tingkat Lanjut",
  master: "Tingkat Master",
  fasih: "Tingkat Fasih",
};
const TIER_HSK = {
  pemula: "HSK 1–2",
  menengah: "HSK 3",
  lanjut: "HSK 4",
  master: "HSK 5",
  fasih: "HSK 6",
};

let _currentTier = "pemula";
let _tierUnlocked = {
  pemula: true,
  menengah: false,
  lanjut: false,
  master: false,
  fasih: false,
};
let _pendingSkipTier = null;

export function getCurrentTier() {
  return _currentTier;
}

export function getTierUnlocked() {
  return { ..._tierUnlocked };
}

export function setCurrentTier(tier) {
  _currentTier = tier;
}

export function setTierUnlocked(unlocked) {
  _tierUnlocked = { ..._tierUnlocked, ...unlocked };
}

export function _syncDropdownState() {
  const labelEl = document.getElementById("pet-tier-toggle-label");
  if (labelEl) labelEl.textContent = TIER_LABEL[_currentTier];

  document.querySelectorAll(".pet-tier-opt").forEach((btn) => {
    const tier = btn.dataset.tier;
    const isActive = tier === _currentTier;
    const isUnlocked = !!_tierUnlocked[tier];

    btn.classList.toggle("active", isActive);
    btn.classList.toggle("unlocked", isUnlocked);

    const check = btn.querySelector(".pet-tier-opt-check");
    if (check) check.style.opacity = isActive ? "1" : "0";

    const lockEl = btn.querySelector(".pet-tier-opt-lock");
    if (lockEl) lockEl.style.display = !isActive && !isUnlocked ? "" : "none";
  });
}

export function _petToggleDropdown() {
  const header = document.getElementById("pet-tier-header");
  if (!header) return;
  const isOpen = header.classList.toggle("open");

  if (isOpen) {
    setTimeout(() => {
      document.addEventListener("click", _petDropdownOutside, {
        once: true,
        capture: true,
      });
    }, 0);
  }
}

export function _petDropdownOutside(e) {
  const header = document.getElementById("pet-tier-header");
  if (header && !header.contains(e.target)) {
    header.classList.remove("open");
  }
}

export function _closeDropdown() {
  const header = document.getElementById("pet-tier-header");
  if (header) header.classList.remove("open");
}

export function _petSwitchTier(tier) {
  _closeDropdown();

  if (tier === _currentTier) return;

  if (!_tierUnlocked[tier]) {
    _pendingSkipTier = tier;
    const body = document.getElementById("pet-skip-body");
    if (body)
      body.textContent = `Kamu belum menyelesaikan tier sebelumnya. Jika dilanjutkan, kamu akan langsung masuk ke ${TIER_LABEL[tier]} (${TIER_HSK[tier]}). Unit di dalam tier tetap harus diselesaikan satu per satu dari awal.`;
    const modal = document.getElementById("pet-skip-modal");
    if (modal) {
      document.body.appendChild(modal); // ← pindah ke body, keluar dari stacking context
      modal.style.display = "flex";
    }
    return;
  }

  _applyTierSwitch(tier);
}

export function _petSkipCancel() {
  _pendingSkipTier = null;
  const modal = document.getElementById("pet-skip-modal");
  if (modal) modal.style.display = "none";
  _syncDropdownState();
}

export async function _petSkipConfirm() {
  if (!_pendingSkipTier) return;

  if (typeof window._unlockTier === "function") {
    // Unlock semua tier dari yang pertama locked sampai tier yang dipilih
    const targetIdx = TIER_ORDER.indexOf(_pendingSkipTier);
    for (let i = 0; i <= targetIdx; i++) {
      const tier = TIER_ORDER[i];
      if (!_tierUnlocked[tier]) {
        await window._unlockTier(tier);
        _tierUnlocked[tier] = true; // sync local state langsung
      }
    }
  }

  _applyTierSwitch(_pendingSkipTier);
  _petSkipCancel();
}

export function _applyTierSwitch(tier) {
  _currentTier = tier;
  // Pastikan semua tier sampai tier ini tampil unlocked di dropdown
  const targetIdx = TIER_ORDER.indexOf(tier);
  for (let i = 0; i <= targetIdx; i++) {
    _tierUnlocked[TIER_ORDER[i]] = true;
  }
  _syncDropdownState();
  if (typeof window.renderPetualanganPath === "function") {
    window.renderPetualanganPath();
  }
}

/* ══════════════════════════════════════════
   BRIDGE — dipanggil oleh tier-unlock.js
   untuk sync state setelah unlock dari luar
══════════════════════════════════════════ */
export function _setTierUnlockedFromGlobal(unlocked) {
  _tierUnlocked = { ..._tierUnlocked, ...unlocked };
  _syncDropdownState();
}

window._setTierUnlockedFromGlobal = _setTierUnlockedFromGlobal;
