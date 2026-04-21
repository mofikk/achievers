import { failure, success } from "../../../_lib/response";
import { NextRequest } from "next/server";
import { getActorContext, logActivity } from "../../../_lib/activity";
import { requirePermission } from "../../../_lib/permissions";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const check = await requirePermission(request, "manage_players_create");
    if (!check.ok || !check.auth) return check.response;
    const { user, supabase } = check.auth;

    const body = await request.json().catch(() => ({}));
    const position = String(body?.position || "").trim();
    if (!position) {
      return failure("Position is required.", 400);
    }

    const { data: visitor, error: visitorError } = await supabase
      .from("visitors")
      .select("*")
      .eq("id", id)
      .single();

    if (visitorError || !visitor) {
      return failure(visitorError?.message || "Visitor not found.", 404);
    }

    const playerPayload = {
      full_name: visitor.full_name,
      nickname: visitor.nickname || null,
      email: visitor.email || null,
      position,
      member_since_year: new Date().getFullYear()
    };

    const { data: player, error: insertError } = await supabase
      .from("players")
      .insert(playerPayload)
      .select("*")
      .single();

    if (insertError) {
      return failure(insertError.message, 400);
    }

    await supabase.from("player_stats").upsert(
      {
        player_id: player.id,
        goals: 0,
        assists: 0,
        yellow_cards: 0,
        red_cards: 0,
        yellow_paid_count: 0,
        red_paid_count: 0
      },
      { onConflict: "player_id" }
    );

    await Promise.all([
      supabase.from("visitor_attendance").delete().eq("visitor_id", id),
      supabase.from("visitor_session_payments").delete().eq("visitor_id", id),
      supabase.from("visitor_stats").delete().eq("visitor_id", id)
    ]);

    const { error: deleteError } = await supabase.from("visitors").delete().eq("id", id);
    if (deleteError) {
      return failure(deleteError.message, 400);
    }

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "visitor_promoted",
      message: `${actor.name || "Someone"} promoted visitor ${visitor.full_name || "Unknown"} to player`,
      actorUserId: user.id,
      relatedPlayerId: player.id,
      metadata: {
        action: "promote_visitor",
        visitor_id: id,
        visitor_name: visitor.full_name || null,
        player_id: player.id,
        player_name: player.full_name || null
      }
    });

    return success(player, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to promote visitor.";
    return failure(message, 500);
  }
}
