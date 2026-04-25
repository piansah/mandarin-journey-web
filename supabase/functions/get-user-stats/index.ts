// supabase/functions/get-user-stats/index.ts
// Edge Function — kalkulasi XP, rank, dan stats user secara server-side.
// Dipanggil dari profile.js dan dashboard.js sebagai pengganti kalkulasi client-side.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ── Konstanta XP (harus sinkron dengan level.js di client) ── */
const XP_HIGH = 36;
const XP_MID  = 18;
const XP_LOW  = 9;
const XP_FLAT = 36;
const XP_CAP  = 36;

function xpFromScore(score: number): number {
  if (score >= 80) return XP_HIGH;
  if (score >= 60) return XP_MID;
  return XP_LOW;
}

interface ScoreRow {
  type: string;
  score: number;
}

function calcXPFromRows(rows: ScoreRow[]): number {
  let xp = 0;
  for (const { type, score } of rows) {
    switch (type) {
      case "quiz":
      case "kal":
      case "grammar":
        xp += xpFromScore(score);
        break;
      case "hanzi":
        if (score >= 100) xp += XP_FLAT;
        break;
      case "cerita":
        if (score >= 95) xp += XP_FLAT;
        break;
      case "fc_session":
      case "nada_session":
      case "speaking_session":
        xp += Math.min(score || 0, XP_CAP);
        break;
      case "cerita_quiz":
        xp += score >= 80 ? 20 : score >= 60 ? 12 : 6;
        break;
    }
  }
  return xp;
}

Deno.serve(async (req: Request) => {
  /* ── CORS preflight ── */
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  /* ── Ambil JWT dari header Authorization ── */
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  /* ── Init Supabase client dengan service role (server-side) ── */
  const supabaseUrl  = Deno.env.get("SUPABASE_URL")!;
  const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userJwt      = authHeader.replace("Bearer ", "");

  // Client untuk verifikasi user (pakai JWT-nya sendiri)
  const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${userJwt}` } },
  });

  // Client untuk baca data semua user (rank) — service role, tidak dikirim ke browser
  const adminClient = createClient(supabaseUrl, serviceKey);

  /* ── Verifikasi user dari JWT ── */
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Invalid token" }, { status: 401 });
  }

  const userId = user.id;

  try {
    /* ── Ambil skor user saat ini ── */
    const { data: myScores, error: scoresErr } = await adminClient
      .from("user_scores")
      .select("key, score, type")
      .eq("user_id", userId);

    if (scoresErr) throw scoresErr;

    const allMyScores: ScoreRow[] = myScores || [];
    const myXP = calcXPFromRows(allMyScores);

    /* ── Hitung akurasi quiz ── */
    const quizRows = allMyScores.filter(r => r.type === "quiz" && r.score != null);
    const akurasi = quizRows.length
      ? Math.round(quizRows.reduce((s, r) => s + (r.score || 0), 0) / quizRows.length)
      : 0;

    const sesiCount = allMyScores.length;

    /* ── Hitung rank (server-side, data tidak bocor ke client) ── */
    // Ambil hanya kolom yang diperlukan untuk kalkulasi XP semua user
    const { data: allUserScores, error: rankErr } = await adminClient
      .from("user_scores")
      .select("user_id, type, score");

    let rank = 0;
    if (!rankErr && allUserScores) {
      // Grup per user_id
      const xpMap = new Map<string, ScoreRow[]>();
      for (const row of allUserScores) {
        if (!xpMap.has(row.user_id)) xpMap.set(row.user_id, []);
        xpMap.get(row.user_id)!.push({ type: row.type, score: row.score });
      }

      // Hitung XP tiap user, hitung berapa yang di atas kita
      let higher = 0;
      for (const [uid, rows] of xpMap.entries()) {
        if (uid === userId) continue;
        if (calcXPFromRows(rows) > myXP) higher++;
      }
      rank = higher + 1;
    }

    /* ── Ambil jumlah kosakata (user_card_progress) ── */
    const { count: kosakataCount } = await adminClient
      .from("user_card_progress")
      .select("card_id", { count: "exact", head: true })
      .eq("user_id", userId);

    /* ── Kembalikan hanya data yang diperlukan client ── */
    return Response.json(
      {
        xp: myXP,
        rank,           // angka saja, bukan raw data user lain
        akurasi,
        sesiCount,
        kosakataCount: kosakataCount ?? 0,
        // breakdown per type untuk keperluan dashboard (tanpa raw scores semua user)
        scoreTypes: allMyScores.reduce<Record<string, number[]>>((acc, r) => {
          if (!acc[r.type]) acc[r.type] = [];
          acc[r.type].push(r.score);
          return acc;
        }, {}),
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("get-user-stats error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
});