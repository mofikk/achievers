import { NextRequest } from "next/server";
import { failure, success } from "../_lib/response";
import { requirePermission } from "../_lib/permissions";

function resolveDisplayType(type: string, metadata: Record<string, unknown>) {
  const action = String(metadata?.action || "");
  if (type === "player_updated" && action === "delete_player") return "member_deleted";
  if (type === "player_updated" && action === "update_player") return "member_updated";
  if (type === "member_joined" && action === "create_player") return "member_joined";
  return type;
}

export async function GET(request: NextRequest) {
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

    let items = (data ?? []).map((entry: any) => {
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
