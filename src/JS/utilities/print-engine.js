/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   PRINT-ENGINE.JS — Lembar Latihan Tulis (Tianzige/Mizige)
   ============================================================ */

import { supa } from "../core/config.js";
import { showToast } from "../utilities/helpers.js";

/**
 * Mempersiapkan data deck (Personal) untuk dicetak
 */
window.preparePrintDeck = async function(deckId, title) {
  showToast("Menyiapkan lembar latihan...", "info");
  try {
    const { data, error } = await supa
      .from("personal_cards")
      .select("hanzi, pinyin, arti")
      .eq("deck_id", deckId)
      .order("created_at", { ascending: true });

    if (error || !data) throw new Error("Gagal memuat data kata.");
    
    _generatePrintOutput(title, data);
  } catch (err) {
    showToast(err.message, "err");
  }
};

/**
 * Mempersiapkan data HSK (Developer) untuk dicetak
 */
window.preparePrintHsk = async function(setId, title) {
  showToast("Menyiapkan lembar latihan HSK...", "info");
  try {
    const { data, error } = await supa
      .from("flashcard_cards")
      .select("hanzi, pinyin, arti")
      .eq("set_id", setId)
      .is("added_by", null) // Ambil yang default dev saja
      .order("id", { ascending: true });

    if (error || !data) throw new Error("Gagal memuat data kata HSK.");
    
    _generatePrintOutput(title, data);
  } catch (err) {
    showToast(err.message, "err");
  }
};

/**
 * Inti dari mesin cetak: Membuka jendela baru dan merender grid latihan
 */
function _generatePrintOutput(title, words) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showToast("Gagal membuka jendela cetak. Pastikan pop-up diizinkan.", "warn");
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Latihan Tulis - ${title}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Sans+SC:wght@400;700&display=swap');
        
        @media print {
          @page { size: A4; margin: 15mm; }
          body { -webkit-print-color-adjust: exact; }
          .no-print { display: none; }
        }

        body {
          font-family: 'Noto Sans SC', sans-serif;
          background: white;
          color: #333;
          margin: 0;
          padding: 30px;
        }

        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #e2c96d;
          padding-bottom: 10px;
        }

        .header h1 { margin: 0; color: #b48a3d; font-size: 24px; }
        .header p { margin: 5px 0 0; color: #666; font-size: 14px; }

        .word-section {
          margin-bottom: 35px;
          page-break-inside: avoid;
        }

        .word-info {
          display: flex;
          align-items: baseline;
          gap: 15px;
          margin-bottom: 10px;
        }

        .word-py { color: #b48a3d; font-weight: bold; font-size: 18px; }
        .word-arti { color: #666; font-size: 14px; font-style: italic; }

        .grid-row {
          display: flex;
          flex-wrap: wrap;
          gap: 0;
        }

        /* Tianzige Grid Style */
        .tz-box {
          width: 42px;
          height: 42px;
          border: 1px solid #ffcccc;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          background-image: 
            linear-gradient(to right, transparent 49%, rgba(255, 204, 204, 0.5) 49%, rgba(255, 204, 204, 0.5) 51%, transparent 51%),
            linear-gradient(to bottom, transparent 49%, rgba(255, 204, 204, 0.5) 49%, rgba(255, 204, 204, 0.5) 51%, transparent 51%);
        }

        .tz-box.hanzi-main {
          font-family: 'Ma Shan Zheng', cursive;
          font-size: 30px;
          color: #000;
          border-color: #f87171;
        }

        .tz-box.hanzi-fade {
          font-family: 'Ma Shan Zheng', cursive;
          font-size: 30px;
          color: #e5e5e5;
        }

        .footer {
          position: fixed;
          bottom: 10mm;
          left: 15mm;
          right: 15mm;
          font-size: 10px;
          color: #999;
          text-align: center;
        }

        .print-btn-float {
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 24px;
          background: #b48a3d;
          color: white;
          border: none;
          border-radius: 50px;
          cursor: pointer;
          font-weight: bold;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3);
          font-family: sans-serif;
          z-index: 9999;
        }
        
        .print-btn-float:hover {
          background: #8e6d30;
          transform: translateY(-2px);
        }
      </style>
    </head>
    <body>
      <button class="print-btn-float no-print" onclick="window.print()">🖨️ CETAK LEMBAR LATIHAN</button>
      
      <div class="header">
        <h1>Mandarin Journey - Writing Sheet</h1>
        <p>Deck: ${title}</p>
      </div>

      ${words.map(w => `
        <div class="word-section">
          <div class="word-info">
            <div class="word-py">${w.pinyin}</div>
            <div class="word-arti">${w.arti}</div>
          </div>
          <div class="grid-row">
            <div class="tz-box hanzi-main">${w.hanzi}</div>
            <div class="tz-box hanzi-fade">${w.hanzi}</div>
            <div class="tz-box hanzi-fade">${w.hanzi}</div>
            <div class="tz-box hanzi-fade">${w.hanzi}</div>
            ${Array(11).fill('<div class="tz-box"></div>').join('')}
          </div>
        </div>
      `).join('')}

      <div class="footer">
        © 2026 Mandarin Journey — Digenerasi otomatis untuk latihan tulis tangan.
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
