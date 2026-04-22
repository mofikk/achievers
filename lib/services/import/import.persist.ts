import { NextRequest } from "next/server";
import { failure, success } from "../../http/response";
import { logActivity } from "../activity.service";
import { createBackup } from "../backups.service";
import { getAuthContext } from "../../auth/permissions";
import { parseImportRows } from "./import.parse";
import { isSupportedImportType, type ImportType } from "./import.validate";
import {
  buildAttendancePayload,
  buildNotesPayload,
  buildPaymentsPayload,
  buildPlayerInsertRows,
  buildStatsPayload,
  buildVisitorInsertRows,
  buildVisitorPaymentPayload,
  buildVisitorStatsPayload,
  normalizePair
} from "./import.transform";

async function getExpectedSettings(supabase: any) {
  const [{ data: appSettings }, { data: scheduleRows }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("id, club_name, season, currency_symbol, new_member_yearly_fee, renewal_yearly_fee")
      .eq("id", true)
      .maybeSingle(),
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

async function logImportCompleted(
  supabase: any,
  userId: string,
  payload: { type: string; message: string; metadata: Record<string, unknown> }
) {
  await logActivity(supabase, {
    type: "import_completed",
    message: payload.message,
    actorUserId: userId,
    metadata: payload.metadata
  });
}

async function importPlayers(supabase: any, rows: any[], userId: string, backupFile: string) {
  const { data: existingPlayers } = await supabase.from("players").select("id, full_name, nickname");
  const existing = new Set<string>(
    (existingPlayers ?? []).map((player: any) => normalizePair(player.full_name, player.nickname || ""))
  );
  const { insertRows, skipped } = buildPlayerInsertRows(rows, existing);
  let created = 0;

  if (insertRows.length) {
    const { data: insertedPlayers, error: insertError } = await supabase
      .from("players")
      .insert(insertRows)
      .select("id");
    if (insertError) return failure(insertError.message, 400);

    const statsPayload = (insertedPlayers ?? []).map((row: any) => ({
      player_id: row.id,
      goals: 0,
      assists: 0,
      yellow_cards: 0,
      red_cards: 0,
      yellow_paid_count: 0,
      red_paid_count: 0
    }));
    if (statsPayload.length) {
      await supabase.from("player_stats").upsert(statsPayload, { onConflict: "player_id" });
    }
    created = statsPayload.length;
  }

  await logImportCompleted(supabase, userId, {
    type: "players",
    message: `Imported players: created ${created}, skipped ${skipped}`,
    metadata: { type: "players", created, skipped, backup: backupFile }
  });
  return success({ created, skipped, backup: backupFile });
}

async function importPayments(supabase: any, rows: any[], userId: string, backupFile: string) {
  const [{ data: players }, expectations] = await Promise.all([
    supabase.from("players").select("id, full_name, nickname, member_since_year"),
    getExpectedSettings(supabase)
  ]);

  const byName = new Map<string, any>();
  (players ?? []).forEach((player: any) => {
    byName.set(normalizePair(player.full_name, player.nickname || ""), player);
  });

  const { updated, notFound, yearlyPayload, monthlyPayload } = buildPaymentsPayload(rows, byName, expectations);
  if (yearlyPayload.length) {
    const { error } = await supabase
      .from("player_yearly_payments")
      .upsert(yearlyPayload, { onConflict: "player_id,year_key" });
    if (error) return failure(error.message, 400);
  }
  if (monthlyPayload.length) {
    const { error } = await supabase
      .from("player_monthly_payments")
      .upsert(monthlyPayload, { onConflict: "player_id,month_key" });
    if (error) return failure(error.message, 400);
  }

  await logImportCompleted(supabase, userId, {
    type: "payments",
    message: `Imported payments: updated ${updated}, not found ${notFound.length}`,
    metadata: { type: "payments", updated, notFoundCount: notFound.length, backup: backupFile }
  });
  return success({ updated, notFound, backup: backupFile });
}

async function importAttendance(supabase: any, rows: any[], userId: string, backupFile: string) {
  const { data: players } = await supabase.from("players").select("id, full_name, nickname");
  const byPair = new Map<string, any>();
  (players ?? []).forEach((player: any) => {
    byPair.set(normalizePair(player.full_name, player.nickname || ""), player);
  });

  const { updated, notFound, attendancePayload } = buildAttendancePayload(rows, byPair);
  if (attendancePayload.length) {
    const { error } = await supabase
      .from("player_attendance")
      .upsert(attendancePayload, { onConflict: "player_id,session_date" });
    if (error) return failure(error.message, 400);
  }

  await logImportCompleted(supabase, userId, {
    type: "attendance",
    message: `Imported attendance: updated ${updated}, not found ${notFound.length}`,
    metadata: { type: "attendance", updated, notFoundCount: notFound.length, backup: backupFile }
  });
  return success({ updated, notFound, backup: backupFile });
}

async function importStats(supabase: any, rows: any[], userId: string, backupFile: string) {
  const { data: players } = await supabase.from("players").select("id, full_name, nickname");
  const byPair = new Map<string, any>();
  (players ?? []).forEach((player: any) => {
    byPair.set(normalizePair(player.full_name, player.nickname || ""), player);
  });

  const { updated, notFound, statsPayload } = buildStatsPayload(rows, byPair);
  if (statsPayload.length) {
    const { error } = await supabase
      .from("player_stats")
      .upsert(statsPayload, { onConflict: "player_id" });
    if (error) return failure(error.message, 400);
  }

  await logImportCompleted(supabase, userId, {
    type: "stats",
    message: `Imported stats: updated ${updated}, not found ${notFound.length}`,
    metadata: { type: "stats", updated, notFoundCount: notFound.length, backup: backupFile }
  });
  return success({ updated, notFound, backup: backupFile });
}

async function importVisitors(supabase: any, rows: any[], userId: string, backupFile: string) {
  const { data: existingVisitors } = await supabase.from("visitors").select("id, full_name, nickname");
  const existing = new Set<string>(
    (existingVisitors ?? []).map((visitor: any) => normalizePair(visitor.full_name, visitor.nickname || ""))
  );
  const { skipped, insertVisitors, visitorMeta } = buildVisitorInsertRows(rows, existing);

  let createdVisitors: any[] = [];
  if (insertVisitors.length) {
    const { data: insertedVisitors, error } = await supabase
      .from("visitors")
      .insert(insertVisitors)
      .select("id, full_name, nickname");
    if (error) return failure(error.message, 400);
    createdVisitors = insertedVisitors ?? [];
  }

  const visitorStatsPayload = buildVisitorStatsPayload(createdVisitors, visitorMeta);
  if (visitorStatsPayload.length) {
    await supabase.from("visitor_stats").upsert(visitorStatsPayload, { onConflict: "visitor_id" });
  }

  const visitorPaymentPayload = buildVisitorPaymentPayload(createdVisitors, visitorMeta);
  if (visitorPaymentPayload.length) {
    await supabase
      .from("visitor_session_payments")
      .upsert(visitorPaymentPayload, { onConflict: "visitor_id,session_date" });
  }

  const created = createdVisitors.length;
  await logImportCompleted(supabase, userId, {
    type: "visitors",
    message: `Imported visitors: created ${created}, skipped ${skipped}`,
    metadata: { type: "visitors", created, skipped, backup: backupFile }
  });
  return success({ created, skipped, backup: backupFile });
}

async function importNotes(supabase: any, rows: any[], userId: string, backupFile: string) {
  const { created, skipped, notePayload } = buildNotesPayload(rows, userId);
  if (notePayload.length) {
    const { error } = await supabase.from("notes").insert(notePayload);
    if (error) return failure(error.message, 400);
  }

  await logImportCompleted(supabase, userId, {
    type: "notes",
    message: `Imported notes: created ${created}, skipped ${skipped}`,
    metadata: { type: "notes", created, skipped, backup: backupFile }
  });
  return success({ created, skipped, backup: backupFile });
}

export async function importByType(request: NextRequest, type: string) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return failure("Unauthorized", 401);
    const { user, supabase, profile } = auth;
    if (profile.role !== "super_user") return failure("Unauthorized", 403);

    if (!isSupportedImportType(type)) return failure("Unsupported import type.", 400);
    const rows = await parseImportRows(request);
    const backup = await createBackup(supabase, "db");
    const safeType: ImportType = type;

    if (safeType === "players") return importPlayers(supabase, rows, user.id, backup.fileName);
    if (safeType === "payments") return importPayments(supabase, rows, user.id, backup.fileName);
    if (safeType === "attendance") return importAttendance(supabase, rows, user.id, backup.fileName);
    if (safeType === "stats") return importStats(supabase, rows, user.id, backup.fileName);
    if (safeType === "visitors") return importVisitors(supabase, rows, user.id, backup.fileName);
    return importNotes(supabase, rows, user.id, backup.fileName);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to import data.", 500);
  }
}
