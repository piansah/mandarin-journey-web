/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   OCR.JS — Optical Character Recognition + Word Segmentation
   Scan Hanzi → Pecah jadi Kosakata → Tap untuk buka Detail
   ============================================================ */

import { createWorker } from 'tesseract.js';
import { openLayer, closeLayer } from '../core/navigation.js';

let _ocrStream = null;
let _ocrWorker = null;
let _isOcrProcessing = false;
let _isTorchOn = false;

/* ══════════════════════════════════════════════════════════════
   OPEN / CLOSE OCR SCANNER
══════════════════════════════════════════════════════════════ */
export async function openOCRScanner() {
  const layer = document.getElementById("layer-ocr");
  if (!layer) return;

  // Reset state
  _isTorchOn = false;
  const torchBtn = document.getElementById("ocr-torch-btn");
  if (torchBtn) torchBtn.classList.remove("active");

  // Reset UI ke mode kamera
  _showCameraMode();

  openLayer("layer-ocr");
  _startCamera();

  if (!_ocrWorker) _initWorker();
}

export function closeOCRScanner() {
  if (_ocrStream) {
    _ocrStream.getTracks().forEach(track => track.stop());
    _ocrStream = null;
  }
  _isTorchOn = false;
  closeLayer("layer-ocr");
}

/* ══════════════════════════════════════════════════════════════
   CAMERA
══════════════════════════════════════════════════════════════ */
window._toggleTorch = async () => {
  if (!_ocrStream) return;
  const track = _ocrStream.getVideoTracks()[0];
  const caps = track.getCapabilities();

  if (caps.torch) {
    _isTorchOn = !_isTorchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: _isTorchOn }] });
      document.getElementById("ocr-torch-btn")?.classList.toggle("active", _isTorchOn);
    } catch (err) {
      console.error("Torch error:", err);
    }
  } else {
    alert("Perangkat tidak mendukung flash.");
  }
};

async function _startCamera() {
  const video = document.getElementById("ocr-video");
  if (!video) return;

  try {
    _ocrStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        focusMode: "continuous"
      }
    });
    video.srcObject = _ocrStream;

    const track = _ocrStream.getVideoTracks()[0];
    const caps = track.getCapabilities();
    if (caps.focusMode?.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    }
  } catch (err) {
    console.error("Camera Error:", err);
    if (typeof showToast === "function") {
      showToast("Gagal mengakses kamera. Pastikan izin diberikan.");
    } else {
      alert("Gagal mengakses kamera.");
    }
    closeOCRScanner();
  }
}

async function _initWorker() {
  const status = document.getElementById("ocr-status");
  if (status) status.textContent = "Menginisialisasi AI...";

  try {
    _ocrWorker = await createWorker('chi_sim', 1, {
      workerPath: 'https://unpkg.com/tesseract.js@v5.0.0/dist/worker.min.js',
      corePath: 'https://unpkg.com/tesseract.js-core@v5.0.0/tesseract-core.wasm.js',
    });
    
    // Tuning parameter untuk akurasi
    await _ocrWorker.setParameters({
      tessedit_pageseg_mode: '11', // PSM 11: Sparse text. Finds as much text as possible in no particular order.
      tessjs_create_hocr: '0',
      tessjs_create_tsv: '0',
    });

    if (status) status.textContent = "Siap memindai";
  } catch (err) {
    console.error("Worker Error:", err);
    if (status) status.textContent = "Gagal memuat AI";
  }
}

/* ══════════════════════════════════════════════════════════════
   CAPTURE & PROCESS
══════════════════════════════════════════════════════════════ */
async function _captureAndProcess() {
  if (_isOcrProcessing || !_ocrWorker) return;

  const video = document.getElementById("ocr-video");
  const canvas = document.getElementById("ocr-canvas");
  const status = document.getElementById("ocr-status");
  if (!video || !canvas) return;

  _isOcrProcessing = true;
  if (status) status.textContent = "Memproses...";

  const ctx = canvas.getContext("2d");

  // ── Crop berdasarkan scan-box, memperhitungkan object-fit:cover ──
  const scanBox = document.querySelector(".ocr-scan-box");
  const boxRect = scanBox.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = video.clientWidth;
  const ch = video.clientHeight;

  const videoAspect = vw / vh;
  const containerAspect = cw / ch;

  let renderW, renderH, offsetX, offsetY;
  if (videoAspect > containerAspect) {
    // Video lebih lebar → sisi kiri/kanan terpotong
    renderH = ch;
    renderW = ch * videoAspect;
    offsetX = (renderW - cw) / 2;
    offsetY = 0;
  } else {
    // Video lebih tinggi → atas/bawah terpotong
    renderW = cw;
    renderH = cw / videoAspect;
    offsetX = 0;
    offsetY = (renderH - ch) / 2;
  }

  const scaleX = vw / renderW;
  const scaleY = vh / renderH;

  const sx = (boxRect.left - videoRect.left + offsetX) * scaleX;
  const sy = (boxRect.top - videoRect.top + offsetY) * scaleY;
  const sw = boxRect.width * scaleX;
  const sh = boxRect.height * scaleY;

  // Upscale 3x untuk akurasi lebih tinggi
  canvas.width = sw * 3;
  canvas.height = sh * 3;

  // Filter awal
  ctx.filter = "grayscale(100%) contrast(200%) brightness(110%)";
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  // --- Optimized Thresholding (Booster Speed) ---
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const buf = new Uint32Array(imageData.data.buffer);
  
  for (let i = 0; i < buf.length; i++) {
    const pixel = buf[i];
    const r = pixel & 0xFF;
    const g = (pixel >> 8) & 0xFF;
    const b = (pixel >> 16) & 0xFF;
    const avg = (r + g + b) / 3;
    buf[i] = avg < 128 ? 0xFF000000 : 0xFFFFFFFF; 
  }
  ctx.putImageData(imageData, 0, 0);

  try {
    const { data: { text, confidence } } = await _ocrWorker.recognize(canvas);
    console.log(`[OCR] Result: "${text.trim()}" | Confidence: ${confidence}%`);
    
    // Filter karakter CJK + Tanda Baca Mandarin (Full-width)
    // Range: \u3000-\u303F (Symbols/Punct), \uFF00-\uFFEF (Half/Full-width forms)
    const scannedText = text.replace(/[^\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\uFF00-\uFFEF]/g, '');

    if (scannedText.length > 0) {
      if (typeof window.saveSearchHistory === 'function') { window.saveSearchHistory(scannedText); }
      const words = _segmentText(scannedText);
      _showResultMode(scannedText, words);
    } else {
      if (status) status.textContent = "Tidak terbaca, coba lagi";
    }
  } catch (err) {
    console.error("OCR Error:", err);
    if (status) status.textContent = "Error memproses";
  } finally {
    _isOcrProcessing = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   WORD SEGMENTATION (Greedy Longest Match)
══════════════════════════════════════════════════════════════ */
function _segmentText(text) {
  const cache = window._getGlobalSearchCache?.() || [];
  
  // Build hanzi lookup Map: hanzi → { pinyin, arti, hsk_level, ... }
  const hanziMap = new Map();
  cache.forEach(c => {
    if (c.hanzi && !hanziMap.has(c.hanzi)) {
      hanziMap.set(c.hanzi, c);
    }
  });

  const maxLen = 4; // Panjang kata Mandarin maksimal yg umum
  const result = [];
  let i = 0;

  while (i < text.length) {
    let matched = false;

    // Coba cocokkan dari terpanjang → terpendek
    for (let len = Math.min(maxLen, text.length - i); len >= 1; len--) {
      const candidate = text.substring(i, i + len);
      const wordData = hanziMap.get(candidate);

      if (wordData) {
        result.push({ ...wordData, hanzi: candidate, found: true });
        i += len;
        matched = true;
        break;
      }
    }

    // Jika tidak ketemu di kamus, cek apakah ini tanda baca atau karakter asing
    if (!matched) {
      const char = text[i];
      const isPunct = /[\u3000-\u303F\uFF00-\uFFEF]/.test(char);

      result.push({
        hanzi: char,
        pinyin: "",
        arti: "",
        hsk: null,
        badge: null,
        found: false,
        isPunct: isPunct
      });
      i++;
    }
  }

  return result;
}

/* ══════════════════════════════════════════════════════════════
   UI MODES
══════════════════════════════════════════════════════════════ */
function _showCameraMode() {
  const footer = document.getElementById("ocr-footer");
  if (!footer) return;

  footer.innerHTML = `
    <div id="ocr-status" class="ocr-status-text">Siap memindai</div>
    <button id="ocr-capture-btn" class="ocr-btn-shutter">
      <div class="ocr-shutter-inner"></div>
    </button>
  `;
}

function _showResultMode(rawText, words) {
  const footer = document.getElementById("ocr-footer");
  if (!footer) return;

  // Teks asli
  let html = `<div class="ocr-raw-text">${rawText}</div>`;

  // Simpan hasil ke variabel global agar bisa diakses saat tap
  window._ocrResults = words;

  // Daftar kata
  html += `<div class="ocr-word-list">`;
  words.forEach((w, idx) => {
    if (w.isPunct) {
      // Tanda baca tampil polos saja
      html += `<span class="ocr-punct-item">${w.hanzi}</span>`;
    } else if (w.found) {
      html += `
        <div class="ocr-word-item" data-idx="${idx}">
          <span class="ocr-w-hanzi">${w.hanzi}</span>
          <span class="ocr-w-pinyin">${w.pinyin}</span>
          <span class="ocr-w-arti">${w.arti}</span>
          ${w.hsk ? `<span class="ocr-w-hsk">HSK${w.hsk}</span>` : ''}
        </div>`;
    } else {
      html += `
        <div class="ocr-word-item not-found">
          <span class="ocr-w-hanzi">${w.hanzi}</span>
          <span class="ocr-w-arti dim">Tidak ada di kamus</span>
        </div>`;
    }
  });
  html += `</div>`;

  // Tombol scan ulang
  html += `
    <button id="ocr-rescan-btn" class="ocr-btn-rescan">
      Scan Ulang
    </button>`;

  footer.innerHTML = html;
}

/* ══════════════════════════════════════════════════════════════
   WINDOW FUNCTIONS
══════════════════════════════════════════════════════════════ */
window.openOCRScanner = openOCRScanner;
window.closeOCRScanner = closeOCRScanner;

/* ══════════════════════════════════════════════════════════════
   EVENT LISTENERS (Delegated)
══════════════════════════════════════════════════════════════ */
document.addEventListener("click", e => {
  const ocrLayer = document.getElementById("layer-ocr");
  if (!ocrLayer || !ocrLayer.classList.contains("active")) return;

  // Tombol shutter
  if (e.target.closest("#ocr-capture-btn")) {
    _captureAndProcess();
    return;
  }

  // Tombol scan ulang
  if (e.target.closest("#ocr-rescan-btn")) {
    _showCameraMode();
    return;
  }

  // Tap kata pada hasil
  const wordItem = e.target.closest(".ocr-word-item[data-idx]");
  if (wordItem) {
    const idx = parseInt(wordItem.dataset.idx, 10);
    const word = window._ocrResults?.[idx];
    if (!word || !word.found) return;

    const hanzi = word.hanzi;

    // Tutup OCR dulu, lalu buka detail setelah animasi selesai
    closeOCRScanner();
    setTimeout(() => {
      if (typeof window.searchAndOpenWord === "function") {
        window.searchAndOpenWord(hanzi);
      }
    }, 350);
  }
});


/* --- Global Bridge for History --- */
window.openSegmentedView = function(text) {
  if (!text) return;
  const ocrLayer = document.getElementById('layer-ocr');
  if (ocrLayer) {
    ocrLayer.style.display = 'flex';
    ocrLayer.classList.add('active');
    ocrLayer.style.zIndex = '999999';
  }
  const words = _segmentText(text);
  _showResultMode(text, words);
};

window._segmentText = _segmentText;
