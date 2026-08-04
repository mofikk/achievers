import { NextRequest } from "next/server";
import { failure, success } from "../http/response";
import { getAuthContext } from "../auth/permissions";
import { listBackups, getLatestBackup } from "./backups.service";
import { logActivity } from "./activity.service";

function validateReset(reset: any) {
  const fields = ["attendance", "monthlyPayments", "yearlyPayments", "stats", "disciplinePaid"];
  return fields.every((field) => typeof reset?.[field] === "boolean");
}

async function requireSuperUser(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return { ok: false as const, response: failure("Unauthorized", 401), auth: null };
  if (auth.profile.role !== "super_user") {
    return { ok: false as const, response: failure("Forbidden", 403), auth: null };
  }
  return { ok: true as const, response: null, auth };
}

async function applyReset(supabase: any, reset: any) {
  const deleteByIds = async (table: string) => {
    const { data, error } = await supabase.from(table).select("id");
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((row: any) => row.id).filter(Boolean);
    if (!ids.length) return;
    const { error: deleteError } = await supabase.from(table).delete().in("id", ids);
    if (deleteError) throw new Error(deleteError.message);
  };
  const updateByIds = async (table: string, idCol: string, payload: Record<string, unknown>) => {
    const { data, error } = await supabase.from(table).select(idCol);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((row: any) => row[idCol]).filter(Boolean);
    if (!ids.length) return;
    const { error: updateError } = await supabase.from(table).update(payload).in(idCol, ids);
    if (updateError) throw new Error(updateError.message);
  };

  if (reset.attendance) {
    await Promise.all([deleteByIds("player_attendance"), deleteByIds("visitor_attendance")]);
  }

  if (reset.monthlyPayments) {
    await Promise.all([deleteByIds("player_monthly_payments"), deleteByIds("visitor_session_payments")]);
  }

  if (reset.yearlyPayments) {
    await deleteByIds("player_yearly_payments");
  }

  if (reset.stats) {
    await updateByIds("player_stats", "player_id", { goals: 0, assists: 0, yellow_cards: 0, red_cards: 0 });
    try {
      await updateByIds("visitor_stats", "visitor_id", { goals: 0, yellow_cards: 0, red_cards: 0 });
    } catch {
      await updateByIds("visitor_stats", "visitor_id", { yellow_cards: 0, red_cards: 0 });
    }
  }

  if (reset.disciplinePaid) {
    await Promise.all([
      updateByIds("player_stats", "player_id", { yellow_paid_count: 0, red_paid_count: 0 }),
      updateByIds("visitor_stats", "visitor_id", { yellow_paid_count: 0, red_paid_count: 0 })
    ]);
  }
}

async function getLatestTimestamp(
  supabase: any,
  table: string,
  updatedCol = "updated_at",
  createdCol = "created_at"
) {
  const [stampRes, countRes, dataRes] = await Promise.all([
    supabase
      .from(table)
      .select(`${updatedCol}, ${createdCol}`)
      .order(updatedCol, { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    supabase.from(table).select("id", { count: "exact", head: true }),
    supabase.from(table).select("id")
  ]);

  let updatedAt = stampRes.data?.[updatedCol] || stampRes.data?.[createdCol] || null;
  if (stampRes.error) {
    const fallback = await supabase
      .from(table)
      .select(createdCol)
      .order(createdCol, { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error) {
      return { ok: false, updatedAt: null as string | null, error: fallback.error.message, sizeBytes: 0, rowCount: 0 };
    }
    updatedAt = fallback.data?.[createdCol] || null;
  }

  if (dataRes.error) {
    return {
      ok: false,
      updatedAt,
      error: dataRes.error.message,
      sizeBytes: 0,
      rowCount: Number(countRes.count) || 0
    };
  }

  const raw = JSON.stringify(dataRes.data ?? []);
  return {
    ok: true,
    updatedAt,
    error: null as string | null,
    sizeBytes: Buffer.byteLength(raw, "utf8"),
    rowCount: Number(countRes.count) || 0
  };
}

export async function getLatestBackupFile(request: NextRequest) {
  try {
    const check = await requireSuperUser(request);
    if (!check.ok || !check.auth) return check.response;

    const { searchParams } = new URL(request.url);
    const typeParam = searchParams.get("type");
    const type = typeParam === "settings" || typeParam === "activity_logs" ? typeParam : "db";
    const latest = await getLatestBackup(type);
    if (!latest) return failure("No backups found", 404);

    const raw = await (await import("node:fs/promises")).readFile(latest.fullPath, "utf8");
    return new Response(raw, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${latest.name}"`,
        "Cache-Control": "no-store",
        "X-Meta": JSON.stringify({ data: { success: true, file: latest.name }, error: null })
      }
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to fetch backup.", 500);
  }
}

export async function getDataHealth(request: NextRequest) {
  try {
    const check = await requireSuperUser(request);
    if (!check.ok || !check.auth) return check.response;
    const supabase = check.auth.supabase;

    const [
      playersHealth,
      settingsHealth,
      notesHealth,
      visitorsHealth,
      activityHealth,
      activityCountRes
    ] = await Promise.all([
      getLatestTimestamp(supabase, "players"),
      getLatestTimestamp(supabase, "app_settings"),
      getLatestTimestamp(supabase, "notes"),
      getLatestTimestamp(supabase, "visitors"),
      getLatestTimestamp(supabase, "activity_logs", "created_at", "created_at"),
      supabase.from("activity_logs").select("id", { count: "exact", head: true })
    ]);

    // Backup listing can fail on some serverless platforms due filesystem constraints.
    // Keep settings page functional by degrading to an empty backup list instead of 500.
    let backups: Array<{ type: string; name: string; updatedAt: string }> = [];
    try {
      backups = (await listBackups()) as Array<{ type: string; name: string; updatedAt: string }>;
    } catch {
      backups = [];
    }

    const totalEvents = activityCountRes.count || 0;
    const latestDb = backups.find((item) => item.type === "db") || null;
    const latestSettings = backups.find((item) => item.type === "settings") || null;
    const latestActivityLogs = backups.find((item) => item.type === "activity_logs") || null;

    return success({
      files: {
        db: {
          ok: playersHealth.ok,
          sizeBytes: playersHealth.sizeBytes,
          updatedAt: playersHealth.updatedAt,
          error: playersHealth.error || undefined
        },
        settings: {
          ok: settingsHealth.ok,
          sizeBytes: settingsHealth.sizeBytes,
          updatedAt: settingsHealth.updatedAt,
          error: settingsHealth.error || undefined
        },
        notes: {
          ok: notesHealth.ok,
          sizeBytes: notesHealth.sizeBytes,
          updatedAt: notesHealth.updatedAt,
          error: notesHealth.error || undefined
        },
        visitors: {
          ok: visitorsHealth.ok,
          sizeBytes: visitorsHealth.sizeBytes,
          updatedAt: visitorsHealth.updatedAt,
          error: visitorsHealth.error || undefined
        },
        activity: {
          ok: activityHealth.ok,
          sizeBytes: activityHealth.sizeBytes,
          updatedAt: activityHealth.updatedAt,
          error: activityHealth.error || undefined
        }
      },
      activity: {
        totalEvents,
        lastEventAt: activityHealth.updatedAt
      },
      backups: {
        count: backups.length,
        latestFiles: {
          db: latestDb?.name || null,
          settings: latestSettings?.name || null,
          activity_logs: latestActivityLogs?.name || null
        },
        latestByType: {
          db: latestDb?.updatedAt || null,
          settings: latestSettings?.updatedAt || null,
          activity_logs: latestActivityLogs?.updatedAt || null
        }
      },
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to load data health.", 500);
  }
}

export async function postResetSeason(request: NextRequest) {
  try {
    const check = await requireSuperUser(request);
    if (!check.ok || !check.auth) return check.response;
    const { supabase, user } = check.auth;

    const body = await request.json().catch(() => ({}));
    const reset = body?.reset;
    if (body?.confirm !== true) {
      return failure("Destructive operation not confirmed. Set confirm=true.", 400);
    }
    if (!validateReset(reset)) {
      return failure("Reset flags must be boolean.", 400);
    }

    const { data: appSettings, error: settingsReadError } = await supabase
      .from("app_settings")
      .select("season")
      .eq("id", true)
      .maybeSingle();

    if (settingsReadError) return failure(settingsReadError.message, 400);

    const season = Number(appSettings?.season || new Date().getFullYear());
    await applyReset(supabase, reset);

    await logActivity(supabase, {
      type: "season_rollover",
      message: `Season reset for ${season}`,
      actorUserId: user.id,
      metadata: { reset }
    });

    return success({ ok: true, season, backup: {} });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to reset season.", 500);
  }
}

export async function postRollover(request: NextRequest) {
  try {
    const check = await requireSuperUser(request);
    if (!check.ok || !check.auth) return check.response;
    const { supabase, user } = check.auth;

    const body = await request.json().catch(() => ({}));
    const newSeasonYear = Number(body?.newSeasonYear);
    const reset = body?.reset;
    if (body?.confirm !== true) {
      return failure("Destructive operation not confirmed. Set confirm=true.", 400);
    }

    if (!Number.isFinite(newSeasonYear)) {
      return failure("New season year is required.", 400);
    }
    if (!validateReset(reset)) {
      return failure("Reset flags must be boolean.", 400);
    }

    const { data: appSettings, error: settingsReadError } = await supabase
      .from("app_settings")
      .select("season")
      .eq("id", true)
      .maybeSingle();

    if (settingsReadError) return failure(settingsReadError.message, 400);

    const currentSeason = Number(appSettings?.season || new Date().getFullYear());
    if (newSeasonYear < currentSeason) {
      return failure("New season year must be >= current season year.", 400);
    }

    const { error: settingsUpdateError } = await supabase
      .from("app_settings")
      .upsert({ id: true, season: newSeasonYear }, { onConflict: "id" });

    if (settingsUpdateError) return failure(settingsUpdateError.message, 400);

    await applyReset(supabase, reset);

    await logActivity(supabase, {
      type: "season_rollover",
      message: `Season rollover to ${newSeasonYear}`,
      actorUserId: user.id,
      metadata: { reset }
    });

    return success({ ok: true, season: newSeasonYear, backup: {} });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to rollover season.", 500);
  }
}

