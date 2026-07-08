/* ============================================================
   PRINT-ENGINE.JS - Lembar Latihan Tulis Hanzi
   ============================================================ */

import { supa } from "../core/config.js";
import { showToast } from "../utilities/helpers.js";

const PRACTICE_BOXES = 8;
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const PDF_SCALE = 3;
const PAGE_WIDTH = 794 * PDF_SCALE;
const PAGE_HEIGHT = 1123 * PDF_SCALE;
const PAGE_PAD = 52 * PDF_SCALE;
const ROW_GAP = 10 * PDF_SCALE;
const BOX_SIZE = 51 * PDF_SCALE;
const BOX_GAP = 10 * PDF_SCALE;
const META_WIDTH = 92 * PDF_SCALE;
const STROKE_DATA_BASE = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@latest/";

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

window.preparePrintDeck = async function (deckId, title) {
  showToast("Menyiapkan lembar latihan...", "info");

  try {
    const { data, error } = await supa
      .from("personal_cards")
      .select("hanzi")
      .eq("deck_id", deckId)
      .order("created_at", { ascending: true });

    if (error || !data) throw new Error("Gagal memuat data kata.");
    await _downloadPracticePdf(title, data);
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
    await _downloadPracticePdf(title, data);
  } catch (err) {
    showToast(err.message, "err");
  }
};

function _safeFileName(value) {
  return String(value || "lembar-latihan-hanzi")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "lembar-latihan-hanzi";
}

async function _loadStrokeData(char) {
  const res = await fetch(`${STROKE_DATA_BASE}${encodeURIComponent(char)}.json`);
  if (!res.ok) throw new Error("Data stroke tidak tersedia");
  return res.json();
}

async function _loadRowsWithStrokes(rows) {
  return Promise.all(
    rows.map(async (row) => {
      try {
        const data = await _loadStrokeData(row.hanzi);
        return { ...row, strokes: data.strokes || [] };
      } catch {
        return { ...row, strokes: [] };
      }
    }),
  );
}

function _makeCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = PAGE_WIDTH;
  canvas.height = PAGE_HEIGHT;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
  ctx.textBaseline = "alphabetic";
  return { canvas, ctx };
}

function _drawText(ctx, text, x, y, options = {}) {
  ctx.fillStyle = options.color || "#222222";
  ctx.font = `${options.weight || 400} ${options.size}px ${options.family || "Arial, sans-serif"}`;
  ctx.textAlign = options.align || "left";
  ctx.fillText(String(text ?? ""), x, y);
}

function _drawTianziGrid(ctx, x, y, size, border = "#666666") {
  ctx.save();
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = "#cfcfcf";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + size / 2, y);
  ctx.lineTo(x + size / 2, y + size);
  ctx.moveTo(x, y + size / 2);
  ctx.lineTo(x + size, y + size / 2);
  ctx.moveTo(x, y);
  ctx.lineTo(x + size, y + size);
  ctx.moveTo(x + size, y);
  ctx.lineTo(x, y + size);
  ctx.stroke();
  ctx.restore();
}

function _drawStrokePath(ctx, strokes, activeIdx, x, y, size) {
  _drawTianziGrid(ctx, x, y, size, "#888888");
  if (!strokes?.length || typeof Path2D === "undefined") return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  ctx.clip();
  ctx.translate(x + size * 0.04, y + size * 0.08);
  const scale = (size * 0.92) / 1024;
  ctx.scale(scale, scale);
  ctx.translate(0, 900);
  ctx.scale(1, -1);

  strokes.forEach((path, idx) => {
    if (idx > activeIdx) return;
    ctx.fillStyle = idx === activeIdx ? "#2e75b6" : "rgba(34,34,34,0.28)";
    ctx.fill(new Path2D(path));
  });
  ctx.restore();

  _drawText(ctx, activeIdx + 1, x + 7, y + 18, {
    color: "#2e75b6",
    size: 15,
    weight: 700,
  });
}

function _drawPracticeBox(ctx, x, y) {
  _drawTianziGrid(ctx, x, y, BOX_SIZE, "#555555");
}

function _drawHeader(ctx, title, pageNo) {
  _drawText(ctx, "Hanzi Writing Practice", PAGE_WIDTH / 2, 62 * PDF_SCALE, {
    align: "center",
    color: "#2e75b6",
    size: 17 * PDF_SCALE,
    weight: 700,
  });
  _drawText(ctx, `A4 worksheet | Stroke order + practice boxes | ${title}`, PAGE_WIDTH / 2, 82 * PDF_SCALE, {
    align: "center",
    color: "#777777",
    size: 9 * PDF_SCALE,
  });
  _drawText(ctx, "Nama: _______________________", PAGE_PAD, 116 * PDF_SCALE, {
    size: 10 * PDF_SCALE,
  });
  _drawText(ctx, "Tanggal: _______________", PAGE_WIDTH - PAGE_PAD, 116 * PDF_SCALE, {
    align: "right",
    size: 10 * PDF_SCALE,
  });
  _drawText(ctx, `Mandarin Journey - ${title} - ${pageNo}`, PAGE_WIDTH / 2, PAGE_HEIGHT - 28 * PDF_SCALE, {
    align: "center",
    color: "#999999",
    size: 8 * PDF_SCALE,
  });
}

function _estimateRowHeight(row) {
  const strokeCount = Math.max(1, row.strokes?.length || 1);
  const strokeRows = Math.ceil(strokeCount / 8);
  const practiceRows = Math.ceil(PRACTICE_BOXES / 8);
  return (18 * PDF_SCALE) + (strokeRows + practiceRows) * (BOX_SIZE + BOX_GAP);
}

function _drawRow(ctx, row, y) {
  const rowHeight = _estimateRowHeight(row);
  ctx.save();
  ctx.strokeStyle = "#dddddd";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAGE_PAD, y);
  ctx.lineTo(PAGE_WIDTH - PAGE_PAD, y);
  ctx.stroke();

  const metaX = PAGE_PAD;
  const centerX = metaX + META_WIDTH / 2;
  _drawText(ctx, row.hanzi, centerX, y + 50 * PDF_SCALE, {
    align: "center",
    color: "#111111",
    size: 36 * PDF_SCALE,
    weight: 700,
    family: "\"Microsoft YaHei\", \"Noto Sans SC\", sans-serif",
  });
  _drawText(ctx, row.source || row.hanzi, centerX, y + 75 * PDF_SCALE, {
    align: "center",
    color: "#777777",
    size: 8 * PDF_SCALE,
    family: "\"Microsoft YaHei\", Arial, sans-serif",
  });

  const startX = PAGE_PAD + META_WIDTH + 20 * PDF_SCALE;
  const maxX = PAGE_WIDTH - PAGE_PAD;
  let x = startX;
  let boxY = y + 18 * PDF_SCALE;

  const strokes = row.strokes || [];
  if (strokes.length) {
    strokes.forEach((_, idx) => {
      if (x + BOX_SIZE > maxX) {
        x = startX;
        boxY += BOX_SIZE + BOX_GAP;
      }
      _drawStrokePath(ctx, strokes, idx, x, boxY, BOX_SIZE);
      x += BOX_SIZE + BOX_GAP;
    });
  } else {
    _drawText(ctx, "Stroke data unavailable", startX, boxY + 27 * PDF_SCALE, {
      color: "#999999",
      size: 8 * PDF_SCALE,
    });
  }

  x = startX;
  boxY += BOX_SIZE + BOX_GAP;
  for (let i = 0; i < PRACTICE_BOXES; i++) {
    if (x + BOX_SIZE > maxX) {
      x = startX;
      boxY += BOX_SIZE + BOX_GAP;
    }
    _drawPracticeBox(ctx, x, boxY);
    x += BOX_SIZE + BOX_GAP;
  }

  ctx.restore();
  return rowHeight;
}

async function _downloadPracticePdf(title, words) {
  const rows = _extractHanziRows(words);

  if (!rows.length) {
    showToast("Tidak ada Hanzi yang bisa dicetak.", "warn");
    return;
  }

  const safeTitle = title || "Tulis Hanzi";
  showToast("Mengunduh data stroke...", "info");
  const [{ jsPDF }, rowsWithStrokes] = await Promise.all([
    import("jspdf"),
    _loadRowsWithStrokes(rows),
  ]);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  let pageNo = 1;
  let { canvas, ctx } = _makeCanvas();
  _drawHeader(ctx, safeTitle, pageNo);
  let y = 132 * PDF_SCALE;
  const maxY = PAGE_HEIGHT - 48 * PDF_SCALE;

  function addCanvasPage() {
    const img = canvas.toDataURL("image/jpeg", 0.92);
    if (pageNo > 1) pdf.addPage();
    pdf.addImage(img, "JPEG", 0, 0, A4_WIDTH_MM, A4_HEIGHT_MM);
  }

  rowsWithStrokes.forEach((row) => {
    const rowHeight = _estimateRowHeight(row);
    if (y + rowHeight > maxY) {
      addCanvasPage();
      pageNo++;
      ({ canvas, ctx } = _makeCanvas());
      _drawHeader(ctx, safeTitle, pageNo);
      y = 132 * PDF_SCALE;
    }
    y += _drawRow(ctx, row, y) + ROW_GAP;
  });

  addCanvasPage();
  pdf.save(`${_safeFileName(safeTitle)}-lembar-latihan.pdf`);
  showToast("PDF berhasil diunduh", "ok");
}
