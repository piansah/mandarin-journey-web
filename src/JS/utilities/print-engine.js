/* ============================================================
   PRINT-ENGINE.JS - Lembar Latihan Tulis Hanzi
   ============================================================ */

import { supa } from "../core/config.js";
import { showToast } from "../utilities/helpers.js";

const PRACTICE_BOXES = 8;

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

function _serializeRows(rows) {
  return JSON.stringify(rows)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

window.preparePrintDeck = async function (deckId, title) {
  showToast("Menyiapkan lembar latihan...", "info");
  const printWindow = _openPrintWindow();
  if (!printWindow) return;

  try {
    const { data, error } = await supa
      .from("personal_cards")
      .select("hanzi")
      .eq("deck_id", deckId)
      .order("created_at", { ascending: true });

    if (error || !data) throw new Error("Gagal memuat data kata.");
    _generatePrintOutput(printWindow, title, data);
  } catch (err) {
    showToast(err.message, "err");
    printWindow.close();
  }
};

window.preparePrintHsk = async function (setId, title) {
  showToast("Menyiapkan lembar latihan HSK...", "info");
  const printWindow = _openPrintWindow();
  if (!printWindow) return;

  try {
    const { data, error } = await supa
      .from("flashcard_cards")
      .select("hanzi")
      .eq("set_id", setId)
      .is("added_by", null)
      .order("id", { ascending: true });

    if (error || !data) throw new Error("Gagal memuat data kata HSK.");
    _generatePrintOutput(printWindow, title, data);
  } catch (err) {
    showToast(err.message, "err");
    printWindow.close();
  }
};

function _openPrintWindow() {
  const printWindow = window.open("", "_blank");

  if (!printWindow) {
    showToast("Gagal membuka jendela cetak. Pastikan pop-up diizinkan.", "warn");
    return null;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Menyiapkan lembar latihan...</title>
      <style>
        body {
          margin: 0;
          display: grid;
          min-height: 100vh;
          place-items: center;
          background: #f4f4f4;
          color: #333;
          font-family: Arial, sans-serif;
        }
      </style>
    </head>
    <body>Menyiapkan lembar latihan...</body>
    </html>
  `);
  printWindow.document.close();
  return printWindow;
}

function _generatePrintOutput(printWindow, title, words) {
  const rows = _extractHanziRows(words);

  if (!rows.length) {
    showToast("Tidak ada Hanzi yang bisa dicetak.", "warn");
    printWindow.close();
    return;
  }

  const safeTitle = _escapeHtml(title || "Tulis Hanzi");
  const serializedRows = _serializeRows(rows);

  const html = `
    <!DOCTYPE html>
    <html lang="id">
    <head>
      <meta charset="UTF-8">
      <title>Latihan Tulis - ${safeTitle}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&display=swap');

        @media print {
          @page { size: A4; margin: 9mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none; }
          .page { margin: 0; box-shadow: none; }
          .char-card { break-inside: avoid; page-break-inside: avoid; }
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
          padding: 12mm 13mm;
          background: #fff;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
        }

        .header {
          margin-bottom: 9px;
          text-align: center;
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
          margin: 11px 0 9px;
          color: #333;
          font-size: 9px;
        }

        .char-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .char-card {
          display: grid;
          grid-template-columns: 24mm 1fr;
          gap: 8px;
          padding: 7px 0;
          border-top: 0.8px solid #ddd;
        }

        .char-meta {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          color: #777;
          font-size: 8px;
          text-align: center;
        }

        .char-big {
          color: #111;
          font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
          font-size: 34px;
          font-weight: 700;
          line-height: 1;
        }

        .char-source {
          max-width: 23mm;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .stroke-strip,
        .practice-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          align-items: center;
        }

        .stroke-strip { margin-bottom: 5px; }

        .tz-box,
        .stroke-box {
          position: relative;
          display: flex;
          width: 13.5mm;
          height: 13.5mm;
          align-items: center;
          justify-content: center;
          border: 0.8px solid #555;
          background: #fff;
        }

        .stroke-box { border-color: #888; }

        .stroke-box svg {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
        }

        .tz-box::before,
        .tz-box::after,
        .stroke-box::before,
        .stroke-box::after,
        .diag-a,
        .diag-b {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .tz-box::before,
        .stroke-box::before {
          left: 50%;
          width: 0;
          border-left: 0.3px dashed #ccc;
        }

        .tz-box::after,
        .stroke-box::after {
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

        .stroke-num {
          position: absolute;
          top: 1px;
          left: 2px;
          z-index: 2;
          color: #2e75b6;
          font-size: 6px;
          font-weight: 700;
        }

        .stroke-error {
          color: #aaa;
          font-size: 7px;
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
      <button class="print-btn-float no-print" onclick="window.print()">Download / Simpan PDF</button>

      <section class="page">
        <div class="header">
          <h1>&#27721;&#23383;&#20070;&#20889;&#32451;&#20064; - Stroke Order Writing Practice</h1>
          <p>Kertas A4 | Urutan goresan + kotak latihan | ${safeTitle}</p>
        </div>
        <div class="student-line">
          <span>Nama / &#22995;&#21517; : _______________________</span>
          <span>Tanggal / &#26085;&#26399; : _______________</span>
        </div>
        <div id="char-list" class="char-list">Memuat urutan goresan...</div>
        <div class="footer">Mandarin Journey - ${safeTitle}</div>
      </section>

      <script>
        const rows = ${serializedRows};
        const practiceBoxes = ${PRACTICE_BOXES};

        function escapeHtml(value) {
          return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        }

        function gridLines() {
          return '<span class="diag-a"></span><span class="diag-b"></span>';
        }

        function renderPracticeBoxes() {
          return Array.from({ length: practiceBoxes }, () =>
            '<div class="tz-box">' + gridLines() + '</div>'
          ).join("");
        }

        function pathSvg(strokes, activeIdx) {
          const paths = strokes.map((path, idx) => {
            const color = idx === activeIdx ? "#2e75b6" : "#222";
            const opacity = idx <= activeIdx ? (idx === activeIdx ? "1" : "0.28") : "0";
            return '<path d="' + escapeHtml(path) + '" fill="' + color + '" opacity="' + opacity + '"></path>';
          }).join("");

          return '<svg viewBox="0 0 1024 1024" aria-hidden="true">' +
            '<g transform="translate(0, 900) scale(1, -1)">' + paths + '</g>' +
          '</svg>';
        }

        async function loadStrokeData(char) {
          const res = await fetch("https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/" + encodeURIComponent(char) + ".json");
          if (!res.ok) throw new Error("Data stroke tidak tersedia");
          return res.json();
        }

        async function renderRow(row) {
          let strokeHtml = "";
          try {
            const data = await loadStrokeData(row.hanzi);
            strokeHtml = data.strokes.map((_, idx) =>
              '<div class="stroke-box">' +
                gridLines() +
                '<span class="stroke-num">' + (idx + 1) + '</span>' +
                pathSvg(data.strokes, idx) +
              '</div>'
            ).join("");
          } catch (err) {
            strokeHtml = '<div class="stroke-error">Urutan goresan tidak tersedia untuk ' + escapeHtml(row.hanzi) + '</div>';
          }

          return '<article class="char-card">' +
            '<div class="char-meta">' +
              '<div class="char-big">' + escapeHtml(row.hanzi) + '</div>' +
              '<div class="char-source">' + escapeHtml(row.source || row.hanzi) + '</div>' +
            '</div>' +
            '<div>' +
              '<div class="stroke-strip">' + strokeHtml + '</div>' +
              '<div class="practice-strip">' + renderPracticeBoxes() + '</div>' +
            '</div>' +
          '</article>';
        }

        (async function init() {
          const list = document.getElementById("char-list");
          list.innerHTML = (await Promise.all(rows.map(renderRow))).join("");
          document.title = "Latihan Tulis - ${safeTitle}";
          setTimeout(() => window.print(), 350);
        })();
      </script>
    </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
