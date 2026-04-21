import { NextRequest } from "next/server";
import { failure, success } from "../../../_lib/response";
import { getActorContext, logActivity } from "../../../_lib/activity";
import { getAuthContext } from "../../../_lib/permissions";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await getAuthContext(request);
    if (!auth) return failure("Unauthorized", 401);
    const { user, supabase, permissions } = auth;
    const body = await request.json();
    const touchesStats =
      body?.goals !== undefined ||
      body?.assists !== undefined ||
      body?.yellow !== undefined ||
      body?.red !== undefined;
    const touchesFines =
      body?.discipline?.yellowPaid !== undefined ||
      body?.discipline?.redPaid !== undefined;
    if (touchesStats && !permissions.manage_stats) return failure("Forbidden", 403);
    if (touchesFines && !permissions.manage_fines) return failure("Forbidden", 403);
    const { data: previous } = await supabase
      .from("player_stats")
      .select("*")
      .eq("player_id", id)
      .maybeSingle();

    const payload = {
      player_id: id,
      goals: Number(body?.goals) || 0,
      assists: Number(body?.assists) || 0,
      yellow_cards: Number(body?.yellow) || 0,
      red_cards: Number(body?.red) || 0,
      yellow_paid_count: Number(body?.discipline?.yellowPaid) || 0,
      red_paid_count: Number(body?.discipline?.redPaid) || 0
    };

    const { data, error } = await supabase
      .from("player_stats")
      .upsert(payload, { onConflict: "player_id" })
      .select("*")
      .single();

    if (error) return failure(error.message, 400);

    const actor = await getActorContext(supabase, user.id);
    const { data: player } = await supabase
      .from("players")
      .select("full_name")
      .eq("id", id)
      .maybeSingle();
    const playerName = player?.full_name || "Unknown player";

    const statsChanged =
      !previous ||
      Number(previous.goals) !== Number(data.goals) ||
      Number(previous.assists) !== Number(data.assists) ||
      Number(previous.yellow_cards) !== Number(data.yellow_cards) ||
      Number(previous.red_cards) !== Number(data.red_cards);

    const fineChanged =
      !previous ||
      Number(previous.yellow_paid_count) !== Number(data.yellow_paid_count) ||
      Number(previous.red_paid_count) !== Number(data.red_paid_count);

    if (statsChanged) {
      await logActivity(supabase, {
        type: "stats_updated",
        message: `${actor.name || "Someone"} updated stats for ${playerName}`,
        actorUserId: user.id,
        relatedPlayerId: id,
        metadata: {
          action: "update_player_stats",
          player_id: id,
          player_name: playerName
        }
      });
    }

    if (fineChanged) {
      const totalCards = Number(data.yellow_cards) + Number(data.red_cards);
      const totalPaidCount = Number(data.yellow_paid_count) + Number(data.red_paid_count);
      const previousTotalCards = Number(previous?.yellow_cards || 0) + Number(previous?.red_cards || 0);
      const previousTotalPaidCount = Number(previous?.yellow_paid_count || 0) + Number(previous?.red_paid_count || 0);
      const fineType =
        totalCards > 0 &&
        totalPaidCount >= totalCards &&
        previousTotalPaidCount < previousTotalCards
          ? "fine_cleared"
          : "fine_updated";
      await logActivity(supabase, {
        type: fineType,
        message:
          fineType === "fine_cleared"
            ? `${actor.name || "Someone"} cleared fines for ${playerName}`
            : `${actor.name || "Someone"} updated fines for ${playerName}`,
        actorUserId: user.id,
        relatedPlayerId: id,
        metadata: {
          action: "update_player_fines",
          player_id: id,
          player_name: playerName,
          yellow_paid_count: Number(data.yellow_paid_count) || 0,
          red_paid_count: Number(data.red_paid_count) || 0
        }
      });
    }

    return success({
      player_id: data.player_id,
      goals: Number(data.goals) || 0,
      assists: Number(data.assists) || 0,
      yellow: Number(data.yellow_cards) || 0,
      red: Number(data.red_cards) || 0,
      discipline: {
        yellowPaid: Number(data.yellow_paid_count) || 0,
        redPaid: Number(data.red_paid_count) || 0
      }
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to update stats.", 500);
  }
}
