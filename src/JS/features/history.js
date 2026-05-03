/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   HISTORY.JS — Search & OCR History Management (Supabase + LS)
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { showToast, lsGet, lsSet } from "../utilities/helpers.js";

const LS_HISTORY_KEY = "hsk_search_history_v1";

/**
 * Menyimpan riwayat pencarian (Text atau OCR)
 * @param {string} query - Kalimat atau kata yang dicari
 */
export async function saveSearchHistory(query) {
  if (!query || query.trim().length === 0) return;
  const cleanQuery = query.trim();

  // 1. Simpan ke Local Storage untuk akses cepat (max 10 item)
  const localHistory = lsGet(LS_HISTORY_KEY, []);
  const filtered = localHistory.filter(h => h.query !== cleanQuery);
  filtered.unshift({ query: cleanQuery, created_at: new Date().toISOString() });
  lsSet(LS_HISTORY_KEY, filtered.slice(0, 10));

  // 2. Simpan ke Supabase jika login
  const user = getCurrentUser();
  if (user) {
    try {
      // Cek apakah query yang sama sudah ada hari ini (opsional, untuk de-duplication)
      await supa.from("user_search_history").upsert({
        user_id: user.id,
        query: cleanQuery,
        is_archived: false,
        created_at: new Date().toISOString()
      }, { onConflict: 'user_id,query' }).catch(() => {
        // Jika tidak ada constraint unique, pakai insert biasa
        return supa.from("user_search_history").insert({
          user_id: user.id,
          query: cleanQuery
        });
      });
    } catch (err) {
      console.error("[History] Gagal simpan ke database:", err);
    }
  }
}

/**
 * Mengambil riwayat pencarian
 * @param {boolean} includeArchived - Apakah menyertakan arsip
 */
export async function getSearchHistory(includeArchived = false) {
  const user = getCurrentUser();
  
  // Jika offline/tidak login, ambil dari Local Storage
  if (!user) {
    return lsGet(LS_HISTORY_KEY, []);
  }

  try {
    let query = supa
      .from("user_search_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!includeArchived) {
      query = query.eq("is_archived", false);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("[History] Gagal mengambil riwayat:", err);
    return lsGet(LS_HISTORY_KEY, []);
  }
}

/**
 * Menghapus atau Mengarsipkan riwayat
 */
export async function updateHistoryStatus(id, status = 'delete') {
  const user = getCurrentUser();
  if (!user) return;

  try {
    if (status === 'archive') {
      await supa.from("user_search_history").update({ is_archived: true }).eq("id", id);
    } else {
      await supa.from("user_search_history").delete().eq("id", id);
    }
  } catch (err) {
    console.error("[History] Gagal update status:", err);
    showToast("Gagal mengubah riwayat", "err");
  }
}

// Global exposure
window.saveSearchHistory = saveSearchHistory;
window.getSearchHistory = getSearchHistory;
window.updateHistoryStatus = updateHistoryStatus;
