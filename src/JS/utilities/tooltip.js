/* © 2026 Piansah — Mandarin Journey. Tooltip (Pettool) Utility */

import { speakMandarin as speakTTS } from "./tts.js";

let _pettoolEl = null;
let _pettoolTimeout = null;

/**
 * Inisialisasi Pettool element di DOM
 */
function _initPettool() {
  if (_pettoolEl) return;
  _pettoolEl = document.createElement("div");
  _pettoolEl.className = "pettool-wrap";
  _pettoolEl.innerHTML = `
    <div class="pettool-content">
      <span class="pettool-py" id="pt-py"></span>
      <span class="pettool-ar" id="pt-ar"></span>
    </div>
    <div class="pettool-tip"></div>
  `;
  document.body.appendChild(_pettoolEl);

  // Global hide on click outside
  document.addEventListener("mousedown", (e) => {
    if (_pettoolEl && !_pettoolEl.contains(e.target)) hidePettool();
  });
  document.addEventListener("touchstart", (e) => {
    if (_pettoolEl && !_pettoolEl.contains(e.target)) hidePettool();
  }, { passive: true });
}

/**
 * Tampilkan Tooltip di atas elemen target
 * @param {HTMLElement} targetEl - Elemen Hanzi yang ditekan
 * @param {Object} data - { pinyin, arti, hanzi }
 * @param {Function} onDetail - Callback saat ingin buka detail
 */
export function showPettool(targetEl, data, onDetail) {
  _initPettool();
  if (_pettoolTimeout) clearTimeout(_pettoolTimeout);

  const pyEl = document.getElementById("pt-py");
  const arEl = document.getElementById("pt-ar");
  if (pyEl) pyEl.textContent = data.pinyin || "";
  if (arEl) arEl.textContent = data.arti || "";

  // Reset transform & show
  _pettoolEl.classList.add("active");

  // Posisi
  const rect = targetEl.getBoundingClientRect();
  const ptRect = _pettoolEl.getBoundingClientRect();
  
  // Hitung top: di atas targetEl
  let top = rect.top - ptRect.height - 10;
  // Hitung left: tengah horizontal targetEl
  let left = rect.left + (rect.width / 2) - (ptRect.width / 2);

  // Boundary check
  if (left < 10) left = 10;
  if (left + ptRect.width > window.innerWidth - 10) {
    left = window.innerWidth - ptRect.width - 10;
  }
  if (top < 10) {
    // Jika tidak muat di atas, pindah ke bawah
    top = rect.bottom + 10;
    _pettoolEl.querySelector(".pettool-tip").style.display = "none";
  } else {
    _pettoolEl.querySelector(".pettool-tip").style.display = "";
  }

  _pettoolEl.style.top = `${top}px`;
  _pettoolEl.style.left = `${left}px`;

  // Interaction inside tooltip
  // Sesuai permintaan: Tap -> TTS, Hold -> Detail
  if (typeof window._attachLongPressTTS === 'function') {
      window._attachLongPressTTS(_pettoolEl, null, 
        () => { // Tap -> TTS
          if (data.hanzi) speakTTS(data.hanzi);
        }, 
        () => { // Hold -> Detail
          hidePettool();
          if (onDetail) onDetail();
        }
      );
  } else {
      // Fallback
      _pettoolEl.onclick = (e) => {
        e.stopPropagation();
        if (data.hanzi) speakTTS(data.hanzi);
      };
  }

  // Highlight target
  targetEl.classList.add("hanzi-holding");
}

export function hidePettool() {
  if (!_pettoolEl) return;
  _pettoolEl.classList.remove("active");
  document.querySelectorAll(".hanzi-holding").forEach(el => el.classList.remove("hanzi-holding"));
}

window.hidePettool = hidePettool;
