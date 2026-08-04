import { NextRequest } from "next/server";
import { failure, success } from "../http/response";
import { getAuthContext, requirePermission } from "../auth/permissions";
import { buildReview } from "../utils/session-summary";
import { getActorContext, logActivity } from "./activity.service";

type AttendanceReviewRow = {
  source_name: string;
  normalized_name: string;
  resolved_type: "player" | "visitor";
  resolved_id: string | null;
  resolved_name: string;
};

type GoalReviewRow = {
  source_name: string;
  normalized_name: string;
  goals: number;
  resolved_type: "player" | "visitor";
  resolved_id: string | null;
  resolved_name: string | null;
  status: "ok" | "needs_review";
};

type CardReviewRow = {
  source_name: string;
  normalized_name: string;
  card_type: "yellow" | "red";
  count: number;
  paid_count: number;
  resolved_type: "player" | "visitor";
  resolved_id: string | null;
  resolved_name: string;
};

type ReviewPayload = {
  attendance: AttendanceReviewRow[];
  goals: GoalReviewRow[];
  cards: CardReviewRow[];
  visitors_to_create: Array<{ source_name: string; normalized_name: string }>;
  warnings: string[];
  can_commit: boolean;
};

function normalizeName(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\.\,\(\)\[\]\{\}\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

async function upsertVisitorStats(supabase: any, payload: any | any[]) {
  const { error } = await supabase.from("visitor_stats").upsert(payload, { onConflict: "visitor_id" });
  if (!error) return null;

  const stripGoals = (row: any) => {
    const { goals, ...fallbackRow } = row;
    return fallbackRow;
  };
  const fallbackPayload = Array.isArray(payload) ? payload.map(stripGoals) : stripGoals(payload);
  return supabase.from("visitor_stats").upsert(fallbackPayload, { onConflict: "visitor_id" });
}

export async function getSessionSummaries(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return failure("Unauthorized", 401);
    const { supabase } = auth;
    const { searchParams } = new URL(request.url);
    const date = String(searchParams.get("date") || "").trim();

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return failure("Invalid date format. Use YYYY-MM-DD.", 400);
      const { data, error } = await supabase
        .from("session_summaries")
        .select("id, session_date, raw_text, review_json, created_by, created_at, updated_at")
        .eq("session_date", date)
        .maybeSingle();
      if (error) return failure(error.message, 400);
      return success(data || null);
    }

    const { data, error } = await supabase
      .from("session_summaries")
      .select("id, session_date, created_by, created_at, updated_at")
      .order("session_date", { ascending: false })
      .limit(20);
    if (error) return failure(error.message, 400);
    return success(data ?? []);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to fetch session summaries.", 500);
  }
}

export async function reviewSessionSummary(request: NextRequest) {
  try {
    const check = await requirePermission(request, "manage_attendance");
    if (!check.ok || !check.auth) return check.response;
    const { supabase } = check.auth;

    const body = await request.json();
    const rawText = String(body?.raw_text || body?.rawText || "").trim();
    if (!rawText) return failure("raw_text is required.", 400);

    const [{ data: players }, { data: visitors }] = await Promise.all([
      supabase.from("players").select("id, full_name, nickname"),
      supabase.from("visitors").select("id, full_name, nickname")
    ]);

    const playerRows = (players ?? []).map((row: any) => ({
      id: row.id,
      name: row.full_name,
      nickname: row.nickname
    }));
    const visitorRows = (visitors ?? []).map((row: any) => ({
      id: row.id,
      name: row.full_name,
      nickname: row.nickname
    }));

    const review = buildReview(rawText, playerRows, visitorRows);
    return success(review);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to review summary text.", 500);
  }
}

export async function commitSessionSummary(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return failure("Unauthorized", 401);
    const { supabase, user, permissions } = auth;
    if (!permissions.manage_attendance) return failure("Forbidden", 403);

    const body = await request.json();
    const sessionDate = String(body?.session_date || body?.sessionDate || "").trim();
    const rawText = String(body?.raw_text || body?.rawText || "").trim();
    const review = body?.review as ReviewPayload | undefined;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      return failure("session_date must be YYYY-MM-DD.", 400);
    }
    if (!rawText) return failure("raw_text is required.", 400);
    if (!review) return failure("review payload is required.", 400);
    if (!review.can_commit) return failure("Review must be clean before commit.", 400);

    if ((review.goals?.length || 0) > 0 && !permissions.manage_stats) {
      return failure("You do not have permission to update goals.", 403);
    }
    if ((review.cards?.length || 0) > 0 && !permissions.manage_stats) {
      return failure("You do not have permission to update cards.", 403);
    }

    const { data: existingSummary } = await supabase
      .from("session_summaries")
      .select("id")
      .eq("session_date", sessionDate)
      .maybeSingle();

    if (existingSummary?.id) {
      return failure("A committed summary already exists for this date.", 409);
    }

    const [{ data: playerRows }, { data: visitorRows }] = await Promise.all([
      supabase.from("players").select("id, full_name, nickname"),
      supabase.from("visitors").select("id, full_name, nickname")
    ]);

    const playerIds = new Set<string>((playerRows ?? []).map((row: any) => String(row.id)));

    const visitorByNormalized = new Map<string, string>();
    (visitorRows ?? []).forEach((row: any) => {
      const byName = normalizeName(row.full_name || "");
      const byNick = normalizeName(row.nickname || "");
      if (byName) visitorByNormalized.set(byName, String(row.id));
      if (byNick) visitorByNormalized.set(byNick, String(row.id));
    });

    const pendingVisitors = new Map<string, { sourceName: string; normalized: string }>();
    (review.visitors_to_create ?? []).forEach((row) => {
      const normalized = normalizeName(row.normalized_name || row.source_name);
      if (!normalized || visitorByNormalized.has(normalized)) return;
      pendingVisitors.set(normalized, {
        sourceName: titleCase(String(row.source_name || row.normalized_name || "")),
        normalized
      });
    });

    (review.cards ?? []).forEach((row) => {
      if (row.resolved_type !== "visitor") return;
      const normalized = normalizeName(row.normalized_name || row.source_name);
      if (!normalized || visitorByNormalized.has(normalized)) return;
      pendingVisitors.set(normalized, {
        sourceName: titleCase(String(row.resolved_name || row.source_name || normalized)),
        normalized
      });
    });

    const pendingVisitorRows = Array.from(pendingVisitors.values());
    if (pendingVisitorRows.length) {
      const insertPayload = pendingVisitorRows.map((entry) => ({
        full_name: entry.sourceName,
        nickname: null as string | null,
        email: null as string | null
      }));
      const { data: createdVisitors, error: visitorsInsertError } = await supabase
        .from("visitors")
        .insert(insertPayload)
        .select("id, full_name");

      if (visitorsInsertError) {
        return failure(visitorsInsertError.message || "Failed to create visitors.", 400);
      }

      const createdByName = new Map<string, string>(
        (createdVisitors ?? []).map((row: any) => [normalizeName(row.full_name || ""), String(row.id)])
      );
      pendingVisitorRows.forEach((entry) => {
        const id = createdByName.get(entry.normalized);
        if (id) visitorByNormalized.set(entry.normalized, id);
      });

      const visitorStatPayload = (createdVisitors ?? []).map((row: any) => ({
        visitor_id: row.id,
        goals: 0,
        yellow_cards: 0,
        red_cards: 0,
        yellow_paid_count: 0,
        red_paid_count: 0
      }));
      if (visitorStatPayload.length) {
        await upsertVisitorStats(supabase, visitorStatPayload);
      }
    }

    const presentPlayerIds = new Set<string>();
    const presentVisitorIds = new Set<string>();
    (review.attendance ?? []).forEach((row) => {
      if (row.resolved_type === "player" && row.resolved_id && playerIds.has(String(row.resolved_id))) {
        presentPlayerIds.add(String(row.resolved_id));
        return;
      }
      if (row.resolved_type === "visitor") {
        const normalized = normalizeName(row.normalized_name || row.source_name);
        const visitorId = row.resolved_id
          ? String(row.resolved_id)
          : visitorByNormalized.get(normalized) || "";
        if (visitorId) presentVisitorIds.add(visitorId);
      }
    });

    const attendancePayload = Array.from(playerIds).map((playerId) => ({
      player_id: playerId,
      session_date: sessionDate,
      present: presentPlayerIds.has(playerId)
    }));
    if (attendancePayload.length) {
      await supabase.from("player_attendance").upsert(attendancePayload, { onConflict: "player_id,session_date" });
    }

    const visitorAttendancePayload = Array.from(presentVisitorIds).map((visitorId) => ({
      visitor_id: visitorId,
      session_date: sessionDate,
      present: true
    }));
    if (visitorAttendancePayload.length) {
      await supabase
        .from("visitor_attendance")
        .upsert(visitorAttendancePayload, { onConflict: "visitor_id,session_date" });
    }

    const goalIncrements = new Map<string, number>();
    const visitorGoalIncrements = new Map<string, number>();
    (review.goals ?? []).forEach((row) => {
      if (row.status !== "ok") return;
      if (row.resolved_type === "visitor") {
        const normalized = normalizeName(row.normalized_name || row.source_name);
        const visitorId = row.resolved_id ? String(row.resolved_id) : visitorByNormalized.get(normalized) || "";
        if (visitorId) visitorGoalIncrements.set(visitorId, (visitorGoalIncrements.get(visitorId) || 0) + (Number(row.goals) || 0));
        return;
      }
      if (!row.resolved_id) return;
      const playerId = String(row.resolved_id);
      goalIncrements.set(playerId, (goalIncrements.get(playerId) || 0) + (Number(row.goals) || 0));
    });

    const playerCardIncrements = new Map<string, { yellow: number; red: number; yellowPaid: number; redPaid: number }>();
    const visitorCardIncrements = new Map<string, { yellow: number; red: number; yellowPaid: number; redPaid: number }>();

    (review.cards ?? []).forEach((row) => {
      const count = Number(row.count) || 0;
      const paidCountRaw = Number(row.paid_count) || 0;
      const paidCount = Math.max(0, Math.min(paidCountRaw, count));
      if (count <= 0) return;
      if (row.resolved_type === "player" && row.resolved_id) {
        const id = String(row.resolved_id);
        const existing = playerCardIncrements.get(id) || { yellow: 0, red: 0, yellowPaid: 0, redPaid: 0 };
        if (row.card_type === "yellow") {
          existing.yellow += count;
          existing.yellowPaid += paidCount;
        } else {
          existing.red += count;
          existing.redPaid += paidCount;
        }
        playerCardIncrements.set(id, existing);
      } else {
        const normalized = normalizeName(row.normalized_name || row.source_name);
        const id = row.resolved_id ? String(row.resolved_id) : visitorByNormalized.get(normalized) || "";
        if (!id) return;
        const existing = visitorCardIncrements.get(id) || { yellow: 0, red: 0, yellowPaid: 0, redPaid: 0 };
        if (row.card_type === "yellow") {
          existing.yellow += count;
          existing.yellowPaid += paidCount;
        } else {
          existing.red += count;
          existing.redPaid += paidCount;
        }
        visitorCardIncrements.set(id, existing);
      }
    });

    const statPlayerIds = Array.from(
      new Set([
        ...Array.from(goalIncrements.keys()),
        ...Array.from(playerCardIncrements.keys())
      ])
    );
    if (statPlayerIds.length) {
      const { data: existingPlayerStats } = await supabase
        .from("player_stats")
        .select("player_id, goals, assists, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
        .in("player_id", statPlayerIds);
      const existingPlayerStatMap = new Map<string, any>(
        (existingPlayerStats ?? []).map((row: any) => [String(row.player_id), row])
      );

      const playerStatPayload = statPlayerIds.map((playerId) => {
        const existing = existingPlayerStatMap.get(playerId) || {};
        const goalInc = goalIncrements.get(playerId) || 0;
        const cardInc = playerCardIncrements.get(playerId) || { yellow: 0, red: 0, yellowPaid: 0, redPaid: 0 };
        return {
          player_id: playerId,
          goals: (Number(existing.goals) || 0) + goalInc,
          assists: Number(existing.assists) || 0,
          yellow_cards: (Number(existing.yellow_cards) || 0) + cardInc.yellow,
          red_cards: (Number(existing.red_cards) || 0) + cardInc.red,
          yellow_paid_count: (Number(existing.yellow_paid_count) || 0) + cardInc.yellowPaid,
          red_paid_count: (Number(existing.red_paid_count) || 0) + cardInc.redPaid
        };
      });
      const { error: playerStatsError } = await supabase
        .from("player_stats")
        .upsert(playerStatPayload, { onConflict: "player_id" });
      if (playerStatsError) return failure(playerStatsError.message, 400);
    }

    const statVisitorIds = Array.from(
      new Set([
        ...Array.from(visitorGoalIncrements.keys()),
        ...Array.from(visitorCardIncrements.keys())
      ])
    );
    if (statVisitorIds.length) {
      const existingVisitorStatsResult = await supabase
        .from("visitor_stats")
        .select("visitor_id, goals, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
        .in("visitor_id", statVisitorIds);
      let existingVisitorStats = existingVisitorStatsResult.data as any[] | null;
      if (existingVisitorStatsResult.error) {
        const retry = await supabase
          .from("visitor_stats")
          .select("visitor_id, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
          .in("visitor_id", statVisitorIds);
        existingVisitorStats = retry.data as any[] | null;
      }
      const existingVisitorStatMap = new Map<string, any>(
        (existingVisitorStats ?? []).map((row: any) => [String(row.visitor_id), row])
      );

      const visitorStatPayload = statVisitorIds.map((visitorId) => {
        const existing = existingVisitorStatMap.get(visitorId) || {};
        const goalInc = visitorGoalIncrements.get(visitorId) || 0;
        const inc = visitorCardIncrements.get(visitorId) || { yellow: 0, red: 0, yellowPaid: 0, redPaid: 0 };
        return {
          visitor_id: visitorId,
          goals: (Number(existing.goals) || 0) + goalInc,
          yellow_cards: (Number(existing.yellow_cards) || 0) + inc.yellow,
          red_cards: (Number(existing.red_cards) || 0) + inc.red,
          yellow_paid_count: (Number(existing.yellow_paid_count) || 0) + inc.yellowPaid,
          red_paid_count: (Number(existing.red_paid_count) || 0) + inc.redPaid
        };
      });
      const visitorStatsResult = await upsertVisitorStats(supabase, visitorStatPayload);
      if (visitorStatsResult?.error) return failure(visitorStatsResult.error.message, 400);
    }

    const { data: summary, error: summaryError } = await supabase
      .from("session_summaries")
      .insert({
        session_date: sessionDate,
        raw_text: rawText,
        review_json: review,
        created_by: user.id
      })
      .select("id, session_date, created_by, created_at, updated_at")
      .single();
    if (summaryError) return failure(summaryError.message, 400);

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "attendance_recorded",
      message: `${actor.name || "Someone"} committed weekly summary for ${sessionDate}`,
      actorUserId: user.id,
      metadata: {
        action: "session_summary_commit",
        session_date: sessionDate,
        players_present: presentPlayerIds.size,
        visitors_present: presentVisitorIds.size,
        goal_rows: review.goals?.length || 0,
        card_rows: review.cards?.length || 0,
        summary_id: summary?.id || null
      }
    });

    return success({
      session_date: sessionDate,
      summary_id: summary?.id || null,
      players_present: presentPlayerIds.size,
      visitors_present: presentVisitorIds.size,
      goals_updated_for_players: goalIncrements.size,
      goals_updated_for_visitors: visitorGoalIncrements.size,
      cards_updated_for_players: playerCardIncrements.size,
      cards_updated_for_visitors: visitorCardIncrements.size,
      visitors_created: pendingVisitors.size
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to commit session summary.", 500);
  }
}

