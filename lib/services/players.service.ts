import { NextRequest } from "next/server";
import { failure, success } from "../http/response";
import { getActorContext, logActivity } from "./activity.service";
import { getAuthContext, requirePermission } from "../auth/permissions";
import { createServerClient } from "../supabase/server";
import { getTokenFromRequest } from "../auth/getToken";

function toLegacyPlayerShape(row: Record<string, any>) {
  const memberSinceYear = Number(row.member_since_year ?? new Date().getFullYear());
  return {
    id: row.id,
    name: row.full_name ?? "",
    nickname: row.nickname ?? "",
    email: row.email ?? "",
    position: row.position ?? "",
    createdAt: row.created_at ?? new Date(0).toISOString(),
    membership: { memberSinceYear: Number.isFinite(memberSinceYear) ? memberSinceYear : new Date().getFullYear() },
    subscriptions: { year: {}, months: {} },
    payments: { yearly: {}, monthly: {} },
    stats: { goals: 0, assists: 0, yellow: 0, red: 0 },
    discipline: { yellowPaid: 0, redPaid: 0 },
    attendance: {}
  };
}

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

function capitalizeWords(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b([a-z])/g, (char) => char.toUpperCase());
}

async function getSettingsForExpectations(supabase: any) {
  const [{ data: appSettings }, { data: scheduleRows }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("id, new_member_yearly_fee, renewal_yearly_fee")
      .eq("id", true)
      .maybeSingle(),
    supabase.from("monthly_fee_schedule").select("from_month, amount").order("from_month", { ascending: true })
  ]);

  const schedule = (scheduleRows ?? []).map((row: any) => ({
    from: String(row.from_month || "").slice(0, 7),
    amount: Number(row.amount) || 0
  }));

  return {
    newMemberYearly: Number(appSettings?.new_member_yearly_fee) || 5000,
    renewalYearly: Number(appSettings?.renewal_yearly_fee) || 2500,
    schedule
  };
}

async function resolveActorName(supabase: any, userId: string, fallback: string) {
  const { data } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  return String(data?.full_name || data?.email || fallback);
}

function getMonthlyExpected(schedule: Array<{ from: string; amount: number }>, monthKey: string) {
  if (!schedule.length) return 2000;
  const sorted = [...schedule].sort((a, b) => a.from.localeCompare(b.from));
  let candidate = Number(sorted[0]?.amount) || 2000;
  sorted.forEach((item) => {
    if (item.from <= monthKey) candidate = Number(item.amount) || candidate;
  });
  return candidate;
}

async function rollbackPlayerCreation(supabase: any, playerId: string) {
  const { error } = await supabase.from("players").delete().eq("id", playerId);
  return error ? error.message : null;
}

export async function getPlayers(req: NextRequest) {
  try {
    const supabase = createServerClient(getTokenFromRequest(req) || undefined);
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();
    if (authError || !user) return failure("Unauthorized", 401);

    const [
      { data: playerRows, error: playersError },
      { data: monthlyRows },
      { data: yearlyRows },
      { data: attendanceRows },
      { data: statsRows }
    ] = await Promise.all([
      supabase
        .from("players")
        .select("id, full_name, nickname, email, position, member_since_year, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("player_monthly_payments").select("player_id, month_key, paid_amount"),
      supabase.from("player_yearly_payments").select("player_id, year_key, paid_amount"),
      supabase.from("player_attendance").select("player_id, session_date, present"),
      supabase
        .from("player_stats")
        .select("player_id, goals, assists, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
    ]);

    if (playersError) return failure(playersError.message || "Failed to fetch players.", 400);

    const mapped = (playerRows ?? []).map((row) => toLegacyPlayerShape(row as Record<string, any>));
    const byId = new Map(mapped.map((p) => [String(p.id), p]));

    (monthlyRows ?? []).forEach((r: any) => {
      const p = byId.get(String(r.player_id || ""));
      if (!p) return;
      const key = String(r.month_key || "").slice(0, 7);
      if (!key) return;
      const paid = Number(r.paid_amount) || 0;
      p.payments.monthly[key] = { paid };
      p.subscriptions.months[key] = paid > 0 ? "paid" : "pending";
    });

    (yearlyRows ?? []).forEach((r: any) => {
      const p = byId.get(String(r.player_id || ""));
      if (!p) return;
      const key = String(r.year_key || "").trim();
      if (!key) return;
      const paid = Number(r.paid_amount) || 0;
      p.payments.yearly[key] = { paid };
      p.subscriptions.year[key] = paid > 0 ? "paid" : "pending";
    });

    (attendanceRows ?? []).forEach((r: any) => {
      const p = byId.get(String(r.player_id || ""));
      if (!p) return;
      const key = String(r.session_date || "").slice(0, 10);
      if (!key) return;
      p.attendance[key] = r.present === true;
    });

    (statsRows ?? []).forEach((r: any) => {
      const p = byId.get(String(r.player_id || ""));
      if (!p) return;
      p.stats = {
        goals: Number(r.goals) || 0,
        assists: Number(r.assists) || 0,
        yellow: Number(r.yellow_cards) || 0,
        red: Number(r.red_cards) || 0
      };
      p.discipline = {
        yellowPaid: Number(r.yellow_paid_count) || 0,
        redPaid: Number(r.red_paid_count) || 0
      };
    });

    return success(mapped);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to fetch players.", 500);
  }
}

export async function createPlayer(req: NextRequest) {
  try {
    const perm = await requirePermission(req, "manage_players_create");
    if (!perm.ok || !perm.auth) return perm.response;
    const { supabase, user } = perm.auth;

    const body = await req.json();
    if (!body || typeof body !== "object") return failure("Invalid request body.", 400);

    const {
      name,
      full_name: fullNameFromBody,
      nickname,
      email,
      position,
      member_since,
      member_since_year,
      memberSinceYear,
      initialMonthlyPaid,
      initialMonthKey,
      initialYearlyPaid,
      initialYearKey
    } = body as Record<string, unknown>;

    const full_name =
      typeof fullNameFromBody === "string"
        ? capitalizeWords(fullNameFromBody)
        : typeof name === "string"
          ? capitalizeWords(name)
          : "";
    if (!full_name) return failure("Full name is required", 400);

    const memberSinceValue =
      typeof member_since_year === "number" || typeof member_since_year === "string"
        ? member_since_year
        : typeof memberSinceYear === "number" || typeof memberSinceYear === "string"
          ? memberSinceYear
        : member_since;
    const parsedMemberSinceYear = Number(memberSinceValue);
    if (!Number.isFinite(parsedMemberSinceYear)) {
      return failure("Member since year is required", 400);
    }

    const monthlyPaid = Number(initialMonthlyPaid);
    const yearlyPaid = Number(initialYearlyPaid);
    const monthDateKey =
      Number.isFinite(monthlyPaid) && monthlyPaid > 0 ? normalizeMonthKey(initialMonthKey) : "";
    const yearKey =
      Number.isFinite(yearlyPaid) && yearlyPaid > 0 ? normalizeYearKey(initialYearKey) : null;

    if (Number.isFinite(monthlyPaid) && monthlyPaid > 0 && !monthDateKey) {
      return failure("Initial month key is required when monthly payment is provided (YYYY-MM).", 400);
    }

    if (Number.isFinite(yearlyPaid) && yearlyPaid > 0 && !yearKey) {
      return failure("Initial year key is required when yearly payment is provided (YYYY).", 400);
    }

    const { data, error } = await supabase
      .from("players")
      .insert({
        full_name,
        nickname: nickname ? capitalizeWords(nickname) : null,
        email: email ?? null,
        position,
        member_since_year: parsedMemberSinceYear
      })
      .select("id, full_name, nickname, email, position, member_since_year, created_at")
      .single();

    if (error) return failure(error?.message || "Failed to create player.", 400);

    const playerId = data?.id;
    const expectations = await getSettingsForExpectations(supabase);

    if (playerId && Number.isFinite(monthlyPaid) && monthlyPaid > 0) {
      const monthKey = monthDateKey.slice(0, 7);
      const expected = getMonthlyExpected(expectations.schedule, monthKey);
      const { error: monthlyUpsertError } = await supabase
        .from("player_monthly_payments")
        .upsert(
          {
            player_id: playerId,
            month_key: monthDateKey,
            expected_amount: expected,
            paid_amount: monthlyPaid
          },
          { onConflict: "player_id,month_key" }
        );

      if (monthlyUpsertError) {
        const rollbackError = await rollbackPlayerCreation(supabase, playerId);
        return failure(
          rollbackError
            ? `${monthlyUpsertError.message || "Failed to add initial monthly payment."} Rollback failed: ${rollbackError}`
            : monthlyUpsertError.message || "Failed to add initial monthly payment.",
          400
        );
      }
    }

    if (playerId && Number.isFinite(yearlyPaid) && yearlyPaid > 0) {
      const expected =
        yearKey === Number(parsedMemberSinceYear)
          ? expectations.newMemberYearly
          : expectations.renewalYearly;
      const { error: yearlyUpsertError } = await supabase
        .from("player_yearly_payments")
        .upsert(
          {
            player_id: playerId,
            year_key: yearKey,
            expected_amount: expected,
            paid_amount: yearlyPaid
          },
          { onConflict: "player_id,year_key" }
        );

      if (yearlyUpsertError) {
        const rollbackError = await rollbackPlayerCreation(supabase, playerId);
        return failure(
          rollbackError
            ? `${yearlyUpsertError.message || "Failed to add initial yearly payment."} Rollback failed: ${rollbackError}`
            : yearlyUpsertError.message || "Failed to add initial yearly payment.",
          400
        );
      }
    }

    if (playerId) {
      const { error: statsError } = await supabase
        .from("player_stats")
        .upsert(
          {
            player_id: playerId,
            goals: 0,
            assists: 0,
            yellow_cards: 0,
            red_cards: 0,
            yellow_paid_count: 0,
            red_paid_count: 0
          },
          { onConflict: "player_id" }
        );

      if (statsError) {
        const rollbackError = await rollbackPlayerCreation(supabase, playerId);
        return failure(
          rollbackError
            ? `${statsError.message || "Failed to initialize player stats."} Rollback failed: ${rollbackError}`
            : statsError.message || "Failed to initialize player stats.",
          400
        );
      }
    }

    const actorName = await resolveActorName(supabase, user.id, "Someone");
    await logActivity(supabase, {
      type: "member_joined",
      message: `${actorName} created player ${full_name}`,
      actorUserId: user.id,
      relatedPlayerId: playerId || null,
      metadata: {
        action: "create_player",
        player_id: playerId || null,
        full_name,
        position: position || null
      }
    });

    return success(toLegacyPlayerShape(data), 201);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to create player.", 500);
  }
}

export async function patchPlayer(request: NextRequest, id: string) {
  try {
    const perm = await requirePermission(request, "manage_players_update");
    if (!perm.ok || !perm.auth) return perm.response;
    const { supabase, user } = perm.auth;

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return failure("Invalid request body.", 400);
    }

    const updatePayload: Record<string, unknown> = {};
    const bodyAny = body as any;

    const incomingName = typeof bodyAny.full_name === "string"
      ? bodyAny.full_name
      : typeof bodyAny.name === "string"
        ? bodyAny.name
        : undefined;

    if (incomingName !== undefined) updatePayload.full_name = capitalizeWords(incomingName);
    if (bodyAny.nickname !== undefined) updatePayload.nickname = bodyAny.nickname ? capitalizeWords(bodyAny.nickname) : null;
    if (bodyAny.email !== undefined) updatePayload.email = bodyAny.email ? String(bodyAny.email).trim() : null;
    if (bodyAny.position !== undefined) updatePayload.position = bodyAny.position;

    const memberSince = bodyAny.member_since_year ?? bodyAny.memberSinceYear;
    if (memberSince !== undefined) {
      const year = Number(memberSince);
      if (!Number.isFinite(year)) return failure("member_since_year must be a number.", 400);
      updatePayload.member_since_year = year;
    }

    const { data, error } = await supabase
      .from("players")
      .update(updatePayload)
      .eq("id", id)
      .select("id, full_name, nickname, email, position, member_since_year, created_at")
      .single();

    if (error) {
      return failure(error.message, 400);
    }

    const actorName = await resolveActorName(supabase, user.id, "Someone");
    await logActivity(supabase, {
      type: "player_updated",
      message: `${actorName} updated player ${data.full_name || "Unknown"}`,
      actorUserId: user.id,
      relatedPlayerId: String(data.id || id),
      metadata: {
        action: "update_player",
        player_id: String(data.id || id),
        player_name: data.full_name || "Unknown"
      }
    });

    const memberSinceYear = Number(data?.member_since_year ?? new Date().getFullYear());
    return success({
      id: data.id,
      name: data.full_name ?? "",
      nickname: data.nickname ?? "",
      email: data.email ?? "",
      position: data.position ?? "",
      createdAt: data.created_at ?? new Date(0).toISOString(),
      membership: { memberSinceYear: Number.isFinite(memberSinceYear) ? memberSinceYear : new Date().getFullYear() },
      subscriptions: { year: {}, months: {} },
      payments: { yearly: {}, monthly: {} },
      stats: { goals: 0, assists: 0, yellow: 0, red: 0 },
      discipline: { yellowPaid: 0, redPaid: 0 },
      attendance: {}
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update player.";
    return failure(message, 500);
  }
}

export async function deletePlayer(request: NextRequest, id: string) {
  try {
    const perm = await requirePermission(request, "manage_players_delete");
    if (!perm.ok || !perm.auth) return perm.response;
    const { supabase, user } = perm.auth;

    const { data: playerBeforeDelete } = await supabase
      .from("players")
      .select("id, full_name")
      .eq("id", id)
      .maybeSingle();

    const actorName = await resolveActorName(supabase, user.id, "Someone");
    await logActivity(supabase, {
      type: "player_updated",
      message: `${actorName} deleted player ${playerBeforeDelete?.full_name || "Unknown"}`,
      actorUserId: user.id,
      relatedPlayerId: id,
      metadata: {
        action: "delete_player",
        player_id: id,
        player_name: playerBeforeDelete?.full_name || "Unknown"
      }
    });

    await Promise.all([
      supabase.from("player_attendance").delete().eq("player_id", id),
      supabase.from("player_monthly_payments").delete().eq("player_id", id),
      supabase.from("player_yearly_payments").delete().eq("player_id", id),
      supabase.from("player_stats").delete().eq("player_id", id)
    ]);

    const { error } = await supabase.from("players").delete().eq("id", id);
    if (error) {
      return failure(error.message, 400);
    }

    return success({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete player.";
    return failure(message, 500);
  }
}

export async function patchPlayerStats(request: NextRequest, id: string) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return failure("Unauthorized", 401);
    const { user, supabase, permissions } = auth;
    const body = await request.json();
    const touchesStats =
      body?.goals !== undefined ||
      body?.assists !== undefined ||
      body?.yellow !== undefined ||
      body?.red !== undefined;
    const touchesFines =
      body?.discipline?.yellowPaid !== undefined ||
      body?.discipline?.redPaid !== undefined;
    if (touchesStats && !permissions.manage_stats) return failure("Forbidden", 403);
    if (touchesFines && !permissions.manage_fines) return failure("Forbidden", 403);
    const { data: previous } = await supabase
      .from("player_stats")
      .select("player_id, goals, assists, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
      .eq("player_id", id)
      .maybeSingle();

    const payload = {
      player_id: id,
      goals: Number(body?.goals) || 0,
      assists: Number(body?.assists) || 0,
      yellow_cards: Number(body?.yellow) || 0,
      red_cards: Number(body?.red) || 0,
      yellow_paid_count: Number(body?.discipline?.yellowPaid) || 0,
      red_paid_count: Number(body?.discipline?.redPaid) || 0
    };

    const { data, error } = await supabase
      .from("player_stats")
      .upsert(payload, { onConflict: "player_id" })
      .select("player_id, goals, assists, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
      .single();

    if (error) return failure(error.message, 400);

    const actor = await getActorContext(supabase, user.id);
    const { data: player } = await supabase
      .from("players")
      .select("full_name")
      .eq("id", id)
      .maybeSingle();
    const playerName = player?.full_name || "Unknown player";

    const statsChanged =
      !previous ||
      Number(previous.goals) !== Number(data.goals) ||
      Number(previous.assists) !== Number(data.assists) ||
      Number(previous.yellow_cards) !== Number(data.yellow_cards) ||
      Number(previous.red_cards) !== Number(data.red_cards);

    const fineChanged =
      !previous ||
      Number(previous.yellow_paid_count) !== Number(data.yellow_paid_count) ||
      Number(previous.red_paid_count) !== Number(data.red_paid_count);

    if (statsChanged) {
      await logActivity(supabase, {
        type: "stats_updated",
        message: `${actor.name || "Someone"} updated stats for ${playerName}`,
        actorUserId: user.id,
        relatedPlayerId: id,
        metadata: {
          action: "update_player_stats",
          player_id: id,
          player_name: playerName
        }
      });
    }

    if (fineChanged) {
      const totalCards = Number(data.yellow_cards) + Number(data.red_cards);
      const totalPaidCount = Number(data.yellow_paid_count) + Number(data.red_paid_count);
      const previousTotalCards = Number(previous?.yellow_cards || 0) + Number(previous?.red_cards || 0);
      const previousTotalPaidCount = Number(previous?.yellow_paid_count || 0) + Number(previous?.red_paid_count || 0);
      const fineType =
        totalCards > 0 &&
        totalPaidCount >= totalCards &&
        previousTotalPaidCount < previousTotalCards
          ? "fine_cleared"
          : "fine_updated";
      await logActivity(supabase, {
        type: fineType,
        message:
          fineType === "fine_cleared"
            ? `${actor.name || "Someone"} cleared fines for ${playerName}`
            : `${actor.name || "Someone"} updated fines for ${playerName}`,
        actorUserId: user.id,
        relatedPlayerId: id,
        metadata: {
          action: "update_player_fines",
          player_id: id,
          player_name: playerName,
          yellow_paid_count: Number(data.yellow_paid_count) || 0,
          red_paid_count: Number(data.red_paid_count) || 0
        }
      });
    }

    return success({
      player_id: data.player_id,
      goals: Number(data.goals) || 0,
      assists: Number(data.assists) || 0,
      yellow: Number(data.yellow_cards) || 0,
      red: Number(data.red_cards) || 0,
      discipline: {
        yellowPaid: Number(data.yellow_paid_count) || 0,
        redPaid: Number(data.red_paid_count) || 0
      }
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to update stats.", 500);
  }
}


