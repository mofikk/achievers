import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "../../_lib/auth";
import { createSupabaseServerClient } from "../../_lib/supabase";
import { success, failure } from "../../_lib/response";
import { listBackups } from "../../_lib/backups";

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
    supabase.from(table).select("*")
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

export async function GET(request: NextRequest) {
  try {
    const auth = await assertSuperUser(request);
    if (!auth.ok || !auth.supabase) return failure(auth.reason, auth.status);

    const supabase = auth.supabase;

    const [
      playersHealth,
      settingsHealth,
      notesHealth,
      visitorsHealth,
      activityHealth,
      activityCountRes,
      backups
    ] = await Promise.all([
      getLatestTimestamp(supabase, "players"),
      getLatestTimestamp(supabase, "app_settings"),
      getLatestTimestamp(supabase, "notes"),
      getLatestTimestamp(supabase, "visitors"),
      getLatestTimestamp(supabase, "activity_logs", "created_at", "created_at"),
      supabase.from("activity_logs").select("id", { count: "exact", head: true }),
      listBackups()
    ]);

    const totalEvents = activityCountRes.count || 0;
    const latestDb = backups.find((item) => item.type === "db") || null;
    const latestSettings = backups.find((item) => item.type === "settings") || null;

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
          settings: latestSettings?.name || null
        },
        latestByType: {
          db: latestDb?.updatedAt || null,
          settings: latestSettings?.updatedAt || null
        }
      },
      serverTime: new Date().toISOString()
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to load data health.", 500);
  }
}
