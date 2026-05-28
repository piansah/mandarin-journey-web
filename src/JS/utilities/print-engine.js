/* ============================================================
   PRINT-ENGINE.JS - Lembar Latihan Tulis Hanzi
   ============================================================ */

import { supa } from "../core/config.js";
import { showToast } from "../utilities/helpers.js";

const GRID_COLS = 11;
const GRID_ROWS_PER_PAGE = 15;

function _escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function _extractHanziRows(words) {
  const seen = new Set();
  const rows = [];

  (words || []).forEach((word) => {
    [...String(word.hanzi || "")].forEach((char) => {
      if (!/[\u3400-\u4dbf\u4e00-\u9fff]/.test(char) || seen.has(char)) return;
      seen.add(char);
      rows.push({
        hanzi: char,
        source: word.hanzi || "",
      });
    });
  });

  return rows;
}

function _chunkRows(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks.length ? chunks : [[]];
}

window.preparePrintDeck = async function (deckId, title) {
  showToast("Menyiapkan lembar latihan...", "info");
  try {
    const { data, error } = await supa
      .from("personal_cards")
      .select("hanzi")
      .eq("deck_id", deckId)
      .order("created_at", { ascending: true });

    if (error || !data) throw new Error("Gagal memuat data kata.");
    _generatePrintOutput(title, data);
  } catch (err) {
    showToast(err.message, "err");
  }
};

window.preparePrintHsk = async function (setId, title) {
  showToast("Menyiapkan lembar latihan HSK...", "info");
  try {
    const { data, error } = await supa
      .from("flashcard_cards")
      .select("hanzi")
      .eq("set_id", setId)
      .is("added_by", null)
      .order("id", { ascending: true });

    if (error || !data) throw new Error("Gagal memuat data kata HSK.");
    _generatePrintOutput(title, data);
  } catch (err) {
    showToast(err.message, "err");
  }
};

function _renderBox(content = "", note = "") {
  return `
    <div class="tz-box${content ? " hanzi-main" : ""}">
      <span class="diag-a"></span>
      <span class="diag-b"></span>
      ${content ? _escapeHtml(content) : ""}
      ${note ? `<span class="row-note">${_escapeHtml(note)}</span>` : ""}
    </div>
  `;
}

function _generatePrintOutput(title, words) {
  const rows = _extractHanziRows(words);
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    showToast("Gagal membuka jendela cetak. Pastikan pop-up diizinkan.", "warn");
    return;
  }

  if (!rows.length) {
    showToast("Tidak ada Hanzi yang bisa dicetak.", "warn");
    printWindow.close();
    return;
  }

  const pages = _chunkRows(rows, GRID_ROWS_PER_PAGE);
  const safeTitle = _escapeHtml(title);

  const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Latihan Tulis - ${safeTitle}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap');

        @media print {
          @page { size: A4; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none; }
          .page {
            margin: 0;
            box-shadow: none;
            page-break-after: always;
          }
          .page:last-child { page-break-after: auto; }
        }

        * { box-sizing: border-box; }

        body {
          margin: 0;
          padding: 18px;
          background: #f4f4f4;
          color: #333;
          font-family: Arial, "Noto Sans SC", sans-serif;
        }

        .page {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto 18px;
          padding: 13mm 19.6mm 12mm;
          background: #fff;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
        }

        .header {
          text-align: center;
          margin-bottom: 10px;
        }

        .header h1 {
          margin: 0;
          color: #2e75b6;
          font-size: 16px;
          font-weight: 700;
        }

        .header p {
          margin: 5px 0 0;
          color: #888;
          font-size: 9px;
        }

        .student-line {
          display: flex;
          justify-content: space-between;
          margin: 13px 0 10px;
          color: #333;
          font-size: 9px;
        }

        .sheet {
          display: grid;
          grid-template-columns: repeat(${GRID_COLS}, 44px);
          grid-auto-rows: 44px;
          justify-content: center;
        }

        .row { display: contents; }

        .tz-box {
          position: relative;
          display: flex;
          width: 44px;
          height: 44px;
          align-items: center;
          justify-content: center;
          border: 0.8px solid #555;
        }

        .tz-box::before,
        .tz-box::after,
        .diag-a,
        .diag-b {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .tz-box::before {
          left: 50%;
          width: 0;
          border-left: 0.3px dashed #ccc;
        }

        .tz-box::after {
          top: 50%;
          height: 0;
          border-top: 0.3px dashed #ccc;
        }

        .diag-a {
          background: linear-gradient(45deg, transparent 49.4%, #d6d6d6 49.4%, #d6d6d6 50.6%, transparent 50.6%);
        }

        .diag-b {
          background: linear-gradient(-45deg, transparent 49.4%, #d6d6d6 49.4%, #d6d6d6 50.6%, transparent 50.6%);
        }

        .hanzi-main {
          color: #111;
          font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
          font-size: 30px;
          font-weight: 700;
        }

        .row-note {
          position: absolute;
          left: 3px;
          bottom: 2px;
          max-width: 38px;
          overflow: hidden;
          color: #999;
          font-size: 5.5px;
          line-height: 1;
          white-space: nowrap;
        }

        .footer {
          margin-top: 9px;
          color: #999;
          font-size: 8px;
          text-align: center;
        }

        .print-btn-float {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 9999;
          padding: 12px 22px;
          border: none;
          border-radius: 999px;
          background: #2e75b6;
          color: white;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
          cursor: pointer;
          font-family: Arial, sans-serif;
          font-weight: 700;
        }

        .print-btn-float:hover { background: #225b8d; }
      </style>
    </head>
    <body>
      <button class="print-btn-float no-print" onclick="window.print()">Cetak / Simpan PDF</button>

      ${pages.map((pageRows, pageIdx) => `
        <section class="page">
          <div class="header">
            <h1>汉字书写练习 - HSK Writing Practice</h1>
            <p>Kertas A4 | ${GRID_COLS} kolom x ${GRID_ROWS_PER_PAGE} baris | Halaman ${pageIdx + 1}/${pages.length}</p>
          </div>
          <div class="student-line">
            <span>Nama / 姓名 : _______________________</span>
            <span>Tanggal / 日期 : _______________</span>
          </div>
          <div class="sheet">
            ${Array.from({ length: GRID_ROWS_PER_PAGE }).map((_, rowIdx) => {
              const row = pageRows[rowIdx];
              return `<div class="row">
                ${Array.from({ length: GRID_COLS }).map((__, colIdx) => {
                  const isMain = row && colIdx === 0;
                  const note = isMain && row.source !== row.hanzi ? row.source : "";
                  return _renderBox(isMain ? row.hanzi : "", note);
                }).join("")}
              </div>`;
            }).join("")}
          </div>
          <div class="footer">Mandarin Journey - ${safeTitle}</div>
        </section>
      `).join("")}
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}
