/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   UTILITIES/SCREEN-ANIM.JS
   Animasi masuk / keluar layar.
   ============================================================ */

const _SCREEN_PRESETS = {
  slideUp:    { from: { transform:"translateY(48px)",  opacity:"0" }, to: { transform:"translateY(0)",   opacity:"1" }, easing:"cubic-bezier(0.34,1.56,0.64,1)", duration:380 },
  fadeIn:     { from: { transform:"none",              opacity:"0" }, to: { transform:"none",             opacity:"1" }, easing:"ease",                            duration:260 },
  pop:        { from: { transform:"scale(0.88)",       opacity:"0" }, to: { transform:"scale(1)",         opacity:"1" }, easing:"cubic-bezier(0.34,1.56,0.64,1)", duration:340 },
  slideLeft:  { from: { transform:"translateX(48px)",  opacity:"0" }, to: { transform:"translateX(0)",    opacity:"1" }, easing:"cubic-bezier(0.25,0.46,0.45,0.94)", duration:320 },
  slideRight: { from: { transform:"translateX(-48px)", opacity:"0" }, to: { transform:"translateX(0)",    opacity:"1" }, easing:"cubic-bezier(0.25,0.46,0.45,0.94)", duration:320 },
};

const _SCREEN_LEAVE_PRESETS = {
  slideDown: { from: { transform:"translateY(0)",    opacity:"1" }, to: { transform:"translateY(32px)", opacity:"0" }, easing:"ease", duration:280 },
  fadeOut:   { from: { transform:"none",             opacity:"1" }, to: { transform:"none",             opacity:"0" }, easing:"ease", duration:220 },
};

export function screenEnter(el, options = {}) {
  if (!el) return;
  const presetName = options.preset || "slideUp";
  const preset     = _SCREEN_PRESETS[presetName] || _SCREEN_PRESETS.slideUp;
  const duration   = options.duration ?? preset.duration;
  const delay      = options.delay    ?? 0;

  el.style.transition = "none";
  Object.assign(el.style, preset.from);
  el.offsetHeight;

  setTimeout(() => {
    el.style.transition = [
      `transform ${duration}ms ${preset.easing}`,
      `opacity ${Math.round(duration * 0.8)}ms ease`,
    ].join(", ");
    Object.assign(el.style, preset.to);
    setTimeout(() => {
      el.style.transition = "";
      el.style.transform  = "";
      el.style.opacity    = "";
    }, duration + delay + 20);
  }, delay);
}

export function screenLeave(el, onDone, options = {}) {
  if (!el) { if (typeof onDone === "function") onDone(); return; }
  const presetName = options.preset || "slideDown";
  const preset     = _SCREEN_LEAVE_PRESETS[presetName] || _SCREEN_LEAVE_PRESETS.slideDown;
  const duration   = options.duration ?? preset.duration;

  el.style.transition = "none";
  Object.assign(el.style, preset.from);
  el.offsetHeight;

  el.style.transition = [
    `transform ${duration}ms ${preset.easing}`,
    `opacity ${duration}ms ${preset.easing}`,
  ].join(", ");
  el.style.pointerEvents = "none";
  Object.assign(el.style, preset.to);

  setTimeout(() => {
    el.style.transition    = "";
    el.style.pointerEvents = "";
    if (typeof onDone === "function") onDone();
  }, duration + 10);
}

export function screenEnterFrom(el, direction = "bottom") {
  const MAP = { bottom:"slideUp", top:"slideRight", left:"slideLeft", right:"slideRight", center:"pop" };
  screenEnter(el, { preset: MAP[direction] || "slideUp" });
}
