/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   PWA-INSTALL.JS — Install prompt handler
   ============================================================ */
const DISMISS_KEY = "pwa-install-dismissed-at";
const ICON_PATH = "/src/assets/icons/icon-192.png";
let _deferredPrompt = null;

/* ── Event: browser siap menawarkan install ── */
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  _deferredPrompt = e;
  _showInstallBanner();
});

/* ── Event: user sudah install lewat jalur lain ── */
window.addEventListener("appinstalled", () => {
  _deferredPrompt = null;
  _hideInstallBanner();
});

/* ── Tampilkan banner ── */
function _showInstallBanner() {
  // Sudah berjalan sebagai standalone (sudah diinstall)
  if (window.matchMedia("(display-mode: standalone)").matches) return;

  // Cek apakah user dismiss dalam 24 jam terakhir
  const dismissedAt = localStorage.getItem(DISMISS_KEY);
  if (dismissedAt && Date.now() - Number(dismissedAt) < 86_400_000) return;

  // Sudah ada banner
  if (document.getElementById("pwa-install-banner")) return;

  const banner = document.createElement("div");
  banner.id = "pwa-install-banner";
  banner.innerHTML = `
    <div class="pwa-banner-left">
      <div class="pwa-banner-text">
        <div class="pwa-banner-title">Install Mandarin Journey</div>
        <div class="pwa-banner-sub">Akses lebih cepat tanpa browser</div>
      </div>
    </div>
    <div class="pwa-banner-actions">
      <button class="pwa-banner-dismiss" onclick="window._pwaInstallDismiss()">Nanti</button>
      <button class="pwa-banner-install" onclick="window._pwaInstallNow()">Install</button>
    </div>`;
  document.body.appendChild(banner);
  requestAnimationFrame(() => banner.classList.add("visible"));
}

/* ── Sembunyikan & hapus banner ── */
function _hideInstallBanner() {
  const banner = document.getElementById("pwa-install-banner");
  if (!banner) return;
  banner.classList.remove("visible");
  setTimeout(() => banner.remove(), 300);
}

/* ── Aksi: Install ── */
window._pwaInstallNow = async () => {
  if (_deferredPrompt) {
    _deferredPrompt.prompt();
    await _deferredPrompt.userChoice;
    _deferredPrompt = null;
    _hideInstallBanner();
  } else {
    // Fallback: instruksi manual kalau beforeinstallprompt tidak terpicu
    alert("Tap ⋮ di pojok kanan atas Chrome, lalu pilih 'Add to Home Screen'");
    _hideInstallBanner();
  }
};

/* ── Aksi: Dismiss ── */
window._pwaInstallDismiss = () => {
  localStorage.setItem(DISMISS_KEY, Date.now().toString());
  _hideInstallBanner();
};

/* ── Fallback: tampilkan banner otomatis kalau beforeinstallprompt tidak terpicu ── */
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    if (_deferredPrompt) _showInstallBanner();
  }, 1500);
});

/* ── Debug helper ── */
window._showInstallBanner = _showInstallBanner;
