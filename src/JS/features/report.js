/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   FEATURES/REPORT.JS
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showToast } from "../utilities/helpers.js";

// State
let _isSubmitting = false;
let _currentReportType = "bug";
let _currentReportTargetId = null;

/* ══════════════════════════════════════════════════════════════
   FAB INJECTION & TOGGLE
══════════════════════════════════════════════════════════════ */

export function initBugReportFAB() {
  _injectReportModal();
  console.log("[Report] Bug report system initialized.");

  if (document.getElementById("bug-report-fab")) return;

  const fab = document.createElement("div");
  fab.id = "bug-report-fab";
  fab.className = "report-fab";
  fab.innerHTML = "🐛";
  fab.title = "Laporkan Bug";
  fab.onclick = openBugReportModal;
  document.body.appendChild(fab);
}

export function toggleBugReportFAB(isVisible) {
  const fab = document.getElementById("bug-report-fab");
  if (fab) {
    if (isVisible) fab.classList.add("visible");
    else fab.classList.remove("visible");
  }
}

/* ══════════════════════════════════════════════════════════════
   MODAL LOGIC
══════════════════════════════════════════════════════════════ */

function _injectReportModal() {
  if (document.getElementById("bug-report-modal")) return;

  const modal = document.createElement("div");
  modal.id = "bug-report-modal";
  modal.className = "report-modal";
  modal.innerHTML = `
    <div class="report-backdrop" onclick="window.closeBugReportModal()"></div>
    <div class="report-sheet">
      <div class="report-drag-bar"></div>
      <div class="report-title">Laporkan Masalah 🐛</div>
      <div class="report-sub">Temukan bug atau kesalahan teknis? Beritahu kami agar bisa segera diperbaiki.</div>
      
      <div class="report-form">
        <div class="report-form-group">
          <label class="report-label">Judul Masalah</label>
          <input id="br-title" class="report-input" placeholder="Contoh: Suara tidak muncul" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        </div>
        <div class="report-form-group">
          <label class="report-label">Detail Kejadian</label>
          <textarea id="br-desc" class="report-textarea" placeholder="Jelaskan apa yang terjadi dan langkah untuk memunculkan masalah tersebut..."></textarea>
        </div>
        
        <div class="report-device-info" id="br-device-preview">
          Memuat info perangkat...
        </div>

        <button id="br-submit-btn" class="report-submit-btn" onclick="window.submitBugReport()">
          <span>Kirim Laporan</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

export function openBugReportModal(preTitle = "", preDesc = "", type = "bug", targetId = null) {
  console.log("[Report] Opening modal:", { preTitle, type, targetId });
  const modal = document.getElementById("bug-report-modal");
  if (modal) {
    _currentReportType = type;
    _currentReportTargetId = targetId;

    const titleInp = document.getElementById("br-title");
    const descInp = document.getElementById("br-desc");
    if (titleInp) titleInp.value = preTitle || "";
    if (descInp) descInp.value = preDesc || "";

    modal.classList.add("active");
    _updateDevicePreview();
  } else {
    console.error("[Report] Modal element not found in DOM!");
  }
}

window.openBugReportModal = openBugReportModal;

window.closeBugReportModal = function() {
  const modal = document.getElementById("bug-report-modal");
  if (modal) {
    modal.classList.remove("active");
    _currentReportType = "bug";
    _currentReportTargetId = null;
  }
};

/* ══════════════════════════════════════════════════════════════
   SUBMISSION LOGIC
══════════════════════════════════════════════════════════════ */

function _getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    url: window.location.href,
    language: navigator.language,
    vendor: navigator.vendor,
    time: new Date().toISOString()
  };
}

function _updateDevicePreview() {
  const preview = document.getElementById("br-device-preview");
  if (!preview) return;
  const info = _getDeviceInfo();
  preview.innerHTML = `
    <strong>Info Teknis Otomatis:</strong><br>
    OS/Platform: ${info.platform}<br>
    Layar: ${info.screen} | Browser: ${info.vendor || 'Generic'}
  `;
}

window.submitBugReport = async function() {
  if (_isSubmitting) return;

  const title = document.getElementById("br-title").value.trim();
  const desc = document.getElementById("br-desc").value.trim();
  const btn = document.getElementById("br-submit-btn");

  if (!title || !desc) {
    showToast("Harap isi judul dan detail", "warn");
    return;
  }

  _isSubmitting = true;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Mengirim...';
  }

  const user = getCurrentUser();
  const deviceInfo = _getDeviceInfo();

  try {
    const { error } = await supa.from("bug_reports").insert({
      user_id: user ? user.id : null,
      title: title,
      description: desc,
      device_info: deviceInfo,
      report_type: _currentReportType,
      target_id: _currentReportTargetId ? String(_currentReportTargetId) : null
    });

    if (error) throw error;

    showToast("Laporan terkirim, terima kasih! 🙏", "ok");
    window.closeBugReportModal();
    
    // Clear form
    document.getElementById("br-title").value = "";
    document.getElementById("br-desc").value = "";

  } catch (err) {
    console.error("Bug Report Error:", err);
    showToast("Gagal mengirim laporan", "err");
  } finally {
    _isSubmitting = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = "<span>Kirim Laporan</span>";
    }
  }
};

window.initBugReportFAB = initBugReportFAB;
window.toggleBugReportFAB = toggleBugReportFAB;
