import { failure, success } from "../../_lib/response";
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "../../_lib/supabase";
import { getActorContext, logActivity } from "../../_lib/activity";
import { requirePermission } from "../../_lib/permissions";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const perm = await requirePermission(request, "manage_visitors");
    if (!perm.ok || !perm.auth) return perm.response;
    const { user, supabase } = perm.auth;

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return failure("Invalid request body.", 400);
    }

    const patchPayload: Record<string, unknown> = {};
    const fullName = (body as any).full_name ?? (body as any).name;
    if (fullName !== undefined) patchPayload.full_name = String(fullName || "").trim();
    if ((body as any).nickname !== undefined) patchPayload.nickname = (body as any).nickname ? String((body as any).nickname).trim() : null;
    if ((body as any).email !== undefined) patchPayload.email = (body as any).email ? String((body as any).email).trim() : null;
    if ((body as any).notes !== undefined) patchPayload.notes = (body as any).notes ? String((body as any).notes).trim() : null;

    let { data, error } = await supabase
      .from("visitors")
      .update(patchPayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error && /column .*notes.* does not exist/i.test(error.message || "")) {
      const fallbackPayload = { ...patchPayload };
      delete fallbackPayload.notes;
      const retry = await supabase
        .from("visitors")
        .update(fallbackPayload)
        .eq("id", id)
        .select("*")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return failure(error.message, 400);
    }

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "visitor_updated",
      message: `${actor.name || "Someone"} updated visitor ${data.full_name || "Unknown"}`,
      actorUserId: user.id,
      relatedVisitorId: id,
      metadata: {
        action: "update_visitor",
        visitor_id: id,
        visitor_name: data.full_name || null
      }
    });

    return success({
      id: data.id,
      name: data.full_name ?? "",
      nickname: data.nickname ?? "",
      notes: data.notes ?? "",
      createdAt: data.created_at ?? new Date(0).toISOString(),
      attendance: {},
      payments: { sessions: {} },
      stats: { yellow: 0, red: 0 },
      discipline: { yellowPaid: 0, redPaid: 0 }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update visitor.";
    return failure(message, 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const perm = await requirePermission(request, "manage_visitors");
    if (!perm.ok || !perm.auth) return perm.response;
    const { user, supabase } = perm.auth;

    const { data: visitorBeforeDelete } = await supabase
      .from("visitors")
      .select("full_name")
      .eq("id", id)
      .maybeSingle();

    await Promise.all([
      supabase.from("visitor_attendance").delete().eq("visitor_id", id),
      supabase.from("visitor_session_payments").delete().eq("visitor_id", id),
      supabase.from("visitor_stats").delete().eq("visitor_id", id)
    ]);

    const { error } = await supabase.from("visitors").delete().eq("id", id);
    if (error) {
      return failure(error.message, 400);
    }

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "visitor_updated",
      message: `${actor.name || "Someone"} deleted visitor ${visitorBeforeDelete?.full_name || "Unknown"}`,
      actorUserId: user.id,
      metadata: {
        action: "delete_visitor",
        visitor_id: id,
        visitor_name: visitorBeforeDelete?.full_name || null
      }
    });

    return success({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete visitor.";
    return failure(message, 500);
  }
}
