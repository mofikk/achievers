import { NextRequest } from "next/server";
import { failure, success } from "../../../_lib/response";
import { requirePermission } from "../../../_lib/permissions";
import { getActorContext, logActivity } from "../../../_lib/activity";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const check = await requirePermission(request, "manage_payments");
    if (!check.ok || !check.auth) return check.response;
    const { supabase, user } = check.auth;
    const body = await request.json();
    const sessionDate = String(body?.sessionDate || "").trim();
    const paid = Number(body?.paid);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      return failure("Session date must be YYYY-MM-DD.", 400);
    }
    if (!Number.isFinite(paid) || paid < 0) {
      return failure("Paid amount must be non-negative.", 400);
    }

    const { data: previous } = await supabase
      .from("visitor_session_payments")
      .select("paid_amount, expected_amount, session_date")
      .eq("visitor_id", id)
      .eq("session_date", sessionDate)
      .maybeSingle();

    const payload = {
      visitor_id: id,
      session_date: sessionDate,
      expected_amount: 1000,
      paid_amount: paid
    };

    const { data: updated, error: updateError } = await supabase
      .from("visitor_session_payments")
      .upsert(payload, { onConflict: "visitor_id,session_date" })
      .select("*")
      .single();

    if (updateError) return failure(updateError.message, 400);

    const previousPaid = Number(previous?.paid_amount ?? 0);
    const nextPaid = Number(updated?.paid_amount ?? 0);
    if (previousPaid !== nextPaid) {
      const [{ data: visitor }, actor] = await Promise.all([
        supabase.from("visitors").select("full_name").eq("id", id).maybeSingle(),
        getActorContext(supabase, user.id)
      ]);
      await logActivity(supabase, {
        type: "visitor_updated",
        message: `${actor.name || "Someone"} updated visitor payment for ${visitor?.full_name || "Unknown visitor"} (${sessionDate})`,
        actorUserId: user.id,
        relatedVisitorId: id,
        metadata: {
          action: "update_visitor_payment",
          visitor_id: id,
          visitor_name: visitor?.full_name || null,
          session_date: sessionDate,
          previous_paid_amount: previous?.paid_amount ?? null,
          paid_amount: nextPaid,
          expected_amount: Number(updated?.expected_amount ?? 1000)
        }
      });
    }

    return success({
      id: updated.id,
      visitor_id: updated.visitor_id,
      sessionDate: String(updated.session_date || "").slice(0, 10),
      expected: Number(updated.expected_amount) || 1000,
      paid: Number(updated.paid_amount) || 0
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to update visitor payments.", 500);
  }
}
