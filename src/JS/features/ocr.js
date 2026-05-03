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
async function _startCamera() {
  const video = document.getElementById("ocr-video");
  if (!video) return;

  try {
    const constraints = {
      video: {
        facingMode: "environment", // Kamera belakang
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    };
    _ocrStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = _ocrStream;
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

  // 1. Capture Frame & Crop to Scan Box
  const ctx = canvas.getContext("2d");
  
  // Tentukan area potong (Scan Box)
  // Di CSS, scan box ukurannya 280x120
  const boxW = 280;
  const boxH = 120;
  
  // Kita sesuaikan dengan resolusi video asli
  const videoW = video.videoWidth;
  const videoH = video.videoHeight;
  const rect = video.getBoundingClientRect();
  
  // Rasio antara video asli vs elemen video di layar
  const scaleX = videoW / rect.width;
  const scaleY = videoH / rect.height;
  
  canvas.width = boxW * scaleX;
  canvas.height = boxH * scaleY;
  
  // Posisi tengah
  const sx = (videoW - canvas.width) / 2;
  const sy = (videoH - canvas.height) / 2;

  ctx.drawImage(video, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

  // 2. Run OCR
  try {
    const { data: { text } } = await _ocrWorker.recognize(canvas);
    const cleanedText = text.replace(/\s+/g, '').trim(); // Hapus spasi
    
    if (cleanedText) {
      preview.textContent = cleanedText;
      
      // Jika ada teks, coba cari di dictionary aplikasi (global function)
      if (typeof window.onKosGlobalSearch === "function") {
        // Kita bisa langsung cari atau kasih tombol
        preview.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:4px">
            <div style="font-size:18px; color:var(--gold)">${cleanedText}</div>
            <div style="font-size:10px; opacity:0.7">Tap Shutter untuk cari</div>
          </div>`;
        
        // Simpan hasil terakhir untuk dicari
        _lastOcrResult = cleanedText;
      }
    } else {
      preview.textContent = "Teks tidak terdeteksi";
    }
  } catch (err) {
    console.error("OCR Process Error:", err);
    preview.textContent = "Error memproses gambar";
  } finally {
    _isOcrProcessing = false;
  }
}

let _lastOcrResult = "";

/* ══════════════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════════════ */
document.addEventListener("click", e => {
  if (e.target.closest("#ocr-capture-btn")) {
    if (_lastOcrResult && !_isOcrProcessing) {
      // Jika sudah ada hasil, buka pencarian
      window.closeOCRScanner();
      const searchInput = document.getElementById("kos-global-search");
      if (searchInput) {
        searchInput.value = _lastOcrResult;
        window.onKosGlobalSearch();
      }
      _lastOcrResult = "";
    } else {
      _captureAndProcess();
    }
  }
});

/* ── Expose ke window ── */
window.openOCRScanner = openOCRScanner;
window.closeOCRScanner = closeOCRScanner;
