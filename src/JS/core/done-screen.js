/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   CORE/DONE-SCREEN.JS
   ============================================================ */

export function showDoneScreen(containerId, config) {
  const {
    correct: rawCorrect = 0, wrong: rawWrong = 0, total = 0, xp = 0, xpBonus = "",
    btnMainLabel = "Ulangi", btnMainFn = "", btnSecLabel = "Kembali", btnSecFn = "",
    showDots = true, showBurst = true, animateCounters = true,
  } = config;

  const correct = Math.min(rawCorrect, total);
  const wrong = Math.max(0, Math.min(rawWrong, total - correct));
  const acc = total > 0 ? Math.round((correct / total) * 100) : 0;

  let gradeIcon, gradeMsg, gradeColor;
  if (acc >= 90) { gradeIcon = "🏆"; gradeMsg = "Luar Biasa!"; gradeColor = "var(--gold)"; }
  else if (acc >= 70) { gradeIcon = "🎉"; gradeMsg = "Bagus!"; gradeColor = "var(--blue)"; }
  else if (acc >= 50) { gradeIcon = "💪"; gradeMsg = "Lumayan!"; gradeColor = "var(--dim)"; }
  else { gradeIcon = "📖"; gradeMsg = "Terus Berlatih!"; gradeColor = "var(--red)"; }

  const xpHtml = xp > 0 ? `<div class="ds-xp-row" style="--delay:350ms"><div class="ds-xp-pill" style="border-color:${gradeColor}; background:${gradeColor}20"><span class="ds-xp-icon">⚡</span><span class="ds-xp-text" style="color:${gradeColor}">+${xp} XP</span></div>${xpBonus ? `<div class="ds-xp-bonus" style="color:${gradeColor}">🔥 ${xpBonus}</div>` : ""}</div>` : "";

  let dotsHtml = "";
  if (showDots && total > 0) {
    let dots = "";
    for (let i = 0; i < total; i++) dots += `<div class="ds-dot ${i < correct ? "ds-dot--ok" : "ds-dot--err"}" style="animation-delay:${600 + i * 60}ms"></div>`;
    dotsHtml = `<div class="ds-insight"><div class="ds-insight-label">Performa</div><div class="ds-insight-dots">${dots}</div></div>`;
  }

  const burstHtml = showBurst ? `<div class="ds-burst" id="dsBurst-${containerId}"></div>` : "";
  const mainBtn = btnMainFn ? `<button class="ds-btn-main" onclick="${btnMainFn}()">${btnMainLabel}</button>` : "";
  const secBtn = btnSecFn ? `<button class="ds-btn-sec" onclick="${btnSecFn}()">${btnSecLabel}</button>` : "";

  const container = document.getElementById(containerId);
  if (!container) return;

  const ragu = config.ragu;
  const hasRagu = ragu !== undefined;
  
  const statsHtml = hasRagu 
    ? `<div class="ds-stats" style="grid-template-columns: 1fr 1fr 1.2fr 1fr; gap:6px;">
         <div class="ds-stat-card"><div class="ds-stat-num" style="color:var(--gold)" id="dsCorrect-${containerId}">0</div><div class="ds-stat-label">✓ Benar</div></div>
         <div class="ds-stat-card"><div class="ds-stat-num" style="color:#f59e0b" id="dsRagu-${containerId}">0</div><div class="ds-stat-label">? Ragu</div></div>
         <div class="ds-stat-card ds-stat-card--center"><div class="ds-stat-num" id="dsAcc-${containerId}">0%</div><div class="ds-stat-label">Akurasi</div></div>
         <div class="ds-stat-card"><div class="ds-stat-num" style="color:var(--red)" id="dsWrong-${containerId}">0</div><div class="ds-stat-label">✗ Salah</div></div>
       </div>`
    : `<div class="ds-stats">
         <div class="ds-stat-card"><div class="ds-stat-num" style="color:var(--gold)" id="dsCorrect-${containerId}">0</div><div class="ds-stat-label">✓ Benar</div></div>
         <div class="ds-stat-card ds-stat-card--center"><div class="ds-stat-num" id="dsAcc-${containerId}">0%</div><div class="ds-stat-label">Akurasi</div></div>
         <div class="ds-stat-card"><div class="ds-stat-num" style="color:var(--red)" id="dsWrong-${containerId}">0</div><div class="ds-stat-label">✗ Salah</div></div>
       </div>`;

  container.innerHTML = `<div class="ds-wrap">${burstHtml}<div class="ds-icon-wrap"><div class="ds-icon-bg" style="background:${gradeColor}20; border:2px solid ${gradeColor}40"><span class="ds-icon-emoji">${gradeIcon}</span></div></div><div class="ds-title">${gradeMsg}</div><div class="ds-subtitle">${correct} dari ${total} soal benar</div>${xpHtml}${statsHtml}${dotsHtml}<div class="ds-actions">${mainBtn}${secBtn}</div></div>`;

  if (animateCounters) {
    _dsAnimateCounter(`dsCorrect-${containerId}`, 0, correct, 800);
    if (hasRagu) _dsAnimateCounter(`dsRagu-${containerId}`, 0, ragu, 800);
    _dsAnimateCounter(`dsWrong-${containerId}`, 0, wrong, 800);
    _dsAnimateAccuracy(`dsAcc-${containerId}`, acc, `dsAccBar-${containerId}`, 900);
  } else {
    const cEl = document.getElementById(`dsCorrect-${containerId}`);
    const wEl = document.getElementById(`dsWrong-${containerId}`);
    const aEl = document.getElementById(`dsAcc-${containerId}`);
    const bEl = document.getElementById(`dsAccBar-${containerId}`);
    if (cEl) cEl.textContent = correct;
    if (wEl) wEl.textContent = wrong;
    if (aEl) aEl.textContent = acc + "%";
    if (bEl) bEl.style.width = acc + "%";
  }
  if (showBurst) setTimeout(() => _dsTriggerBurst(`dsBurst-${containerId}`, acc, gradeColor), 400);
}

function _dsAnimateCounter(elId, from, to, duration) {
  const el = document.getElementById(elId);
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * ease);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function _dsAnimateAccuracy(elId, targetAcc, barId, duration) {
  const el = document.getElementById(elId);
  const bar = document.getElementById(barId);
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    const val = Math.round(targetAcc * ease);
    el.textContent = val + "%";
    if (bar) bar.style.width = val + "%";
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function _dsTriggerBurst(burstId, acc, color) {
  const burst = document.getElementById(burstId);
  if (!burst) return;
  const count = acc >= 70 ? 24 : 10;
  const colors = [color, "var(--gold)", "#60a5fa", "#f472b6", "#34d399"];
  for (let i = 0; i < count; i++) {
    const dot = document.createElement("div");
    dot.className = "ds-burst-dot";
    const angle = (i / count) * 360;
    const dist = 80 + Math.random() * 80;
    const c = colors[i % colors.length];
    dot.style.cssText = `background:${c};--angle:${angle}deg;--dist:${dist}px;animation-delay:${Math.random() * 300}ms;width:${6 + Math.random() * 6}px;height:${6 + Math.random() * 6}px;border-radius:${Math.random() > 0.5 ? "50%" : "2px"};`;
    burst.appendChild(dot);
  }
}

// Tetap expose ke window karena dipanggil via onclick string dari HTML (btnMainFn/btnSecFn)
window.showDoneScreen = showDoneScreen;
