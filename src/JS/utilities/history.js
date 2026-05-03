/* © 2026 Piansah — Mandarin Journey. All rights reserved. */
/* ============================================================
   HISTORY.JS — Search & OCR History Management (Supabase + LS)
   ============================================================ */

import { supa } from "../core/config.js";
import { getCurrentUser } from "../core/auth.js";
import { lsGet, lsSet } from "./helpers.js";

const LS_HISTORY_KEY = "hsk_search_history_v1";

export async function saveSearchHistory(query) {
  if (!query || query.trim().length === 0) return;
  const cleanQuery = query.trim();

  // 1. VALIDASI: Hanya simpan jika mengandung karakter Mandarin (Hanzi)
  const hasHanzi = /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(cleanQuery);
  if (!hasHanzi) return;

  // 2. Local Storage (De-duplication sederhana)
  const localHistory = lsGet(LS_HISTORY_KEY, []);
  const filtered = localHistory.filter(h => h.query !== cleanQuery);
  filtered.unshift({ query: cleanQuery, created_at: new Date().toISOString() });
  lsSet(LS_HISTORY_KEY, filtered.slice(0, 10));

  // 3. Supabase (Anti-Duplikat Total)
  const user = getCurrentUser();
  if (user) {
    try {
      // Cari semua entri lama dengan kueri yang sama (siapa tahu ada duplikat dari bug lama)
      const { data: existing } = await supa
        .from("user_search_history")
        .select("id")
        .eq("user_id", user.id)
        .eq("query", cleanQuery);

      if (existing && existing.length > 0) {
        // Update waktu entri pertama jadi terbaru
        await supa.from("user_search_history")
          .update({ created_at: new Date().toISOString() })
          .eq("id", existing[0].id);
        
        // Hapus sisa duplikatnya (jika ada lebih dari 1)
        if (existing.length > 1) {
          const idsToDelete = existing.slice(1).map(item => item.id);
          await supa.from("user_search_history")
            .delete()
            .in("id", idsToDelete);
        }
      } else {
        // Jika benar-benar baru, baru di-insert
        await supa.from("user_search_history").insert({
          user_id: user.id,
          query: cleanQuery,
          is_archived: false
        });
      }
    } catch (err) {
      console.error("[History] Gagal sinkronisasi database:", err);
    }
  }
}

export async function getSearchHistory(includeArchived = false) {
  const user = getCurrentUser();
  if (!user) return lsGet(LS_HISTORY_KEY, []);

  try {
    let q = supa
      .from("user_search_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!includeArchived) q = q.eq("is_archived", false);

    const { data, error } = await q;
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("[History] Gagal mengambil riwayat:", err);
    return lsGet(LS_HISTORY_KEY, []);
  }
}

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
  }
}

window.saveSearchHistory = saveSearchHistory;
window.getSearchHistory = getSearchHistory;
window.updateHistoryStatus = updateHistoryStatus;
