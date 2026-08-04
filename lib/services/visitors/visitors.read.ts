import { NextRequest } from "next/server";
import { failure, success } from "../../http/response";
import { requireAuthenticatedUser } from "../../auth/permissions";
import { createServerClient } from "../../supabase/server";
import { getTokenFromRequest } from "../../auth/getToken";
import { mapVisitorBase } from "./visitors.shared";

export async function getVisitors(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (!user) {
      return failure("Unauthorized", 401);
    }

    const supabase = createServerClient(getTokenFromRequest(request) || undefined);

    const { data: appSettings } = await supabase
      .from("app_settings")
      .select("id, visitor_session_fee")
      .eq("id", true)
      .maybeSingle();
    const visitorSessionFee = Number(appSettings?.visitor_session_fee) || 1000;

    const visitorsResult = await supabase
      .from("visitors")
      .select("id, full_name, nickname, email, created_at")
      .order("created_at", { ascending: false });

    let visitors: any[] | null = visitorsResult.data as any[] | null;
    let visitorsError: any = visitorsResult.error;

    if (visitorsError) return failure(visitorsError.message, 400);
    if (!visitors?.length) return success([]);

    const visitorIds = visitors
      .map((row: any) => String(row.id || "").trim())
      .filter(Boolean);

    const [
      { data: attendanceRows },
      { data: paymentRows },
      statsResult
    ] = await Promise.all([
      supabase
        .from("visitor_attendance")
        .select("visitor_id, session_date, present")
        .in("visitor_id", visitorIds),
      supabase
        .from("visitor_session_payments")
        .select("visitor_id, session_date, paid_amount, expected_amount")
        .in("visitor_id", visitorIds),
      supabase
        .from("visitor_stats")
        .select("visitor_id, goals, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
        .in("visitor_id", visitorIds)
    ]);

    let statsRows = statsResult.data as any[] | null;
    if (statsResult.error) {
      const retry = await supabase
        .from("visitor_stats")
        .select("visitor_id, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
        .in("visitor_id", visitorIds);
      if (!retry.error) statsRows = retry.data as any[] | null;
    }

    const mapped = (visitors ?? []).map(mapVisitorBase);
    const byId = new Map(mapped.map((v) => [String(v.id), v]));

    (attendanceRows ?? []).forEach((row: any) => {
      const visitor = byId.get(String(row.visitor_id || ""));
      if (!visitor) return;
      const dateKey = String(row.session_date || "").slice(0, 10);
      if (!dateKey) return;
      visitor.attendance[dateKey] = row.present === true;
    });

    (paymentRows ?? []).forEach((row: any) => {
      const visitor = byId.get(String(row.visitor_id || ""));
      if (!visitor) return;
      const dateKey = String(row.session_date || "").slice(0, 10);
      if (!dateKey) return;
      visitor.payments.sessions[dateKey] = {
        expected: Number(row.expected_amount) || visitorSessionFee,
        paid: Number(row.paid_amount) || 0
      };
    });

    (statsRows ?? []).forEach((row: any) => {
      const visitor = byId.get(String(row.visitor_id || ""));
      if (!visitor) return;
      visitor.stats = {
        goals: Number(row.goals) || 0,
        yellow: Number(row.yellow_cards) || 0,
        red: Number(row.red_cards) || 0
      };
      visitor.discipline = {
        yellowPaid: Number(row.yellow_paid_count) || 0,
        redPaid: Number(row.red_paid_count) || 0
      };
    });

    return success(mapped);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch visitors.";
    return failure(message, 500);
  }
}
