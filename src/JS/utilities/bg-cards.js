/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   BG-CARDS.JS — Background decorative hanzi cards
   Reusable di screen manapun yang butuh efek kartu melayang.
   Usage: _injectBgCards(containerEl)
   ============================================================ */

export function _injectBgCards(container) {
  const HANZI = [
    "你",
    "好",
    "我",
    "的",
    "是",
    "不",
    "他",
    "她",
    "们",
    "学",
    "习",
    "语",
    "汉",
    "字",
    "说",
    "听",
    "读",
    "写",
    "人",
    "大",
    "小",
    "中",
    "国",
    "来",
    "去",
    "在",
    "有",
    "没",
    "什",
    "么",
    "哪",
    "这",
    "那",
    "里",
    "家",
    "做",
    "吃",
    "喝",
    "看",
    "想",
    "爱",
    "朋",
    "友",
    "老",
    "师",
    "生",
    "新",
    "年",
    "月",
    "日",
  ];

  const SIZES = [
    [30, 36, 14],
    [36, 44, 17],
    [44, 52, 20],
    [32, 40, 15],
  ];

  const NODE_RADIUS = 46;
  const GAP = 10;
  const screenW = window.innerWidth || 390;
  const margin = 4;

  let seed = 137;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  };

  const nodeList = [];
  const canvasWraps = container.querySelectorAll(".snake-canvas-wrap");
  canvasWraps.forEach((wrap) => {
    const wrapTop = wrap.offsetTop;
    const wrapLeft = wrap.offsetLeft;
    wrap.querySelectorAll(".snake-node").forEach((node) => {
      const styleTop = parseInt(node.style.top) || 0;
      const styleLeft = parseInt(node.style.left) || 0;
      nodeList.push({
        cx: wrapLeft + styleLeft + NODE_RADIUS,
        cy: wrapTop + styleTop + NODE_RADIUS,
      });
    });
  });

  if (!nodeList.length) {
    // Fallback: scatter acak di seluruh screen (untuk screen tanpa snake path)
    const screenW = window.innerWidth || 390;
    const screenH = window.innerHeight || 844;
    const HANZI_FLAT = ["你","好","我","的","是","不","他","她","学","习",
      "语","汉","字","说","听","读","写","人","大","小","中","国","来","去","有","爱"];
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 24; i++) {
      const size = [30, 36, 44][Math.floor(rand() * 3)];
      const el = document.createElement("div");
      el.className = "pet-bg-card";
      el.textContent = HANZI_FLAT[Math.floor(rand() * HANZI_FLAT.length)];
      const x = margin + rand() * (screenW - size - margin * 2);
      const y = rand() * (screenH - size);
      const rot = (rand() - 0.5) * 48;
      const dur = 3.5 + rand() * 2.5;
      const del = rand() * 5;
      el.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${size}px;height:${size}px;font-size:${(size*0.45).toFixed(0)}px;transform:rotate(${rot.toFixed(1)}deg);animation-duration:${dur.toFixed(2)}s;animation-delay:-${del.toFixed(2)}s;pointer-events:none;position:absolute;z-index:0;`;
      frag.appendChild(el);
    }
    container.insertBefore(frag, container.firstChild);
    return;
  }

  const frag = document.createDocumentFragment();

  nodeList.forEach(({ cx, cy }, idx) => {
    if (idx === 0) return;
    if (rand() > 0.90) return;

    const clusterCount = rand() > 0.9 ? 2 : 1;
    const nodeIsRight = cx > screenW / 2;

    for (let c = 0; c < clusterCount; c++) {
      const sizeIdx = Math.floor(rand() * SIZES.length);
      const [w, h, fs] = SIZES[sizeIdx];

      const spreadY = (rand() - 0.5) * 100;
      const y = cy + spreadY - h / 2;

      let x;
      if (nodeIsRight) {
        const xStart = cx + NODE_RADIUS + GAP;
        const xMax = screenW - w - margin;
        if (xMax < xStart) {
          const xEnd = cx - NODE_RADIUS - GAP - w;
          x = Math.max(margin, xEnd - rand() * 40);
        } else {
          x = xStart + rand() * (xMax - xStart);
        }
      } else {
        const xEnd = cx - NODE_RADIUS - GAP - w;
        const xMin = margin;
        if (xEnd < xMin) {
          const xStart = cx + NODE_RADIUS + GAP;
          const xMax = screenW - w - margin;
          x = xStart + rand() * Math.max(0, xMax - xStart);
        } else {
          x = xMin + rand() * (xEnd - xMin);
        }
      }

      x = Math.max(margin, Math.min(screenW - w - margin, x));

      const rot = (rand() - 0.5) * 48;
      const dur = 3.5 + rand() * 2.5;
      const del = rand() * 5;

      const el = document.createElement("div");
      el.className = "pet-bg-card";
      el.textContent = HANZI[Math.floor(rand() * HANZI.length)];
      el.style.cssText = `left:${x.toFixed(1)}px;top:${y.toFixed(1)}px;width:${w}px;height:${h}px;font-size:${fs}px;transform:rotate(${rot.toFixed(1)}deg);animation-duration:${dur.toFixed(2)}s;animation-delay:-${del.toFixed(2)}s;`;
      frag.appendChild(el);
    }
  });

  container.appendChild(frag);
}
