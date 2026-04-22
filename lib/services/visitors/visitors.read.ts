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

    const [
      visitorsResult,
      { data: attendanceRows },
      { data: paymentRows },
      { data: statsRows }
    ] = await Promise.all([
      supabase
        .from("visitors")
        .select("id, full_name, nickname, email, notes, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("visitor_attendance").select("visitor_id, session_date, present"),
      supabase.from("visitor_session_payments").select("visitor_id, session_date, paid_amount, expected_amount"),
      supabase.from("visitor_stats").select("visitor_id, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
    ]);

    let visitors: any[] | null = visitorsResult.data as any[] | null;
    let visitorsError: any = visitorsResult.error;
    if (visitorsError && /column .*notes.* does not exist/i.test(visitorsError.message || "")) {
      const retry = await supabase
        .from("visitors")
        .select("id, full_name, nickname, email, created_at")
        .order("created_at", { ascending: false });
      visitors = retry.data as any[] | null;
      visitorsError = retry.error;
    }

    if (visitorsError) return failure(visitorsError.message, 400);

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
        expected: Number(row.expected_amount) || 1000,
        paid: Number(row.paid_amount) || 0
      };
    });

    (statsRows ?? []).forEach((row: any) => {
      const visitor = byId.get(String(row.visitor_id || ""));
      if (!visitor) return;
      visitor.stats = {
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

