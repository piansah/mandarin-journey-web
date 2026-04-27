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
let _ttsTimeout = null;
let _lastSpeakTime = 0; // Lock untuk cegah double call beruntun

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

export function speakMandarin(text, silent = false) {
  if (!window.speechSynthesis || !text) return;

  // Lock: Jika dipanggil lagi dalam < 150ms, abaikan.
  const now = Date.now();
  if (now - _lastSpeakTime < 150) return;
  _lastSpeakTime = now;

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

  // Safari FIX: Harus dipanggil langsung di main thread (tanpa setTimeout)
  // agar dianggap sebagai User Activation.
  window.speechSynthesis.cancel();

  const utter = new SpeechSynthesisUtterance(text);
  // Safari butuh lang yang spesifik
  utter.lang = "zh-CN";
  utter.rate = rate;
  utter.pitch = 1.0;
  utter.volume = 1.0;

  // Cari voice Mandarin
  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find(
    (v) =>
      v.lang === "zh-CN" ||
      v.lang === "zh-TW" ||
      v.lang.startsWith("zh") ||
      v.name.includes("Mandarin") ||
      v.name.includes("Chinese"),
  );
  if (zhVoice) utter.voice = zhVoice;

  utter.onend = () => {
    _ttsCurrentText = null;
  };
  utter.onerror = (e) => {
    console.error("TTS Error:", e);
    _ttsCurrentText = null;
  };

  _ttsCurrentText = text;
  window.speechSynthesis.speak(utter);
}

export function cancelTTS() {
  _ttsCurrentText = null;
  _ttsTapCount = 0;
  _ttsTapText = null;
  if (_ttsTapTimer) {
    clearTimeout(_ttsTapTimer);
    _ttsTapTimer = null;
  }
  if (_ttsTimeout) {
    clearTimeout(_ttsTimeout);
    _ttsTimeout = null;
  }
  speechSynthesis.cancel();
}

window.speakMandarin = speakMandarin;
window.cancelTTS = cancelTTS; // ← tambah ini
