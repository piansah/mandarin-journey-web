/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   UTILITIES/TTS.JS
   ============================================================ */

let _ttsVoices = [];
let _ttsCurrentText = null;

const _TTS_SPEEDS = [
  { rate: 1.0, label: "Normal" },
  { rate: 0.6, label: "Pelan" },
  { rate: 0.4, label: "Lebih Pelan" },
];
let _ttsTapCount = 0;
let _ttsTapText = null;
let _ttsTapTimer = null;

function _loadTTSVoices() {
  _ttsVoices = window.speechSynthesis.getVoices();
}

if (window.speechSynthesis) {
  _loadTTSVoices();
  window.speechSynthesis.onvoiceschanged = _loadTTSVoices;
}

let _ttsBadgeTimer = null;
function _ttsShowSpeedBadge(label, rate) {
  let badge = document.getElementById("tts-speed-badge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "tts-speed-badge";
    badge.style.cssText = [
      "position:fixed",
      "bottom:96px",
      "left:50%",
      "transform:translateX(-50%) translateY(6px)",
      "background:rgba(20,20,36,0.92)",
      "border:1px solid rgba(232,201,109,0.35)",
      "border-radius:20px",
      "padding:5px 14px",
      "font-family:'Poppins',sans-serif",
      "font-size:12px",
      "color:#e8c96d",
      "pointer-events:none",
      "z-index:9998",
      "opacity:0",
      "transition:opacity 0.18s ease, transform 0.18s ease",
      "white-space:nowrap",
    ].join(";");
    document.body.appendChild(badge);
  }
  const icon = rate >= 1.0 ? "🔊" : rate >= 0.6 ? "🐢" : "🐌";
  badge.textContent = `${icon} ${label}`;
  if (_ttsBadgeTimer) clearTimeout(_ttsBadgeTimer);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      badge.style.opacity = "1";
      badge.style.transform = "translateX(-50%) translateY(0)";
    });
  });
  _ttsBadgeTimer = setTimeout(() => {
    badge.style.opacity = "0";
    badge.style.transform = "translateX(-50%) translateY(6px)";
  }, 1600);
}

export function speakMandarin(text, _ignoredRate, silent = false) {
  if (!window.speechSynthesis || !text) return;

  // Pastikan voices sudah ter-load
  if (_ttsVoices.length === 0) {
    _ttsVoices = window.speechSynthesis.getVoices();
  }

  if (text !== _ttsTapText) {
    _ttsTapCount = 0;
    _ttsTapText = text;
  }

  const stepIdx = _ttsTapCount % _TTS_SPEEDS.length;
  const { rate, label } = _TTS_SPEEDS[stepIdx];
  _ttsTapCount++;

  if (_ttsTapTimer) clearTimeout(_ttsTapTimer);
  _ttsTapTimer = setTimeout(() => {
    _ttsTapCount = 0;
    _ttsTapText = null;
  }, 8000);

  if (!silent) _ttsShowSpeedBadge(label, rate);

  // Fix: cancel dulu, lalu delay sebentar sebelum speak
  speechSynthesis.cancel();
  _ttsCurrentText = text;

  setTimeout(() => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "zh-CN";
    utter.rate = rate;
    utter.pitch = 1;

    // Reload voices kalau masih kosong
    const voices = window.speechSynthesis.getVoices();
    const zhVoice = voices.find(
      (v) => v.lang.startsWith("zh-CN") || v.lang.startsWith("zh"),
    );
    if (zhVoice) utter.voice = zhVoice;

    utter.onend = () => {
      _ttsCurrentText = null;
    };
    utter.onerror = () => {
      _ttsCurrentText = null;
    };

    speechSynthesis.speak(utter);
  }, 50); // delay 50ms setelah cancel
}

export function cancelTTS() {
  _ttsCurrentText = null;
  _ttsTapCount = 0;
  _ttsTapText = null;
  if (_ttsTapTimer) {
    clearTimeout(_ttsTapTimer);
    _ttsTapTimer = null;
  }
  speechSynthesis.cancel();
}

window.speakMandarin = speakMandarin;
