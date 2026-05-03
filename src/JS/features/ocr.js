/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   OCR.JS — Optical Character Recognition Implementation
   Menggunakan Tesseract.js untuk deteksi Hanzi dari Kamera.
   ============================================================ */

import { createWorker } from 'tesseract.js';
import { openLayer, closeLayer } from '../core/navigation.js';

let _ocrStream = null;
let _ocrWorker = null;
let _isOcrProcessing = false;

/* ══════════════════════════════════════════════════════════════
   OPEN OCR SCANNER
══════════════════════════════════════════════════════════════ */
export async function openOCRScanner() {
  const layer = document.getElementById("layer-ocr");
  if (!layer) return;

  openLayer("layer-ocr");
  _startCamera();
  
  // Pre-init Tesseract worker
  if (!_ocrWorker) {
    _initWorker();
  }
}

/* ══════════════════════════════════════════════════════════════
   CLOSE OCR SCANNER
══════════════════════════════════════════════════════════════ */
export function closeOCRScanner() {
  if (_ocrStream) {
    _ocrStream.getTracks().forEach(track => track.stop());
    _ocrStream = null;
  }
  closeLayer("layer-ocr");
}

/* ══════════════════════════════════════════════════════════════
   INTERNAL: CAMERA LOGIC
══════════════════════════════════════════════════════════════ */
let _isTorchOn = false;

/* ── Toggle Senter (Torch) ── */
window._toggleTorch = async () => {
  if (!_ocrStream) return;
  const track = _ocrStream.getVideoTracks()[0];
  const capabilities = track.getCapabilities();

  if (capabilities.torch) {
    _isTorchOn = !_isTorchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: _isTorchOn }]
      });
      document.getElementById("ocr-torch-btn").classList.toggle("active", _isTorchOn);
    } catch (err) {
      console.error("Torch error:", err);
    }
  } else {
    alert("Perangkat Anda tidak mendukung fitur Flash/Senter di browser.");
  }
};

async function _startCamera() {
  const video = document.getElementById("ocr-video");
  if (!video) return;

  try {
    const constraints = {
      video: {
        facingMode: "environment",
        width: { ideal: 1920 }, // Minta resolusi tinggi
        height: { ideal: 1080 },
        focusMode: "continuous" // Minta fokus otomatis berkelanjutan
      }
    };
    _ocrStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = _ocrStream;
    
    // Set focus mode jika didukung setelah track aktif
    const track = _ocrStream.getVideoTracks()[0];
    const caps = track.getCapabilities();
    if (caps.focusMode && caps.focusMode.includes('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
    }
  } catch (err) {
    console.error("OCR Camera Error:", err);
    alert("Gagal mengakses kamera. Pastikan izin kamera diberikan.");
    closeOCRScanner();
  }
}

async function _initWorker() {
  const preview = document.getElementById("ocr-result-preview");
  if (preview) preview.textContent = "Menginisialisasi AI...";
  
  try {
    _ocrWorker = await createWorker('chi_sim'); // Load Simplified Chinese
    if (preview) preview.textContent = "Siap untuk memindai";
  } catch (err) {
    console.error("Tesseract Worker Error:", err);
    if (preview) preview.textContent = "Gagal memuat AI OCR";
  }
}

/* ══════════════════════════════════════════════════════════════
   INTERNAL: CAPTURE & PROCESS
══════════════════════════════════════════════════════════════ */
async function _captureAndProcess() {
  if (_isOcrProcessing || !_ocrWorker) return;

  const video = document.getElementById("ocr-video");
  const canvas = document.getElementById("ocr-canvas");
  const preview = document.getElementById("ocr-result-preview");
  if (!video || !canvas || !preview) return;

  _isOcrProcessing = true;
  preview.innerHTML = '<span class="spinner"></span> Memproses...';
  _lastOcrResult = "";

  const ctx = canvas.getContext("2d");
  
  // 1. Ambil resolusi asli vs dimensi tampilan
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = video.clientWidth;
  const ch = video.clientHeight;
  
  // Ambil posisi scan box secara visual di layar
  const scanBox = document.querySelector(".ocr-scan-box");
  const boxRect = scanBox.getBoundingClientRect();
  const videoRect = video.getBoundingClientRect();

  // Hitung rasio & posisi potong yang presisi
  const scale = vw / cw;
  const sx = (boxRect.left - videoRect.left) * scale;
  const sy = (boxRect.top - videoRect.top) * scale;
  const sw = boxRect.width * scale;
  const sh = boxRect.height * scale;

  // Set ukuran canvas (Upscale biar tajam)
  canvas.width = sw * 1.5;
  canvas.height = sh * 1.5;

  // 2. Pre-processing Gambar
  ctx.filter = "grayscale(100%) contrast(160%) brightness(110%)";
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  // 3. Run OCR
  try {
    const { data: { text } } = await _ocrWorker.recognize(canvas);
    const cleanedText = text.replace(/\s+/g, '').trim(); 
    
    if (cleanedText && cleanedText.length > 0) {
      _lastOcrResult = cleanedText;
      preview.innerHTML = `
        <div class="ocr-result-content" onclick="window._confirmOCRSearch()">
          <span class="ocr-text-found">${cleanedText}</span>
          <span class="ocr-btn-go">Cari ❯</span>
        </div>
      `;
    } else {
      preview.textContent = "Tidak terbaca, coba lagi";
    }
  } catch (err) {
    console.error("OCR Process Error:", err);
    preview.textContent = "Error memproses";
  } finally {
    _isOcrProcessing = false;
  }
}

let _lastOcrResult = "";

/* ── Fungsi Konfirmasi Search ── */
window._confirmOCRSearch = () => {
  if (!_lastOcrResult) return;
  const textToSearch = _lastOcrResult;
  closeOCRScanner();
  
  const searchInput = document.getElementById("kos-global-search");
  if (searchInput) {
    searchInput.value = textToSearch;
    if (typeof window.onKosGlobalSearch === "function") {
      window.onKosGlobalSearch();
    }
  }
  _lastOcrResult = "";
};

/* ══════════════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════════════ */
document.addEventListener("click", e => {
  // Tombol shutter SELALU buat foto/scan ulang
  if (e.target.closest("#ocr-capture-btn")) {
    _captureAndProcess();
  }
});

/* ── Expose ke window ── */
window.openOCRScanner = openOCRScanner;
window.closeOCRScanner = closeOCRScanner;
