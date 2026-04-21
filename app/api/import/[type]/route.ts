import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "../../_lib/auth";
import { createSupabaseServerClient } from "../../_lib/supabase";
import { failure, success } from "../../_lib/response";
import { parseCSV } from "../../_lib/csv";
import { logActivity } from "../../_lib/activity";
import { createBackup } from "../../_lib/backups";

type RouteContext = {
  params: Promise<{
    type: string;
  }>;
};

const allowedPositions = new Set([
  "FW", "CM", "CDM", "CAM", "LM", "RM", "CB", "RB", "LB", "LW", "RW", "GK", "DF", "MF"
]);

function normalizePair(name: string, nickname: string) {
  const safeName = String(name || "").trim().toLowerCase();
  const safeNickname = String(nickname || "").trim().toLowerCase();
  return `${safeName}::${safeNickname}`;
}

function normalizeMonthToDate(value: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-01`;
}

function toBoolean(value: unknown) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes" || raw === "present" || raw === "paid";
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
}

async function getExpectedSettings(supabase: any) {
  const [{ data: appSettings }, { data: scheduleRows }] = await Promise.all([
    supabase.from("app_settings").select("*").eq("id", true).maybeSingle(),
    supabase.from("monthly_fee_schedule").select("from_month, amount").order("from_month", { ascending: true })
  ]);

  return {
    newMemberYearly: Number(appSettings?.new_member_yearly_fee) || 5000,
    renewalYearly: Number(appSettings?.renewal_yearly_fee) || 2500,
    schedule: (scheduleRows ?? []).map((row: any) => ({
      from: String(row.from_month || "").slice(0, 7),
      amount: Number(row.amount) || 0
    }))
  };
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

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { type } = await context.params;
    const user = await requireAuthenticatedUser(request);
    if (!user) return failure("Unauthorized", 401);

    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const supabase = createSupabaseServerClient(token);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) return failure(profileError.message, 400);
    if (profile?.role !== "super_user") return failure("Unauthorized", 403);

    const body = await request.json().catch(() => ({}));
    const csvText = typeof body?.csv === "string" ? body.csv : "";
    const rows = parseCSV(csvText);
    const safeType = String(type || "");
    const supportedTypes = new Set(["players", "payments", "attendance", "stats", "visitors", "notes"]);
    if (!supportedTypes.has(safeType)) return failure("Unsupported import type.", 400);

    const backup = await createBackup(supabase, "db");

    if (safeType === "players") {
      if (!rows.length) return success({ created: 0, skipped: 0 });

      const { data: existingPlayers } = await supabase
        .from("players")
        .select("id, full_name, nickname");

      const existing = new Set(
        (existingPlayers ?? []).map((player: any) =>
          normalizePair(player.full_name, player.nickname || "")
        )
      );

      let created = 0;
      let skipped = 0;

      for (const row of rows) {
        const name = String(row.name || row.full_name || "").trim();
        const nickname = String(row.nickname || "").trim();
        const position = String(row.position || "").trim();
        const memberSinceYear = Number(row.memberSinceYear || row.member_since_year);

        if (!name || !position || !allowedPositions.has(position)) {
          skipped += 1;
          continue;
        }

        const key = normalizePair(name, nickname);
        if (existing.has(key)) {
          skipped += 1;
          continue;
        }

        const { data: inserted, error: insertError } = await supabase
          .from("players")
          .insert({
            full_name: name,
            nickname: nickname || null,
            position,
            member_since_year: Number.isFinite(memberSinceYear) ? memberSinceYear : new Date().getFullYear()
          })
          .select("id")
          .single();

        if (insertError || !inserted?.id) {
          skipped += 1;
          continue;
        }

        await supabase.from("player_stats").upsert(
          {
            player_id: inserted.id,
            goals: 0,
            assists: 0,
            yellow_cards: 0,
            red_cards: 0,
            yellow_paid_count: 0,
            red_paid_count: 0
          },
          { onConflict: "player_id" }
        );

        existing.add(key);
        created += 1;
      }

      await logActivity(supabase, {
        type: "import_completed",
        message: `Imported players: created ${created}, skipped ${skipped}`,
        actorUserId: user.id,
        metadata: { type: "players", created, skipped, backup: backup.fileName }
      });

      return success({ created, skipped, backup: backup.fileName });
    }

    if (safeType === "payments") {
      if (!rows.length) return success({ updated: 0, notFound: [] });

      const { data: players } = await supabase
        .from("players")
        .select("id, full_name, nickname, member_since_year");

      const expectations = await getExpectedSettings(supabase);
      const byName = new Map<string, any>();
      (players ?? []).forEach((player: any) => {
        byName.set(normalizePair(player.full_name, player.nickname || ""), player);
      });

      let updated = 0;
      const notFound: Array<{ name: string; nickname: string; yearKey: string; monthKey: string }> = [];

      for (const row of rows) {
        const name = String(row.name || row.full_name || "").trim();
        const nickname = String(row.nickname || "").trim();
        const yearKeyStr = String(row.yearKey || row.year_key || "").trim();
        const monthKey = String(row.monthKey || row.month_key || "").trim();
        const yearlyPaid = Number(row.yearlyPaid ?? row.yearly_paid ?? row.paidYearly);
        const monthlyPaid = Number(row.monthlyPaid ?? row.monthly_paid ?? row.paidMonthly);

        if (!/^\d{4}$/.test(yearKeyStr) || !/^\d{4}-\d{2}$/.test(monthKey)) continue;
        if (!Number.isFinite(yearlyPaid) || yearlyPaid < 0) continue;
        if (!Number.isFinite(monthlyPaid) || monthlyPaid < 0) continue;

        const player = byName.get(normalizePair(name, nickname));
        if (!player) {
          notFound.push({ name, nickname, yearKey: yearKeyStr, monthKey });
          continue;
        }

        const yearKey = Number(yearKeyStr);
        const monthDateKey = normalizeMonthToDate(monthKey);
        if (!monthDateKey) continue;

        const monthlyExpected = getMonthlyExpected(expectations.schedule, monthKey);
        const yearlyExpected =
          yearKey === Number(player.member_since_year)
            ? expectations.newMemberYearly
            : expectations.renewalYearly;

        await supabase.from("player_yearly_payments").upsert(
          {
            player_id: player.id,
            year_key: yearKey,
            expected_amount: yearlyExpected,
            paid_amount: yearlyPaid
          },
          { onConflict: "player_id,year_key" }
        );

        await supabase.from("player_monthly_payments").upsert(
          {
            player_id: player.id,
            month_key: monthDateKey,
            expected_amount: monthlyExpected,
            paid_amount: monthlyPaid
          },
          { onConflict: "player_id,month_key" }
        );

        updated += 1;
      }

      await logActivity(supabase, {
        type: "import_completed",
        message: `Imported payments: updated ${updated}, not found ${notFound.length}`,
        actorUserId: user.id,
        metadata: { type: "payments", updated, notFoundCount: notFound.length, backup: backup.fileName }
      });

      return success({ updated, notFound, backup: backup.fileName });
    }

    if (safeType === "attendance") {
      if (!rows.length) return success({ updated: 0, notFound: [], backup: backup.fileName });

      const { data: players } = await supabase.from("players").select("id, full_name, nickname");
      const byPair = new Map<string, any>();
      (players ?? []).forEach((player: any) => {
        byPair.set(normalizePair(player.full_name, player.nickname || ""), player);
      });

      let updated = 0;
      const notFound: Array<{ name: string; nickname: string; date: string }> = [];

      for (const row of rows) {
        const name = String(row.name || row.full_name || "").trim();
        const nickname = String(row.nickname || "").trim();
        const date = String(row.date || row.session_date || "").trim();
        const present = toBoolean(row.present ?? row.status);
        if (!name || !isIsoDate(date)) continue;

        const player = byPair.get(normalizePair(name, nickname));
        if (!player?.id) {
          notFound.push({ name, nickname, date });
          continue;
        }

        const { error } = await supabase
          .from("player_attendance")
          .upsert(
            { player_id: player.id, session_date: date, present },
            { onConflict: "player_id,session_date" }
          );
        if (!error) updated += 1;
      }

      await logActivity(supabase, {
        type: "import_completed",
        message: `Imported attendance: updated ${updated}, not found ${notFound.length}`,
        actorUserId: user.id,
        metadata: { type: "attendance", updated, notFoundCount: notFound.length, backup: backup.fileName }
      });

      return success({ updated, notFound, backup: backup.fileName });
    }

    if (safeType === "stats") {
      if (!rows.length) return success({ updated: 0, notFound: [], backup: backup.fileName });

      const { data: players } = await supabase.from("players").select("id, full_name, nickname");
      const byPair = new Map<string, any>();
      (players ?? []).forEach((player: any) => {
        byPair.set(normalizePair(player.full_name, player.nickname || ""), player);
      });

      let updated = 0;
      const notFound: Array<{ name: string; nickname: string }> = [];

      for (const row of rows) {
        const name = String(row.name || row.full_name || "").trim();
        const nickname = String(row.nickname || "").trim();
        if (!name) continue;

        const player = byPair.get(normalizePair(name, nickname));
        if (!player?.id) {
          notFound.push({ name, nickname });
          continue;
        }

        const payload = {
          player_id: player.id,
          goals: Number(row.goals) || 0,
          assists: Number(row.assists) || 0,
          yellow_cards: Number(row.yellow ?? row.yellow_cards) || 0,
          red_cards: Number(row.red ?? row.red_cards) || 0,
          yellow_paid_count: Number(row.yellowPaid ?? row.yellow_paid_count) || 0,
          red_paid_count: Number(row.redPaid ?? row.red_paid_count) || 0
        };

        const { error } = await supabase
          .from("player_stats")
          .upsert(payload, { onConflict: "player_id" });
        if (!error) updated += 1;
      }

      await logActivity(supabase, {
        type: "import_completed",
        message: `Imported stats: updated ${updated}, not found ${notFound.length}`,
        actorUserId: user.id,
        metadata: { type: "stats", updated, notFoundCount: notFound.length, backup: backup.fileName }
      });

      return success({ updated, notFound, backup: backup.fileName });
    }

    if (safeType === "visitors") {
      if (!rows.length) return success({ created: 0, skipped: 0, backup: backup.fileName });

      const { data: existingVisitors } = await supabase.from("visitors").select("id, full_name, nickname");
      const existing = new Set(
        (existingVisitors ?? []).map((visitor: any) => normalizePair(visitor.full_name, visitor.nickname || ""))
      );

      let created = 0;
      let skipped = 0;

      for (const row of rows) {
        const name = String(row.name || row.full_name || "").trim();
        const nickname = String(row.nickname || "").trim();
        const email = String(row.email || "").trim() || null;
        if (!name) {
          skipped += 1;
          continue;
        }

        const key = normalizePair(name, nickname);
        if (existing.has(key)) {
          skipped += 1;
          continue;
        }

        const { data: inserted, error: insertError } = await supabase
          .from("visitors")
          .insert({ full_name: name, nickname: nickname || null, email })
          .select("id")
          .single();
        if (insertError || !inserted?.id) {
          skipped += 1;
          continue;
        }

        await supabase.from("visitor_stats").upsert(
          {
            visitor_id: inserted.id,
            yellow_cards: Number(row.yellow ?? row.yellow_cards) || 0,
            red_cards: Number(row.red ?? row.red_cards) || 0,
            yellow_paid_count: Number(row.yellowPaid ?? row.yellow_paid_count) || 0,
            red_paid_count: Number(row.redPaid ?? row.red_paid_count) || 0
          },
          { onConflict: "visitor_id" }
        );

        const sessionDate = String(row.session_date || row.date || "").trim();
        const sessionPaid = Number(row.paid_amount ?? row.paid ?? row.session_paid);
        const sessionExpected = Number(row.expected_amount ?? row.expected ?? row.session_expected);
        if (isIsoDate(sessionDate) && Number.isFinite(sessionPaid) && sessionPaid >= 0) {
          await supabase.from("visitor_session_payments").upsert(
            {
              visitor_id: inserted.id,
              session_date: sessionDate,
              expected_amount: Number.isFinite(sessionExpected) ? sessionExpected : 1000,
              paid_amount: sessionPaid
            },
            { onConflict: "visitor_id,session_date" }
          );
        }

        existing.add(key);
        created += 1;
      }

      await logActivity(supabase, {
        type: "import_completed",
        message: `Imported visitors: created ${created}, skipped ${skipped}`,
        actorUserId: user.id,
        metadata: { type: "visitors", created, skipped, backup: backup.fileName }
      });

      return success({ created, skipped, backup: backup.fileName });
    }

    if (safeType === "notes") {
      if (!rows.length) return success({ created: 0, skipped: 0, backup: backup.fileName });

      let created = 0;
      let skipped = 0;
      for (const row of rows) {
        const text = String(row.text || row.body || "").trim();
        if (!text) {
          skipped += 1;
          continue;
        }

        const { error } = await supabase.from("notes").insert({
          body: text,
          pinned: toBoolean(row.pinned),
          tag: String(row.tag || "").trim() || null,
          created_by: user.id
        });
        if (error) skipped += 1;
        else created += 1;
      }

      await logActivity(supabase, {
        type: "import_completed",
        message: `Imported notes: created ${created}, skipped ${skipped}`,
        actorUserId: user.id,
        metadata: { type: "notes", created, skipped, backup: backup.fileName }
      });

      return success({ created, skipped, backup: backup.fileName });
    }

    return failure("Unsupported import type.", 400);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to import data.", 500);
  }
}
