import { NextRequest } from "next/server";
import { failure, success } from "../../http/response";
import { requirePermission } from "../../auth/permissions";
import { getActorContext, logActivity } from "../activity.service";

export async function patchVisitorAttendanceByDate(request: NextRequest, date: string) {
  try {
    const check = await requirePermission(request, "manage_attendance");
    if (!check.ok || !check.auth) return check.response;
    const { user, supabase } = check.auth;
    const safeDate = String(date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
      return failure("Date must be in YYYY-MM-DD format.", 400);
    }
    const body = await request.json();
    const updates = Array.isArray((body as any)?.updates) ? (body as any).updates : [];
    if (!updates.length) return failure("Updates are required.", 400);

    const normalized = updates
      .map((update: any) => ({
        visitor_id: String(update?.id || "").trim(),
        present: Boolean(update?.present)
      }))
      .filter((item: any) => item.visitor_id);

    if (!normalized.length) return success({ ok: true });

    const visitorIds = Array.from(new Set(normalized.map((item: any) => item.visitor_id)));
    const [previousRes, visitorsRes, actor] = await Promise.all([
      supabase
        .from("visitor_attendance")
        .select("visitor_id, present")
        .eq("session_date", safeDate)
        .in("visitor_id", visitorIds),
      supabase
        .from("visitors")
        .select("id, full_name")
        .in("id", visitorIds),
      getActorContext(supabase, user.id)
    ]);

    const previousMap = new Map<string, boolean>(
      (previousRes.data ?? []).map((row: any) => [String(row.visitor_id), Boolean(row.present)])
    );
    const visitorNameMap = new Map<string, string>(
      (visitorsRes.data ?? []).map((row: any) => [String(row.id), String(row.full_name || "Unknown visitor")])
    );

    const upsertRows = normalized.map((item: any) => ({
      visitor_id: item.visitor_id,
      session_date: safeDate,
      present: item.present
    }));
    await supabase.from("visitor_attendance").upsert(upsertRows, { onConflict: "visitor_id,session_date" });

    for (const item of normalized) {
      const prev = previousMap.get(item.visitor_id);
      const changed = prev === undefined || prev !== item.present;
      if (!changed) continue;
      const visitorName = visitorNameMap.get(item.visitor_id) || "Unknown visitor";
      await logActivity(supabase, {
        type: "attendance_recorded",
        message: `${actor.name || "Someone"} recorded attendance for ${visitorName} (${safeDate}: ${item.present ? "present" : "absent"})`,
        actorUserId: user.id,
        relatedVisitorId: item.visitor_id,
        metadata: {
          action: "visitor_attendance_recorded",
          visitor_id: item.visitor_id,
          visitor_name: visitorName,
          session_date: safeDate,
          present: item.present,
          previous_present: prev ?? null
        }
      });
    }

    return success({ ok: true });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to update visitor attendance.", 500);
  }
}

