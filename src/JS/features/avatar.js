/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   AVATAR.JS — Koleksi Avatar, Unlock, Picker, Save/Load
   PAKAI FILE PNG LOKAL (1.jpg - 15.jpg)
   Simpan file di: /avatars/
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showToast } from "../utilities/helpers.js";
import { calcLevel } from "../core/level.js";

/* ══════════════════════════════════════════════
   1. KOLEKSI AVATAR
══════════════════════════════════════════════ */

export const AVATAR_COLLECTION = [
  {
    id: "av_1",
    tier: 1,
    minLevel: 0,
    name: "Murid Baru",
    hanzi: "初",
    imageUrl: "/avatars/1.jpg",
    desc: "Langkah pertama perjalanan Mandarin.",
  },
  {
    id: "av_2",
    tier: 1,
    minLevel: 0,
    name: "Si Pendiam",
    hanzi: "静",
    imageUrl: "/avatars/2.jpg",
    desc: "Belajar dalam diam, tumbuh dalam hati.",
  },
  {
    id: "av_3",
    tier: 1,
    minLevel: 0,
    name: "Pengembara",
    hanzi: "旅",
    imageUrl: "/avatars/3.jpg",
    desc: "Tak kenal lelah mencari ilmu.",
  },
  {
    id: "av_4",
    tier: 2,
    minLevel: 21,
    name: "Pelajar Kota",
    hanzi: "学",
    imageUrl: "/avatars/4.jpg",
    desc: "Semangat baru, kota baru.",
  },
  {
    id: "av_5",
    tier: 2,
    minLevel: 21,
    name: "Kutu Buku",
    hanzi: "书",
    imageUrl: "/avatars/5.jpg",
    desc: "Buku adalah jendela dunia.",
  },
  {
    id: "av_6",
    tier: 2,
    minLevel: 25,
    name: "Si Semangat",
    hanzi: "火",
    imageUrl: "/avatars/6.jpg",
    desc: "Antusias di setiap sesi belajar.",
  },
  {
    id: "av_7",
    tier: 3,
    minLevel: 41,
    name: "Seniman Hanzi",
    hanzi: "艺",
    imageUrl: "/avatars/7.jpg",
    desc: "Menulis hanzi seperti melukis jiwa.",
  },
  {
    id: "av_8",
    tier: 3,
    minLevel: 41,
    name: "Petualang",
    hanzi: "探",
    imageUrl: "/avatars/8.jpg",
    desc: "Bahasa membuka pintu dunia.",
  },
  {
    id: "av_9",
    tier: 3,
    minLevel: 45,
    name: "Guru Muda",
    hanzi: "师",
    imageUrl: "/avatars/9.jpg",
    desc: "Berbagi ilmu, tumbuh bersama.",
  },
  {
    id: "av_10",
    tier: 4,
    minLevel: 61,
    name: "Ksatria Mandarin",
    hanzi: "侠",
    imageUrl: "/avatars/10.jpg",
    desc: "Bahasa adalah senjata terkuatmu.",
  },
  {
    id: "av_11",
    tier: 4,
    minLevel: 61,
    name: "Pertapa Bijak",
    hanzi: "慧",
    imageUrl: "/avatars/11.jpg",
    desc: "Ketenangan adalah kekuatan sejati.",
  },
  {
    id: "av_12",
    tier: 4,
    minLevel: 70,
    name: "Naga Emas",
    hanzi: "龙",
    imageUrl: "/avatars/12.jpg",
    desc: "Kekayaan ilmu yang tak ternilai.",
  },
  {
    id: "av_13",
    tier: 5,
    minLevel: 81,
    name: "Huáyǔ Dàshī",
    hanzi: "大",
    imageUrl: "/avatars/13.jpg",
    desc: "华语大师 — Penguasa bahasa Mandarin.",
  },
  {
    id: "av_14",
    tier: 5,
    minLevel: 90,
    name: "Sang Legenda",
    hanzi: "传",
    imageUrl: "/avatars/14.jpg",
    desc: "Namamu tercatat dalam sejarah belajar.",
  },
  {
    id: "av_15",
    tier: 5,
    minLevel: 100,
    name: "Naga Merah",
    hanzi: "王",
    imageUrl: "/avatars/15.jpg",
    desc: "龙王 — Raja para pelajar Mandarin.",
  },
];

const TIER_META = [
  { tier: 1, color: "#9999bb", label: "Pemula" },
  { tier: 2, color: "#60a5fa", label: "Pelajar" },
  { tier: 3, color: "#4ade80", label: "Mahir" },
  { tier: 4, color: "#e8c96d", label: "Ahli" },
  { tier: 5, color: "#f97316", label: "Master" },
];

/* ══════════════════════════════════════════════
   2. STATE & CACHE
══════════════════════════════════════════════ */

let _activeAvatarId = null;
let _avatarCacheLoaded = false;
let _customAvatarUrl = null;

/* ══════════════════════════════════════════════
   3. HELPER
══════════════════════════════════════════════ */

function getAvatarUrl(av) {
  return av.imageUrl;
}

export function getActiveAvatarUrl() {
  if (_customAvatarUrl) return _customAvatarUrl;
  const av =
    AVATAR_COLLECTION.find((a) => a.id === _activeAvatarId) ||
    AVATAR_COLLECTION[0];
  return getAvatarUrl(av);
}

function _getCurrentLevel() {
  if (typeof window._calcUserXP === "function") {
    return calcLevel(window._calcUserXP());
  }
  return 1;
}

function _isUnlocked(av) {
  return _getCurrentLevel() >= av.minLevel;
}

/* ══════════════════════════════════════════════
   4. LOAD & SAVE KE SUPABASE
══════════════════════════════════════════════ */

export async function initAvatarSystem() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  if (_avatarCacheLoaded && _activeAvatarId) return;
  try {
    const { data, error } = await supa
      .from("user_profile")
      .select("selected_avatar, custom_avatar_url")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (!error && data) {
      _customAvatarUrl = data.custom_avatar_url || null;
      _activeAvatarId = data.selected_avatar || AVATAR_COLLECTION[0].id;
      if (typeof window._profileCache !== "undefined" && window._profileCache) {
        window._profileCache.custom_avatar_url = _customAvatarUrl;
      }
    } else {
      _activeAvatarId = AVATAR_COLLECTION[0].id;
      _customAvatarUrl = null;
    }

    _avatarCacheLoaded = true;
    _refreshAvatarUI();
  } catch (e) {
    console.error("initAvatarSystem:", e);
  }
}

async function _saveSelectedAvatar(avatarId) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;
  _activeAvatarId = avatarId;
  _customAvatarUrl = null;
  _refreshAvatarUI();

  try {
    await supa.from("user_profile").upsert(
      {
        user_id: currentUser.id,
        selected_avatar: avatarId,
        custom_avatar_url: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (typeof window._profileCache !== "undefined" && window._profileCache) {
      window._profileCache.selected_avatar = avatarId;
      window._profileCache.custom_avatar_url = null;
    }
  } catch (e) {
    console.error("_saveSelectedAvatar:", e);
  }
}

/* ══════════════════════════════════════════════
   5. REFRESH UI
══════════════════════════════════════════════ */

function _refreshAvatarUI() {
  const url = getActiveAvatarUrl();
  const currentUser = getCurrentUser();

  const fab = document.getElementById("auth-fab");
  if (fab && currentUser) {
    fab.innerHTML = `<img src="${url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`;
  }

  const ring = document.getElementById("upv2-avatar-img");
  if (ring) ring.src = url;

  const profInner = document.getElementById("prof-avatar-inner");
  if (profInner) {
    profInner.innerHTML = `<img src="${url}" alt="Avatar">`;
  }

  const navAvatar = document.querySelector("#bottom-navbar .bnav-avatar-img");
  if (navAvatar) navAvatar.src = url;
}

/* ══════════════════════════════════════════════
   6. INJECT AVATAR KE PROFILE
══════════════════════════════════════════════ */

export function _injectAvatarToProfile() {
  const ring = document.getElementById("upv2-avatar-img");
  if (ring) ring.src = getActiveAvatarUrl();
}

/* ══════════════════════════════════════════════
   7. AVATAR PICKER MODAL
══════════════════════════════════════════════ */

export function openAvatarPicker() {
  const old = document.getElementById("avatar-picker-overlay");
  if (old) old.remove();

  const level = _getCurrentLevel();

  const overlay = document.createElement("div");
  overlay.id = "avatar-picker-overlay";
  overlay.className = "av-picker-overlay";
  overlay.onclick = (e) => {
    if (e.target === overlay) closeAvatarPicker();
  };

  overlay.innerHTML = `
    <div class="av-picker-modal">
      <div class="av-picker-header">
        <span class="av-picker-title">Pilih Avatar</span>
        <button class="av-picker-close" onclick="window.closeAvatarPicker()">✕</button>
      </div>
      <div class="av-picker-body" id="av-picker-body">
        <div class="av-upload-section">
          <button class="av-upload-btn" onclick="window.uploadCustomAvatar()">Upload Foto</button>
          <button class="av-remove-btn" onclick="window.removeCustomAvatar()">Hapus Foto</button>
        </div>
        <div class="av-divider"></div>
        ${_buildPickerHTML(level)}
      </div>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => overlay.classList.add("active")),
  );
}

export function closeAvatarPicker() {
  const overlay = document.getElementById("avatar-picker-overlay");
  if (!overlay) return;
  overlay.classList.remove("active");
  overlay.addEventListener("transitionend", () => overlay.remove(), {
    once: true,
  });
}

function _buildPickerHTML(level) {
  let html = "";
  for (const tm of TIER_META) {
    const avatarsInTier = AVATAR_COLLECTION.filter((a) => a.tier === tm.tier);
    html += `
      <div class="av-tier-row">
        <div class="av-tier-label">
          <span class="av-tier-dot" style="background:${tm.color}"></span>
          ${tm.label}
        </div>
        <div class="av-grid">`;

    for (const av of avatarsInTier) {
      const unlocked = level >= av.minLevel;
      const active = av.id === _activeAvatarId && !_customAvatarUrl;
      const cls = [
        "av-card",
        unlocked ? "unlocked" : "locked",
        active ? "active" : "",
      ]
        .join(" ")
        .trim();
      const onclick = unlocked ? `window.onSelectAvatar('${av.id}')` : "";
      html += `
        <div class="${cls}" ${onclick ? `onclick="${onclick}"` : ""} title="${av.name}">
          <div class="av-card-img">
            <img src="${av.imageUrl}" loading="lazy" alt="${av.name}">
            ${!unlocked ? `<div class="av-lock-veil"><span class="av-lock-icon">🔒</span><span class="av-lock-lv">Lv ${av.minLevel}</span></div>` : ""}
            ${active ? `<div class="av-active-tick">✓</div>` : ""}
          </div>
          <div class="av-card-name">${av.name}</div>
          <div class="av-card-hanzi">${av.hanzi}</div>
        </div>`;
    }
    html += `</div></div>`;
  }
  return html;
}

export function onSelectAvatar(avatarId) {
  document.querySelectorAll(".av-card").forEach((c) => {
    c.classList.remove("active");
    const tick = c.querySelector(".av-active-tick");
    if (tick) tick.remove();
  });

  const picked = document.querySelector(
    `[onclick="window.onSelectAvatar('${avatarId}')"]`,
  );
  if (picked) {
    picked.classList.add("active");
    const img = picked.querySelector(".av-card-img");
    if (img && !img.querySelector(".av-active-tick")) {
      const tick = document.createElement("div");
      tick.className = "av-active-tick";
      tick.textContent = "✓";
      img.appendChild(tick);
    }
  }

  _customAvatarUrl = null;
  _saveSelectedAvatar(avatarId);
  setTimeout(closeAvatarPicker, 350);
}

/* ══════════════════════════════════════════════
   8. RESET SAAT LOGOUT
══════════════════════════════════════════════ */

export function resetAvatarCache() {
  _activeAvatarId = null;
  _avatarCacheLoaded = false;
  _customAvatarUrl = null;
}

/* ══════════════════════════════════════════════
   9. UPLOAD FOTO SENDIRI
══════════════════════════════════════════════ */

export function uploadCustomAvatar() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/jpeg,image/png,image/jpg,image/webp";
  input.style.display = "none";
  document.body.appendChild(input);

  input.onchange = (e) => {
    document.body.removeChild(input);
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Pilih file gambar (JPEG/PNG)", "err");
      return;
    }

    // Gunakan Object URL (Jauh lebih hemat memori daripada FileReader/Base64)
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      // Bebaskan memori segera setelah gambar dimuat
      URL.revokeObjectURL(objectUrl);

      // --- Kompresi Gambar (Industry Standard) ---
      const canvas = document.createElement("canvas");
      const MAX_SIZE = 500; 
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) {
          height *= MAX_SIZE / width;
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width *= MAX_SIZE / height;
          height = MAX_SIZE;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(async (blob) => {
        if (blob) {
          await _saveCustomAvatar(blob);
        } else {
          showToast("Gagal memproses gambar", "err");
        }
      }, "image/jpeg", 0.85);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      showToast("Gagal membaca file gambar", "err");
    };

    img.src = objectUrl;
  };

  // Fallback: kalau user cancel (tidak pilih file), tetap bersihkan DOM
  input.addEventListener("cancel", () => {
    if (document.body.contains(input)) document.body.removeChild(input);
  });

  input.click();
}

async function _saveCustomAvatar(blob) {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  // Preview instan pakai Object URL (Hemat memori dibanding Base64)
  const previewUrl = URL.createObjectURL(blob);
  _customAvatarUrl = previewUrl;
  _refreshAvatarUI();
  closeAvatarPicker();

  try {
    const ext = "jpg"; // Hasil kompresi kita selalu JPEG
    const filePath = `${currentUser.id}/avatar.${ext}`;

    const { error: uploadError } = await supa.storage
      .from("avatars")
      .upload(filePath, blob, { upsert: true, contentType: "image/jpeg" });

    if (uploadError) {
      console.error("[Avatar] Upload error:", uploadError);
      throw new Error(`Upload gagal: ${uploadError.message || "Izin ditolak atau bucket tidak ditemukan"}`);
    }

    // Coba ambil Public URL dulu (lebih stabil daripada Signed URL jika bucket publik)
    const { data: publicData } = supa.storage
      .from("avatars")
      .getPublicUrl(filePath);
    
    let finalUrl = publicData?.publicUrl;

    // Jika tidak dapat public URL, baru pakai Signed URL
    if (!finalUrl) {
      const { data: signedData, error: signedError } = await supa.storage
        .from("avatars")
        .createSignedUrl(filePath, 60 * 60 * 24 * 365);
      if (signedError) throw signedError;
      finalUrl = signedData.signedUrl;
    }

    const { error: profileError } = await supa
      .from("user_profile")
      .update({
        custom_avatar_url: finalUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", currentUser.id);

    if (profileError) {
      console.error("[Avatar] Profile update error:", profileError);
      throw new Error(`Gagal sinkronisasi profil: ${profileError.message}`);
    }

    _customAvatarUrl = finalUrl;
    _refreshAvatarUI();

    if (window._profileCache) {
      window._profileCache.custom_avatar_url = finalUrl;
    }

    showToast("Foto berhasil diupdate! ✨", "ok");
  } catch (e) {
    console.error("_saveCustomAvatar error detail:", e);
    // Tampilkan pesan error spesifik ke user biar kita tau kenapa gagalnya
    showToast(e.message || "Gagal upload foto", "err");
    _customAvatarUrl = null;
    _refreshAvatarUI();
  }
}
export async function removeCustomAvatar() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  _customAvatarUrl = null;
  _activeAvatarId = "av_1";
  _refreshAvatarUI();
  closeAvatarPicker();

  try {
    await supa.from("user_profile").upsert(
      {
        user_id: currentUser.id,
        custom_avatar_url: null,
        selected_avatar: "av_1",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

    if (typeof window._profileCache !== "undefined" && window._profileCache) {
      window._profileCache.custom_avatar_url = null;
      window._profileCache.selected_avatar = "av_1";
    }

    showToast("Kembali ke avatar default", "ok");
  } catch (e) {
    console.error("removeCustomAvatar:", e);
    showToast("Gagal menghapus foto", "err");
  }
}

export function getCustomAvatarUrl() {
  return _customAvatarUrl;
}

window.AVATAR_COLLECTION = AVATAR_COLLECTION;

/* ── Expose ke window untuk dipanggil dari HTML onclick ── */
window.getActiveAvatarUrl = getActiveAvatarUrl;
window.initAvatarSystem = initAvatarSystem;
window.openAvatarPicker = openAvatarPicker;
window.closeAvatarPicker = closeAvatarPicker;
window.onSelectAvatar = onSelectAvatar;
window.resetAvatarCache = resetAvatarCache;
window.uploadCustomAvatar = uploadCustomAvatar;
window.removeCustomAvatar = removeCustomAvatar;
window._injectAvatarToProfile = _injectAvatarToProfile;
window.getCustomAvatarUrl = getCustomAvatarUrl;
