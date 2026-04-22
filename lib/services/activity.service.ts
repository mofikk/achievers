import { NextRequest } from "next/server";
import { failure, success } from "../http/response";
import { requirePermission } from "../auth/permissions";

function resolveDisplayType(type: string, metadata: Record<string, unknown>) {
  const action = String(metadata?.action || "");
  if (type === "player_updated" && action === "delete_player") return "member_deleted";
  if (type === "player_updated" && action === "update_player") return "member_updated";
  if (type === "member_joined" && action === "create_player") return "member_joined";
  return type;
}

export async function getActivity(request: NextRequest) {
  try {
    const check = await requirePermission(request, "view_activity");
    if (!check.ok || !check.auth) return check.response;
    const { supabase } = check.auth;

    const { searchParams } = new URL(request.url);
    const limit = Math.max(1, Number(searchParams.get("limit") || 25));
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const q = String(searchParams.get("q") || "").trim();
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const type = searchParams.get("type");

    let query = supabase
      .from("activity_logs")
      .select("id, type, message, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false });

    if (type === "member_deleted") {
      query = query.eq("type", "player_updated").eq("metadata->>action", "delete_player");
    } else if (type === "member_updated") {
      query = query.eq("type", "player_updated").eq("metadata->>action", "update_player");
    } else if (type) {
      query = query.eq("type", type);
    }

    if (from) {
      query = query.gte("created_at", `${from}T00:00:00`);
    }

    if (to) {
      query = query.lte("created_at", `${to}T23:59:59`);
    }

    if (q) {
      query = query.or(`message.ilike.%${q}%,metadata::text.ilike.%${q}%`);
    }

    const fromIndex = (page - 1) * limit;
    const toIndex = fromIndex + limit - 1;
    const { data, error, count } = await query.range(fromIndex, toIndex);
    if (error) return failure(error.message, 400);

    const items = (data ?? []).map((entry: any) => {
      const metadata = entry.metadata || {};
      return {
        id: entry.id,
        type: resolveDisplayType(String(entry.type || ""), metadata),
        message: entry.message || "",
        timestamp: new Date(entry.created_at).getTime(),
        created_at: entry.created_at,
        metadata
      };
    });

    const total = count || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return success({ items, total, page, totalPages });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to load activity.", 500);
  }
}

export async function getActorContext(supabase: any, userId?: string | null) {
  if (!userId) {
    return { name: null as string | null, email: null as string | null };
  }
  const { data: actorProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return {
    name: actorProfile?.full_name || actorProfile?.email || null,
    email: actorProfile?.email || null
  };
}

export async function logActivity(
  supabase: any,
  input: {
    type: string;
    message: string;
    actorUserId?: string | null;
    relatedPlayerId?: string | null;
    relatedVisitorId?: string | null;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    const actor = await getActorContext(supabase, input.actorUserId);

    const metadata = {
      ...(input.metadata || {}),
      actor_id: input.actorUserId || null,
      actor_name: actor.name,
      actor_email: actor.email
    };

    const basePayload = {
      type: input.type,
      message: input.message,
      actor_user_id: input.actorUserId || null,
      related_player_id: input.relatedPlayerId || null,
      related_visitor_id: input.relatedVisitorId || null,
      metadata
    };

    const { error } = await supabase.from("activity_logs").insert(basePayload);
    if (error) {
      const { error: fallbackError } = await supabase.from("activity_logs").insert({
        ...basePayload,
        actor_user_id: null,
        related_player_id: null,
        related_visitor_id: null
      });
      if (fallbackError) {
        console.error("Activity log insert failed:", fallbackError.message);
      }
    }
  } catch (error) {
    console.error("Activity log insert exception:", error);
  }
}
