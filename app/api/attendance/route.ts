import { failure, success } from "../_lib/response";
import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "../_lib/auth";
import { createSupabaseServerClient } from "../_lib/supabase";
import { getActorContext, logActivity } from "../_lib/activity";
import { requirePermission } from "../_lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (!user) {
      return failure("Unauthorized", 401);
    }

    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const supabase = createSupabaseServerClient(token);

    const { data, error } = await supabase
      .from("player_attendance")
      .select("*")
      .order("session_date", { ascending: false });

    if (error) {
      return failure(error.message, 400);
    }

    const mapped = (data ?? []).map((row: any) => ({
      ...row,
      date: row.session_date,
      status: row.present === true
    }));

    return success(mapped);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch attendance records.";
    return failure(message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const perm = await requirePermission(request, "manage_attendance");
    if (!perm.ok || !perm.auth) return perm.response;
    const { user, supabase } = perm.auth;

    const body = await request.json();
    const sessionDate = body?.session_date || body?.date;
    const present = body?.present ?? body?.status;
    const payload = {
      player_id: body?.player_id,
      session_date: sessionDate,
      present
    };

    const { data: previous } = await supabase
      .from("player_attendance")
      .select("*")
      .eq("player_id", payload.player_id)
      .eq("session_date", payload.session_date)
      .maybeSingle();

    const { data, error } = await supabase
      .from("player_attendance")
      .upsert(payload, { onConflict: "player_id,session_date" })
      .select("*")
      .single();
    if (error) {
      return failure(error.message, 400);
    }

    const changed = !previous || Boolean(previous.present) !== Boolean(data?.present);
    if (changed) {
      const [{ data: player }, actor] = await Promise.all([
        supabase.from("players").select("full_name").eq("id", payload.player_id).maybeSingle(),
        getActorContext(supabase, user.id)
      ]);
      await logActivity(supabase, {
        type: "attendance_recorded",
        message: `${actor.name || "Someone"} recorded attendance for ${player?.full_name || "Unknown player"} (${String(data?.session_date || sessionDate).slice(0, 10)}: ${data?.present ? "present" : "absent"})`,
        actorUserId: user.id,
        relatedPlayerId: String(payload.player_id || ""),
        metadata: {
          action: "attendance_recorded",
          player_id: payload.player_id,
          player_name: player?.full_name || null,
          session_date: String(data?.session_date || sessionDate).slice(0, 10),
          present: Boolean(data?.present),
          previous_present: previous ? Boolean(previous.present) : null
        }
      });
    }

    return success(
      {
        ...data,
        date: data?.session_date,
        status: data?.present === true
      },
      201
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create attendance record.";
    return failure(message, 500);
  }
}

