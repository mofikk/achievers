import { NextRequest } from "next/server";
import { failure, success } from "../../../_lib/response";
import { getActorContext, logActivity } from "../../../_lib/activity";
import { requirePermission } from "../../../_lib/permissions";

type RouteContext = {
  params: Promise<{
    date: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { date } = await context.params;
    const check = await requirePermission(request, "manage_attendance");
    if (!check.ok || !check.auth) return check.response;
    const { user, supabase } = check.auth;
    const safeDate = String(date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
      return failure("Date must be in YYYY-MM-DD format.", 400);
    }
    const body = await request.json();
    const updates = Array.isArray(body?.updates) ? body.updates : [];
    if (!updates.length) return failure("Updates are required.", 400);

    for (const update of updates) {
      const visitorId = String(update?.id || "").trim();
      if (!visitorId) continue;
      const { data: previous } = await supabase
        .from("visitor_attendance")
        .select("present")
        .eq("visitor_id", visitorId)
        .eq("session_date", safeDate)
        .maybeSingle();
      await supabase.from("visitor_attendance").upsert(
        {
          visitor_id: visitorId,
          session_date: safeDate,
          present: Boolean(update?.present)
        },
        { onConflict: "visitor_id,session_date" }
      );

      const changed = !previous || Boolean(previous.present) !== Boolean(update?.present);
      if (changed) {
        const [{ data: visitor }, actor] = await Promise.all([
          supabase.from("visitors").select("full_name").eq("id", visitorId).maybeSingle(),
          getActorContext(supabase, user.id)
        ]);
        await logActivity(supabase, {
          type: "attendance_recorded",
          message: `${actor.name || "Someone"} recorded attendance for ${visitor?.full_name || "Unknown visitor"} (${safeDate}: ${Boolean(update?.present) ? "present" : "absent"})`,
          actorUserId: user.id,
          relatedVisitorId: visitorId,
          metadata: {
            action: "visitor_attendance_recorded",
            visitor_id: visitorId,
            visitor_name: visitor?.full_name || null,
            session_date: safeDate,
            present: Boolean(update?.present),
            previous_present: previous ? Boolean(previous.present) : null
          }
        });
      }
    }

    return success({ ok: true });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to update visitor attendance.", 500);
  }
}
