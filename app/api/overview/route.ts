import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "../_lib/auth";
import { createSupabaseServerClient } from "../_lib/supabase";
import { failure, success } from "../_lib/response";

function statusFromPaid(expected: number, paid: number) {
  if (paid >= expected && expected > 0) return "PAID";
  if (paid > 0 && paid < expected) return "INCOMPLETE";
  return "PENDING";
}

function normalizeMonthKey(monthKey: string) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-01`;
}

function getMonthlyExpected(schedule: Array<{ from: string; amount: number }>, monthKey: string) {
  if (!Array.isArray(schedule) || !schedule.length) return 2000;
  const sorted = [...schedule].sort((a, b) => a.from.localeCompare(b.from));
  let candidate = Number(sorted[0]?.amount) || 2000;
  sorted.forEach((item) => {
    if (item.from <= monthKey) candidate = Number(item.amount) || candidate;
  });
  return candidate;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (!user) return failure("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const yearKey = Number(searchParams.get("yearKey") || new Date().getFullYear());
    const monthKey =
      String(searchParams.get("monthKey")) ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    const monthDateKey = normalizeMonthKey(monthKey);
    if (!monthDateKey) return failure("Invalid monthKey format. Expected YYYY-MM.", 400);

    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const supabase = createSupabaseServerClient(token);

    const defaultYear = new Date().getFullYear();
    const defaultSettings = {
      new_member_yearly_fee: 5000,
      renewal_yearly_fee: 2500
    };

    const [
      { data: players, error: playersError },
      { data: appSettings, error: settingsError },
      { data: scheduleRows, error: scheduleError },
      { data: monthlyRows, error: monthlyError },
      { data: yearlyRows, error: yearlyError }
    ] = await Promise.all([
      supabase.from("players").select("id, member_since_year"),
      supabase.from("app_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("monthly_fee_schedule").select("from_month, amount").order("from_month", { ascending: true }),
      supabase.from("player_monthly_payments").select("player_id, paid_amount").eq("month_key", monthDateKey),
      supabase.from("player_yearly_payments").select("player_id, paid_amount").eq("year_key", yearKey)
    ]);

    if (playersError || monthlyError || yearlyError) {
      return success({
        counts: {
          totalMembers: 0,
          yearlyPaid: 0,
          yearlyPending: 0,
          yearlyIncomplete: 0,
          monthlyPaid: 0,
          monthlyPending: 0,
          monthlyIncomplete: 0
        },
        yearKey: String(yearKey),
        monthKey
      });
    }

    const safeScheduleRows = scheduleError ? [] : (scheduleRows ?? []);
    const schedule = safeScheduleRows.map((row: any) => ({
      from: String(row.from_month || "").slice(0, 7),
      amount: Number(row.amount) || 0
    }));

    const monthlyExpected = getMonthlyExpected(schedule, monthKey);
    const settingsSource = settingsError ? defaultSettings : (appSettings ?? defaultSettings);
    const newMemberYearly = Number(settingsSource?.new_member_yearly_fee) || 5000;
    const renewalYearly = Number(settingsSource?.renewal_yearly_fee) || 2500;

    const monthlyMap = new Map<string, number>();
    (monthlyRows ?? []).forEach((r: any) => monthlyMap.set(String(r.player_id), Number(r.paid_amount) || 0));

    const yearlyMap = new Map<string, number>();
    (yearlyRows ?? []).forEach((r: any) => yearlyMap.set(String(r.player_id), Number(r.paid_amount) || 0));

    let yearlyPaid = 0;
    let yearlyPending = 0;
    let yearlyIncomplete = 0;
    let monthlyPaid = 0;
    let monthlyPending = 0;
    let monthlyIncomplete = 0;

    (players ?? []).forEach((p: any) => {
      const memberYear = Number(p.member_since_year) || defaultYear;
      const yearlyExpected = yearKey === memberYear ? newMemberYearly : renewalYearly;
      const yearlyStatus = statusFromPaid(yearlyExpected, yearlyMap.get(String(p.id)) || 0);
      const monthlyStatus = statusFromPaid(monthlyExpected, monthlyMap.get(String(p.id)) || 0);

      if (yearlyStatus === "PAID") yearlyPaid += 1;
      else if (yearlyStatus === "INCOMPLETE") yearlyIncomplete += 1;
      else yearlyPending += 1;

      if (monthlyStatus === "PAID") monthlyPaid += 1;
      else if (monthlyStatus === "INCOMPLETE") monthlyIncomplete += 1;
      else monthlyPending += 1;
    });

    return success({
      counts: {
        totalMembers: (players ?? []).length,
        yearlyPaid,
        yearlyPending,
        yearlyIncomplete,
        monthlyPaid,
        monthlyPending,
        monthlyIncomplete
      },
      yearKey: String(yearKey),
      monthKey
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to load overview.", 500);
  }
}
