import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "../../_lib/auth";
import { createSupabaseServerClient } from "../../_lib/supabase";
import { failure, success } from "../../_lib/response";
import { logActivity } from "../../_lib/activity";

function validateReset(reset: any) {
  const fields = ["attendance", "monthlyPayments", "yearlyPayments", "stats", "disciplinePaid"];
  return fields.every((field) => typeof reset?.[field] === "boolean");
}

async function assertSuperUser(request: NextRequest) {
  const user = await requireAuthenticatedUser(request);
  if (!user) {
    return { ok: false, status: 401 as const, reason: "Unauthorized", supabase: null, user: null };
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  const supabase = createSupabaseServerClient(token);
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { ok: false, status: 400 as const, reason: error.message, supabase, user };
  }

  if (profile?.role !== "super_user") {
    return { ok: false, status: 403 as const, reason: "Unauthorized", supabase, user };
  }

  return { ok: true, status: 200 as const, reason: "", supabase, user };
}

async function applyReset(supabase: any, reset: any) {
  const tasks: Promise<any>[] = [];

  if (reset.attendance) {
    tasks.push(supabase.from("player_attendance").delete().not("id", "is", null));
    tasks.push(supabase.from("visitor_attendance").delete().not("id", "is", null));
  }

  if (reset.monthlyPayments) {
    tasks.push(supabase.from("player_monthly_payments").delete().not("id", "is", null));
    tasks.push(supabase.from("visitor_session_payments").delete().not("id", "is", null));
  }

  if (reset.yearlyPayments) {
    tasks.push(supabase.from("player_yearly_payments").delete().not("id", "is", null));
  }

  if (reset.stats) {
    tasks.push(
      supabase.from("player_stats").update({ goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 }).not("player_id", "is", null)
    );
    tasks.push(
      supabase.from("visitor_stats").update({ yellow_cards: 0, red_cards: 0 }).not("visitor_id", "is", null)
    );
  }

  if (reset.disciplinePaid) {
    tasks.push(
      supabase.from("player_stats").update({ yellow_paid_count: 0, red_paid_count: 0 }).not("player_id", "is", null)
    );
    tasks.push(
      supabase.from("visitor_stats").update({ yellow_paid_count: 0, red_paid_count: 0 }).not("visitor_id", "is", null)
    );
  }

  await Promise.all(tasks);
}

export async function POST(request: NextRequest) {
  try {
    const auth = await assertSuperUser(request);
    if (!auth.ok || !auth.supabase || !auth.user) return failure(auth.reason, auth.status);

    const body = await request.json().catch(() => ({}));
    const newSeasonYear = Number(body?.newSeasonYear);
    const reset = body?.reset;

    if (!Number.isFinite(newSeasonYear)) {
      return failure("New season year is required.", 400);
    }
    if (!validateReset(reset)) {
      return failure("Reset flags must be boolean.", 400);
    }

    const { data: appSettings, error: settingsReadError } = await auth.supabase
      .from("app_settings")
      .select("season")
      .eq("id", true)
      .maybeSingle();

    if (settingsReadError) return failure(settingsReadError.message, 400);

    const currentSeason = Number(appSettings?.season || new Date().getFullYear());
    if (newSeasonYear < currentSeason) {
      return failure("New season year must be >= current season year.", 400);
    }

    const { error: settingsUpdateError } = await auth.supabase
      .from("app_settings")
      .upsert({ id: true, season: newSeasonYear }, { onConflict: "id" });

    if (settingsUpdateError) return failure(settingsUpdateError.message, 400);

    await applyReset(auth.supabase, reset);

    await logActivity(auth.supabase, {
      type: "season_rollover",
      message: `Season rollover to ${newSeasonYear}`,
      actorUserId: auth.user.id,
      metadata: { reset }
    });

    return success({ ok: true, season: newSeasonYear, backup: {} });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to rollover season.", 500);
  }
}
