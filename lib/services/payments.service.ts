import { NextRequest } from "next/server";
import { failure, success } from "../http/response";
import { logActivity } from "./activity.service";
import { requirePermission } from "../auth/permissions";
import { createServerClient } from "../supabase/server";
import { getTokenFromRequest } from "../auth/getToken";

function normalizeMonthKey(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-01`;
}

function normalizeYearKey(value: unknown) {
  const year = Number(value);
  return Number.isInteger(year) && year > 0 ? year : null;
}

async function resolveMonthlyExpected(supabase: any, monthDateKey: string) {
  const monthKey = monthDateKey.slice(0, 7);
  const { data: scheduleRows } = await supabase
    .from("monthly_fee_schedule")
    .select("from_month, amount")
    .order("from_month", { ascending: true });

  const schedule = (scheduleRows ?? []).map((row: any) => ({
    from: String(row.from_month || "").slice(0, 7),
    amount: Number(row.amount) || 0
  }));
  if (!schedule.length) return 2000;

  let candidate = Number(schedule[0]?.amount) || 2000;
  schedule.forEach((item) => {
    if (item.from <= monthKey) candidate = Number(item.amount) || candidate;
  });
  return candidate;
}

async function resolveYearlyExpected(supabase: any, playerId: string, yearKey: number) {
  const [{ data: appSettings }, { data: player }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("id, new_member_yearly_fee, renewal_yearly_fee")
      .eq("id", true)
      .maybeSingle(),
    supabase.from("players").select("member_since_year").eq("id", playerId).maybeSingle()
  ]);

  const newMemberYearly = Number(appSettings?.new_member_yearly_fee) || 5000;
  const renewalYearly = Number(appSettings?.renewal_yearly_fee) || 2500;
  const memberSinceYear = Number(player?.member_since_year) || yearKey;
  return yearKey === memberSinceYear ? newMemberYearly : renewalYearly;
}

async function resolveActorName(supabase: any, userId: string, fallback: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return String(data?.full_name || data?.email || fallback);
}

async function resolvePlayerName(supabase: any, playerId: string) {
  const { data } = await supabase
    .from("players")
    .select("full_name")
    .eq("id", playerId)
    .maybeSingle();
  return String(data?.full_name || "Unknown player");
}

export async function getPayments(req: NextRequest) {
  try {
    const supabase = createServerClient(getTokenFromRequest(req) || undefined);
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return failure("Unauthorized", 401);
    }

    const [{ data: monthlyData, error: monthlyError }, { data: yearlyData, error: yearlyError }] =
      await Promise.all([
        supabase
          .from("player_monthly_payments")
          .select("id, player_id, month_key, expected_amount, paid_amount, created_at, updated_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("player_yearly_payments")
          .select("id, player_id, year_key, expected_amount, paid_amount, created_at, updated_at")
          .order("created_at", { ascending: false })
      ]);

    if (monthlyError || yearlyError) {
      return failure(monthlyError?.message || yearlyError?.message || "Failed to fetch payments.", 400);
    }

    const combined = [
      ...(monthlyData ?? []).map((row) => ({
        ...row,
        type: "monthly",
        amount: Number(row.paid_amount) || 0,
        month_key: String(row.month_key || "").slice(0, 7)
      })),
      ...(yearlyData ?? []).map((row) => ({
        ...row,
        type: "yearly",
        amount: Number(row.paid_amount) || 0,
        year_key: row.year_key
      }))
    ];

    return success(combined);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch payments.";
    return failure(message, 500);
  }
}

export async function createPayment(req: NextRequest) {
  try {
    const perm = await requirePermission(req, "manage_payments");
    if (!perm.ok || !perm.auth) return perm.response;
    const { supabase, user } = perm.auth;

    const body = await req.json();
    const type = body?.type;

    if (type !== "monthly" && type !== "yearly") {
      return failure("Invalid payment type. Use 'monthly' or 'yearly'.", 400);
    }

    const playerId = String(body?.player_id ?? body?.playerId ?? "").trim();
    if (!playerId || playerId === "undefined" || playerId === "null") {
      return failure("player_id is required.", 400);
    }

    const paidAmount = Number(body?.amount ?? body?.paid_amount ?? 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      return failure("Invalid payment amount.", 400);
    }

    if (type === "monthly") {
      const monthKey = normalizeMonthKey(
        body?.month_key ?? body?.monthKey ?? body?.month ?? body?.date
      );
      if (!monthKey) {
        return failure("month_key is required (YYYY-MM).", 400);
      }

      const expectedAmountRaw = Number(body?.expected_amount);
      const expectedAmount = Number.isFinite(expectedAmountRaw)
        ? expectedAmountRaw
        : await resolveMonthlyExpected(supabase, monthKey);
      const { data: previousMonthly } = await supabase
        .from("player_monthly_payments")
        .select("id, player_id, month_key, expected_amount, paid_amount, created_at, updated_at")
        .eq("player_id", playerId)
        .eq("month_key", monthKey)
        .maybeSingle();

      const prevPaid = Number(previousMonthly?.paid_amount);
      const prevExpected = Number(previousMonthly?.expected_amount);
      const hasPrevious = previousMonthly != null;
      const changed =
        !hasPrevious ||
        prevPaid !== paidAmount ||
        prevExpected !== expectedAmount;

      if (!changed && previousMonthly) {
        return success(
          {
            ...previousMonthly,
            type: "monthly",
            amount: Number(previousMonthly.paid_amount) || 0,
            month_key: String(monthKey).slice(0, 7)
          },
          200
        );
      }

      const { data, error } = await supabase
        .from("player_monthly_payments")
        .upsert(
          {
            player_id: playerId,
            month_key: monthKey,
            expected_amount: expectedAmount,
            paid_amount: paidAmount
          },
          { onConflict: "player_id,month_key" }
        )
        .select("id, player_id, month_key, expected_amount, paid_amount, created_at, updated_at")
        .single();

      if (error) {
        return failure(error.message, 400);
      }

      if (changed) {
        const transitionedToCleared =
          paidAmount >= expectedAmount && (!hasPrevious || prevPaid < prevExpected);
        const monthlyType = transitionedToCleared
          ? "monthly_payment_cleared"
          : "monthly_payment_updated";
        const actorName = await resolveActorName(supabase, user.id, "Someone");
        const playerName = await resolvePlayerName(supabase, playerId);
        await logActivity(supabase, {
          type: monthlyType,
          message: transitionedToCleared
            ? `${actorName} cleared monthly payment for ${playerName} (${String(monthKey).slice(0, 7)})`
            : `${actorName} updated monthly payment for ${playerName} (${String(monthKey).slice(0, 7)})`,
          actorUserId: user.id,
          relatedPlayerId: playerId,
          metadata: {
            action: "monthly_payment_update",
            scope: "monthly",
            player_id: playerId,
            player_name: playerName,
            month_key: String(monthKey).slice(0, 7),
            expected_amount: expectedAmount,
            paid_amount: paidAmount,
            previous_paid_amount: hasPrevious ? prevPaid : null,
            previous_expected_amount: hasPrevious ? prevExpected : null
          }
        });
      }

      return success(
        {
          ...data,
          type: "monthly",
          amount: Number(data.paid_amount) || 0,
          month_key: String(data.month_key || "").slice(0, 7)
        },
        201
      );
    }

    const yearKey = normalizeYearKey(body?.year_key ?? body?.yearKey ?? body?.year);
    if (!yearKey) {
      return failure("year_key is required.", 400);
    }

    const expectedAmountRaw = Number(body?.expected_amount);
    const expectedAmount = Number.isFinite(expectedAmountRaw)
      ? expectedAmountRaw
      : await resolveYearlyExpected(supabase, playerId, yearKey);
    const { data: previousYearly } = await supabase
      .from("player_yearly_payments")
      .select("id, player_id, year_key, expected_amount, paid_amount, created_at, updated_at")
      .eq("player_id", playerId)
      .eq("year_key", yearKey)
      .maybeSingle();

    const prevPaid = Number(previousYearly?.paid_amount);
    const prevExpected = Number(previousYearly?.expected_amount);
    const hasPrevious = previousYearly != null;
    const changed =
      !hasPrevious ||
      prevPaid !== paidAmount ||
      prevExpected !== expectedAmount;

    if (!changed && previousYearly) {
      return success(
        {
          ...previousYearly,
          type: "yearly",
          amount: Number(previousYearly.paid_amount) || 0,
          year_key: yearKey
        },
        200
      );
    }
    const { data, error } = await supabase
      .from("player_yearly_payments")
      .upsert(
        {
          player_id: playerId,
          year_key: yearKey,
          expected_amount: expectedAmount,
          paid_amount: paidAmount
        },
        { onConflict: "player_id,year_key" }
      )
      .select("id, player_id, year_key, expected_amount, paid_amount, created_at, updated_at")
      .single();

    if (error) {
      return failure(error.message, 400);
    }

    if (changed) {
      const transitionedToCleared =
        paidAmount >= expectedAmount && (!hasPrevious || prevPaid < prevExpected);
      const yearlyType = transitionedToCleared
        ? "yearly_payment_cleared"
        : "yearly_payment_updated";
      const actorName = await resolveActorName(supabase, user.id, "Someone");
      const playerName = await resolvePlayerName(supabase, playerId);
      await logActivity(supabase, {
        type: yearlyType,
        message: transitionedToCleared
          ? `${actorName} cleared yearly payment for ${playerName} (${yearKey})`
          : `${actorName} updated yearly payment for ${playerName} (${yearKey})`,
        actorUserId: user.id,
        relatedPlayerId: playerId,
        metadata: {
          action: "yearly_payment_update",
          scope: "yearly",
          player_id: playerId,
          player_name: playerName,
          year_key: yearKey,
          expected_amount: expectedAmount,
          paid_amount: paidAmount,
          previous_paid_amount: hasPrevious ? prevPaid : null,
          previous_expected_amount: hasPrevious ? prevExpected : null
        }
      });
    }

    return success(
      {
        ...data,
        type: "yearly",
        amount: Number(data.paid_amount) || 0
      },
      201
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create payment.";
    return failure(message, 500);
  }
}


