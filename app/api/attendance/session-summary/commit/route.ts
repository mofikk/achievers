import { NextRequest } from "next/server";
import { failure, success } from "../../../_lib/response";
import { getAuthContext } from "../../../_lib/permissions";
import { getActorContext, logActivity } from "../../../_lib/activity";

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

export async function POST(request: NextRequest) {
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

    const visitorNamesById = new Map<string, string>();
    (visitorRows ?? []).forEach((row: any) => {
      visitorNamesById.set(String(row.id), String(row.full_name || ""));
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
    // Visitors are intentionally not created from attendance rows.
    // Attendance remains player-only for this commit flow.
    (review.cards ?? []).forEach((row) => {
      if (row.resolved_type !== "visitor") return;
      const normalized = normalizeName(row.normalized_name || row.source_name);
      if (!normalized || visitorByNormalized.has(normalized)) return;
      pendingVisitors.set(normalized, {
        sourceName: titleCase(String(row.resolved_name || row.source_name || normalized)),
        normalized
      });
    });

    for (const entry of pendingVisitors.values()) {
      const payload = {
        full_name: entry.sourceName,
        nickname: null as string | null,
        email: null as string | null
      };
      const { data: created, error } = await supabase
        .from("visitors")
        .insert(payload)
        .select("id, full_name")
        .single();

      if (error || !created?.id) {
        return failure(error?.message || `Failed to create visitor ${entry.sourceName}.`, 400);
      }

      const visitorId = String(created.id);
      visitorByNormalized.set(entry.normalized, visitorId);
      visitorNamesById.set(visitorId, String(created.full_name || entry.sourceName));

      await supabase
        .from("visitor_stats")
        .upsert(
          {
            visitor_id: visitorId,
            yellow_cards: 0,
            red_cards: 0,
            yellow_paid_count: 0,
            red_paid_count: 0
          },
          { onConflict: "visitor_id" }
        );
    }

    const presentPlayerIds = new Set<string>();
    (review.attendance ?? []).forEach((row) => {
      if (row.resolved_type === "player" && row.resolved_id && playerIds.has(String(row.resolved_id))) {
        presentPlayerIds.add(String(row.resolved_id));
      }
    });

    for (const playerId of playerIds) {
      await supabase.from("player_attendance").upsert(
        {
          player_id: playerId,
          session_date: sessionDate,
          present: presentPlayerIds.has(playerId)
        },
        { onConflict: "player_id,session_date" }
      );
    }

    const goalIncrements = new Map<string, number>();
    (review.goals ?? []).forEach((row) => {
      if (!row.resolved_id || row.status !== "ok") return;
      const playerId = String(row.resolved_id);
      goalIncrements.set(playerId, (goalIncrements.get(playerId) || 0) + (Number(row.goals) || 0));
    });

    for (const [playerId, incGoals] of goalIncrements.entries()) {
      const { data: existingStats } = await supabase
        .from("player_stats")
        .select("*")
        .eq("player_id", playerId)
        .maybeSingle();
      const payload = {
        player_id: playerId,
        goals: (Number(existingStats?.goals) || 0) + incGoals,
        assists: Number(existingStats?.assists) || 0,
        yellow_cards: Number(existingStats?.yellow_cards) || 0,
        red_cards: Number(existingStats?.red_cards) || 0,
        yellow_paid_count: Number(existingStats?.yellow_paid_count) || 0,
        red_paid_count: Number(existingStats?.red_paid_count) || 0
      };
      const { error } = await supabase
        .from("player_stats")
        .upsert(payload, { onConflict: "player_id" });
      if (error) return failure(error.message, 400);
    }

    const playerCardIncrements = new Map<
      string,
      { yellow: number; red: number; yellowPaid: number; redPaid: number }
    >();
    const visitorCardIncrements = new Map<
      string,
      { yellow: number; red: number; yellowPaid: number; redPaid: number }
    >();
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

    for (const [playerId, inc] of playerCardIncrements.entries()) {
      const { data: existingStats } = await supabase
        .from("player_stats")
        .select("*")
        .eq("player_id", playerId)
        .maybeSingle();
      const payload = {
        player_id: playerId,
        goals: Number(existingStats?.goals) || 0,
        assists: Number(existingStats?.assists) || 0,
        yellow_cards: (Number(existingStats?.yellow_cards) || 0) + inc.yellow,
        red_cards: (Number(existingStats?.red_cards) || 0) + inc.red,
        yellow_paid_count: (Number(existingStats?.yellow_paid_count) || 0) + inc.yellowPaid,
        red_paid_count: (Number(existingStats?.red_paid_count) || 0) + inc.redPaid
      };
      const { error } = await supabase
        .from("player_stats")
        .upsert(payload, { onConflict: "player_id" });
      if (error) return failure(error.message, 400);
    }

    for (const [visitorId, inc] of visitorCardIncrements.entries()) {
      const { data: existingStats } = await supabase
        .from("visitor_stats")
        .select("*")
        .eq("visitor_id", visitorId)
        .maybeSingle();
      const payload = {
        visitor_id: visitorId,
        yellow_cards: (Number(existingStats?.yellow_cards) || 0) + inc.yellow,
        red_cards: (Number(existingStats?.red_cards) || 0) + inc.red,
        yellow_paid_count: (Number(existingStats?.yellow_paid_count) || 0) + inc.yellowPaid,
        red_paid_count: (Number(existingStats?.red_paid_count) || 0) + inc.redPaid
      };
      const { error } = await supabase
        .from("visitor_stats")
        .upsert(payload, { onConflict: "visitor_id" });
      if (error) return failure(error.message, 400);
    }

    const { data: summary, error: summaryError } = await supabase
      .from("session_summaries")
      .insert({
        session_date: sessionDate,
        raw_text: rawText,
        review_json: review,
        created_by: user.id
      })
      .select("*")
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
        visitors_present: 0,
        goal_rows: review.goals?.length || 0,
        card_rows: review.cards?.length || 0,
        summary_id: summary?.id || null
      }
    });

    return success({
      session_date: sessionDate,
      summary_id: summary?.id || null,
      players_present: presentPlayerIds.size,
      visitors_present: 0,
      goals_updated_for_players: goalIncrements.size,
      cards_updated_for_players: playerCardIncrements.size,
      cards_updated_for_visitors: visitorCardIncrements.size,
      visitors_created: pendingVisitors.size
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to commit session summary.", 500);
  }
}
