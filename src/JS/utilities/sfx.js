/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   UTILITIES/SFX.JS
   Sound effects, haptic feedback, confetti burst.
   ============================================================ */

export function playSFX(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    if (type === "correct") {
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0, ctx.currentTime);
      masterGain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 0.015);
      masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.75);
      masterGain.connect(ctx.destination);

      [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type = i === 3 ? "triangle" : "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        g.gain.setValueAtTime(i === 3 ? 0.5 : 1.0, ctx.currentTime);
        osc.connect(g); g.connect(masterGain);
        osc.start(ctx.currentTime + i * 0.03);
        osc.stop(ctx.currentTime + 0.75);
      });

      const shimmer = ctx.createOscillator();
      const shimGain = ctx.createGain();
      shimmer.type = "sine";
      shimmer.frequency.setValueAtTime(2093, ctx.currentTime);
      shimmer.frequency.exponentialRampToValueAtTime(3000, ctx.currentTime + 0.18);
      shimGain.gain.setValueAtTime(0.18, ctx.currentTime);
      shimGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      shimmer.connect(shimGain); shimGain.connect(ctx.destination);
      shimmer.start(ctx.currentTime); shimmer.stop(ctx.currentTime + 0.22);

    } else if (type === "wrong") {
      const notes = [
        { freq: 400, endFreq: 350, start: 0.0,  dur: 0.22 },
        { freq: 340, endFreq: 295, start: 0.20, dur: 0.22 },
        { freq: 280, endFreq: 220, start: 0.40, dur: 0.38 },
      ];
      notes.forEach(({ freq, endFreq, start, dur }, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + start + dur);

        if (i === 2) {
          const vibrato     = ctx.createOscillator();
          const vibratoGain = ctx.createGain();
          vibrato.type = "sine";
          vibrato.frequency.setValueAtTime(5.5, ctx.currentTime + start);
          vibratoGain.gain.setValueAtTime(6, ctx.currentTime + start);
          vibrato.connect(vibratoGain);
          vibratoGain.connect(osc.frequency);
          vibrato.start(ctx.currentTime + start + 0.12);
          vibrato.stop(ctx.currentTime + start + dur);
        }

        gain.gain.setValueAtTime(0, ctx.currentTime + start);
        gain.gain.linearRampToValueAtTime(0.38, ctx.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur + 0.01);
      });
    }
  } catch (_) {}
}

export function playHaptic(type) {
  if (!navigator.vibrate) return;
  if (type === "correct") navigator.vibrate(40);
  else navigator.vibrate([40, 60, 40]);
}

export function playBurst() {
  const colors = ["#e8c96d","#f97316","#4c8fff","#a78bfa","#34d399","#f472b6"];
  for (let i = 0; i < 42; i++) {
    const dot   = document.createElement("div");
    const size  = Math.random() * 9 + 5;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const angle = Math.random() * 360;
    const dist  = Math.random() * 200 + 80;
    const dur   = Math.random() * 700 + 650;
    const isCircle = Math.random() > 0.4;

    dot.style.cssText = `
      position:fixed; left:50%; top:42%;
      width:${size}px; height:${size}px;
      border-radius:${isCircle ? "50%" : "3px"};
      background:${color};
      pointer-events:none; z-index:9999;
      transform:translate(-50%,-50%);
    `;
    document.body.appendChild(dot);

    const rad = (angle * Math.PI) / 180;
    const tx  = Math.cos(rad) * dist;
    const ty  = Math.sin(rad) * dist - 60;

    dot.animate(
      [
        { transform: `translate(-50%,-50%) scale(1) rotate(0deg)`, opacity: 1 },
        { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(0) rotate(${Math.random() * 360}deg)`, opacity: 0 },
      ],
      { duration: dur, easing: "cubic-bezier(0, 0.9, 0.57, 1)", fill: "forwards" },
    ).onfinish = () => dot.remove();
  }
}
