import { failure, success } from "../../_lib/response";
import { NextRequest } from "next/server";
import { logActivity } from "../../_lib/activity";
import { requirePermission } from "../../_lib/permissions";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

async function resolveActorName(supabase: any, userId: string, fallback: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return String(data?.full_name || data?.email || fallback);
}

function capitalizeWords(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b([a-z])/g, (char) => char.toUpperCase());
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const perm = await requirePermission(request, "manage_players_update");
    if (!perm.ok || !perm.auth) return perm.response;
    const { supabase, user } = perm.auth;

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return failure("Invalid request body.", 400);
    }

    const updatePayload: Record<string, unknown> = {};
    const bodyAny = body as any;

    const incomingName = typeof bodyAny.full_name === "string"
      ? bodyAny.full_name
      : typeof bodyAny.name === "string"
        ? bodyAny.name
        : undefined;

    if (incomingName !== undefined) updatePayload.full_name = capitalizeWords(incomingName);
    if (bodyAny.nickname !== undefined) updatePayload.nickname = bodyAny.nickname ? capitalizeWords(bodyAny.nickname) : null;
    if (bodyAny.email !== undefined) updatePayload.email = bodyAny.email ? String(bodyAny.email).trim() : null;
    if (bodyAny.position !== undefined) updatePayload.position = bodyAny.position;

    const memberSince = bodyAny.member_since_year ?? bodyAny.memberSinceYear;
    if (memberSince !== undefined) {
      const year = Number(memberSince);
      if (!Number.isFinite(year)) return failure("member_since_year must be a number.", 400);
      updatePayload.member_since_year = year;
    }

    const { data, error } = await supabase
      .from("players")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return failure(error.message, 400);
    }

    const actorName = await resolveActorName(supabase, user.id, "Someone");
    await logActivity(supabase, {
      type: "player_updated",
      message: `${actorName} updated player ${data.full_name || "Unknown"}`,
      actorUserId: user.id,
      relatedPlayerId: String(data.id || id),
      metadata: {
        action: "update_player",
        player_id: String(data.id || id),
        player_name: data.full_name || "Unknown"
      }
    });

    const memberSinceYear = Number(data?.member_since_year ?? new Date().getFullYear());
    return success({
      id: data.id,
      name: data.full_name ?? "",
      nickname: data.nickname ?? "",
      email: data.email ?? "",
      position: data.position ?? "",
      createdAt: data.created_at ?? new Date(0).toISOString(),
      membership: { memberSinceYear: Number.isFinite(memberSinceYear) ? memberSinceYear : new Date().getFullYear() },
      subscriptions: { year: {}, months: {} },
      payments: { yearly: {}, monthly: {} },
      stats: { goals: 0, assists: 0, yellow: 0, red: 0 },
      discipline: { yellowPaid: 0, redPaid: 0 },
      attendance: {}
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update player.";
    return failure(message, 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const perm = await requirePermission(request, "manage_players_delete");
    if (!perm.ok || !perm.auth) return perm.response;
    const { supabase, user } = perm.auth;

    const { data: playerBeforeDelete } = await supabase
      .from("players")
      .select("id, full_name")
      .eq("id", id)
      .maybeSingle();

    const actorName = await resolveActorName(supabase, user.id, "Someone");
    await logActivity(supabase, {
      type: "player_updated",
      message: `${actorName} deleted player ${playerBeforeDelete?.full_name || "Unknown"}`,
      actorUserId: user.id,
      relatedPlayerId: id,
      metadata: {
        action: "delete_player",
        player_id: id,
        player_name: playerBeforeDelete?.full_name || "Unknown"
      }
    });

    await Promise.all([
      supabase.from("player_attendance").delete().eq("player_id", id),
      supabase.from("player_monthly_payments").delete().eq("player_id", id),
      supabase.from("player_yearly_payments").delete().eq("player_id", id),
      supabase.from("player_stats").delete().eq("player_id", id)
    ]);

    const { error } = await supabase.from("players").delete().eq("id", id);
    if (error) {
      return failure(error.message, 400);
    }

    return success({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete player.";
    return failure(message, 500);
  }
}
