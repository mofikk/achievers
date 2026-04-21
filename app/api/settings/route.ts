import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "../_lib/auth";
import { createSupabaseServerClient } from "../_lib/supabase";
import { failure, success } from "../_lib/response";
import { getActorContext, logActivity } from "../_lib/activity";
import { requirePermission } from "../_lib/permissions";

const defaultSettings = {
  clubName: "Achievers FC",
  season: new Date().getFullYear(),
  currencySymbol: "\u20a6",
  fees: {
    monthlySchedule: [{ from: `${new Date().getFullYear()}-01`, amount: 2000 }],
    newMemberYearly: 5000,
    renewalYearly: 2500
  },
  attendance: { startDate: "2026-01-10", lockFuture: true },
  discipline: { yellowFine: 500, redFine: 1000 }
};

function normalizeMonthToDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-01`;
}

function mapSettingsRow(row: any, scheduleRows: any[]) {
  const schedule = (scheduleRows ?? [])
    .map((item) => ({
      from: String(item.from_month || "").slice(0, 7),
      amount: Number(item.amount) || 0
    }))
    .filter((item) => /^\d{4}-\d{2}$/.test(item.from))
    .sort((a, b) => a.from.localeCompare(b.from));

  return {
    clubName: row?.club_name ?? defaultSettings.clubName,
    season: Number(row?.season) || defaultSettings.season,
    currencySymbol: row?.currency_symbol ?? defaultSettings.currencySymbol,
    fees: {
      monthlySchedule: schedule.length ? schedule : defaultSettings.fees.monthlySchedule,
      newMemberYearly: Number(row?.new_member_yearly_fee) || defaultSettings.fees.newMemberYearly,
      renewalYearly: Number(row?.renewal_yearly_fee) || defaultSettings.fees.renewalYearly
    },
    attendance: {
      startDate: row?.attendance_start_date ?? defaultSettings.attendance.startDate,
      lockFuture: row?.lock_future_dates !== false
    },
    discipline: {
      yellowFine: Number(row?.yellow_card_fine) || defaultSettings.discipline.yellowFine,
      redFine: Number(row?.red_card_fine) || defaultSettings.discipline.redFine
    }
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (!user) return success(defaultSettings);

    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const supabase = createSupabaseServerClient(token);

    const [{ data: settingsRow }, { data: scheduleRows }] = await Promise.all([
      supabase.from("app_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("monthly_fee_schedule").select("from_month, amount").order("from_month", { ascending: true })
    ]);

    if (!settingsRow) return success(defaultSettings);
    return success(mapSettingsRow(settingsRow, scheduleRows ?? []));
  } catch {
    return success(defaultSettings);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const check = await requirePermission(request, "manage_settings");
    if (!check.ok || !check.auth) return check.response;
    const { user, supabase } = check.auth;
    const body = await request.json();

    const season = Number(body?.season) || defaultSettings.season;
    const fees = body?.fees || {};
    const attendance = body?.attendance || {};
    const discipline = body?.discipline || {};

    const settingsPayload = {
      id: true,
      club_name: String(body?.clubName || defaultSettings.clubName),
      season,
      currency_symbol: String(body?.currencySymbol || defaultSettings.currencySymbol),
      new_member_yearly_fee: Number(fees?.newMemberYearly) || defaultSettings.fees.newMemberYearly,
      renewal_yearly_fee: Number(fees?.renewalYearly) || defaultSettings.fees.renewalYearly,
      yellow_card_fine: Number(discipline?.yellowFine) || defaultSettings.discipline.yellowFine,
      red_card_fine: Number(discipline?.redFine) || defaultSettings.discipline.redFine,
      attendance_start_date: String(attendance?.startDate || defaultSettings.attendance.startDate),
      lock_future_dates: attendance?.lockFuture !== false
    };

    const { error: settingsError } = await supabase
      .from("app_settings")
      .upsert(settingsPayload, { onConflict: "id" });

    if (settingsError) return failure(settingsError.message, 400);

    const schedule = Array.isArray(fees?.monthlySchedule) ? fees.monthlySchedule : [];
    const normalizedSchedule = schedule
      .map((item: any) => ({
        from_month: normalizeMonthToDate(item?.from),
        amount: Number(item?.amount) || 0
      }))
      .filter((item) => Boolean(item.from_month));

    const { data: existingScheduleRows, error: existingScheduleError } = await supabase
      .from("monthly_fee_schedule")
      .select("id");
    if (existingScheduleError) return failure(existingScheduleError.message, 400);

    const existingIds = (existingScheduleRows ?? []).map((row: any) => row.id).filter(Boolean);
    if (existingIds.length) {
      const { error: deleteError } = await supabase
        .from("monthly_fee_schedule")
        .delete()
        .in("id", existingIds);
      if (deleteError) return failure(deleteError.message, 400);
    }

    if (normalizedSchedule.length) {
      const { error: scheduleError } = await supabase
        .from("monthly_fee_schedule")
        .insert(normalizedSchedule);
      if (scheduleError) return failure(scheduleError.message, 400);
    }

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "settings_updated",
      message: `${actor.name || "Someone"} updated settings`,
      actorUserId: user.id,
      metadata: {
        action: "update_settings",
        season,
        currency_symbol: settingsPayload.currency_symbol,
        monthly_schedule_count: normalizedSchedule.length
      }
    });

    return success({
      clubName: settingsPayload.club_name,
      season: settingsPayload.season,
      currencySymbol: settingsPayload.currency_symbol,
      fees: {
        monthlySchedule: normalizedSchedule.length
          ? normalizedSchedule.map((item) => ({ from: item.from_month.slice(0, 7), amount: item.amount }))
          : defaultSettings.fees.monthlySchedule,
        newMemberYearly: settingsPayload.new_member_yearly_fee,
        renewalYearly: settingsPayload.renewal_yearly_fee
      },
      attendance: {
        startDate: settingsPayload.attendance_start_date,
        lockFuture: settingsPayload.lock_future_dates
      },
      discipline: {
        yellowFine: settingsPayload.yellow_card_fine,
        redFine: settingsPayload.red_card_fine
      }
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to update settings.", 500);
  }
}
