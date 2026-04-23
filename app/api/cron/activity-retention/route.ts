import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { failure, success } from "../../../../lib/http/response";
import { pruneExpiredActivityLogs } from "../../../../lib/services/activity.service";

function authorizeCronRequest(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET || "";
  if (!cronSecret) return { ok: false as const, reason: "CRON_SECRET is not configured." };

  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token || token !== cronSecret) {
    return { ok: false as const, reason: "Unauthorized cron request." };
  }
  return { ok: true as const, reason: "" };
}

function createMaintenanceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey);
}

export async function GET(request: NextRequest) {
  try {
    const auth = authorizeCronRequest(request);
    if (!auth.ok) return failure(auth.reason, 401);

    const supabase = createMaintenanceSupabaseClient();
    if (!supabase) {
      return failure("Supabase maintenance client is not configured.", 500);
    }

    const result = await pruneExpiredActivityLogs(supabase);
    return success(result);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to run activity retention job.", 500);
  }
}

