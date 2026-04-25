import { supa } from "../core/config.js";

let _statsCache = null;
let _statsCacheTime = 0;
const CACHE_TTL_MS = 60_000;

function _withTimeout(promise, label, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout`)), ms),
    ),
  ]);
}

// ── Retry helper: coba ulang N kali dengan delay eksponensial ──
async function _withRetry(fn, retries = 3, baseDelayMs = 800) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      const isNetworkError =
        err?.message?.includes("NetworkError") ||
        err?.message?.includes("Failed to fetch") ||
        err?.code === "" ||
        err?.details === "";

      if (attempt < retries && isNetworkError) {
        const delay = baseDelayMs * Math.pow(2, attempt); // 800, 1600, 3200ms
        console.warn(
          `fetchUserStats: NetworkError, retry ${attempt + 1}/${retries} in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

// ── Guard: tunggu Supabase auth session siap sebelum RPC ──
async function _waitForSession(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const {
      data: { session },
    } = await supa.auth.getSession();
    if (session?.access_token) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false; // timeout, lanjut saja
}

export async function fetchUserStats(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _statsCache && now - _statsCacheTime < CACHE_TTL_MS) {
    return _statsCache;
  }

  try {
    // Pastikan session tersedia sebelum memanggil RPC
    await _waitForSession();

    const data = await _withRetry(async () => {
      const { data, error } = await _withTimeout(
        supa.rpc("get_user_stats"),
        "get_user_stats",
      );
      if (error) throw error;
      return data;
    });

    _statsCache = data;
    _statsCacheTime = Date.now();
    return data;
  } catch (err) {
    console.error("fetchUserStats:", err);
    return null;
  }
}

export function invalidateStatsCache() {
  _statsCache = null;
  _statsCacheTime = 0;
}

// FIX: expose ke window agar modul lain (nada, fc, hanzi, cerita, lesson) bisa invalidate tanpa circular import
window.invalidateStatsCache = invalidateStatsCache;
