import { failure, success } from "../_lib/response";
import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "../_lib/auth";
import { createSupabaseServerClient } from "../_lib/supabase";
import { getActorContext, logActivity } from "../_lib/activity";
import { requirePermission } from "../_lib/permissions";

function mapVisitorBase(row: any) {
  return {
    id: row.id,
    name: row.full_name ?? "",
    nickname: row.nickname ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at ?? new Date(0).toISOString(),
    attendance: {},
    payments: { sessions: {} },
    stats: { yellow: 0, red: 0 },
    discipline: { yellowPaid: 0, redPaid: 0 }
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (!user) {
      return failure("Unauthorized", 401);
    }

    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const supabase = createSupabaseServerClient(token);

    const [
      { data: visitors, error: visitorsError },
      { data: attendanceRows },
      { data: paymentRows },
      { data: statsRows }
    ] = await Promise.all([
      supabase.from("visitors").select("*").order("created_at", { ascending: false }),
      supabase.from("visitor_attendance").select("visitor_id, session_date, present"),
      supabase.from("visitor_session_payments").select("visitor_id, session_date, paid_amount, expected_amount"),
      supabase.from("visitor_stats").select("visitor_id, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
    ]);

    if (visitorsError) return failure(visitorsError.message, 400);

    const mapped = (visitors ?? []).map(mapVisitorBase);
    const byId = new Map(mapped.map((v) => [String(v.id), v]));

    (attendanceRows ?? []).forEach((row: any) => {
      const visitor = byId.get(String(row.visitor_id || ""));
      if (!visitor) return;
      const dateKey = String(row.session_date || "").slice(0, 10);
      if (!dateKey) return;
      visitor.attendance[dateKey] = row.present === true;
    });

    (paymentRows ?? []).forEach((row: any) => {
      const visitor = byId.get(String(row.visitor_id || ""));
      if (!visitor) return;
      const dateKey = String(row.session_date || "").slice(0, 10);
      if (!dateKey) return;
      visitor.payments.sessions[dateKey] = {
        expected: Number(row.expected_amount) || 1000,
        paid: Number(row.paid_amount) || 0
      };
    });

    (statsRows ?? []).forEach((row: any) => {
      const visitor = byId.get(String(row.visitor_id || ""));
      if (!visitor) return;
      visitor.stats = {
        yellow: Number(row.yellow_cards) || 0,
        red: Number(row.red_cards) || 0
      };
      visitor.discipline = {
        yellowPaid: Number(row.yellow_paid_count) || 0,
        redPaid: Number(row.red_paid_count) || 0
      };
    });

    return success(mapped);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch visitors.";
    return failure(message, 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const perm = await requirePermission(request, "manage_visitors");
    if (!perm.ok || !perm.auth) return perm.response;
    const { user, supabase } = perm.auth;

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return failure("Invalid request body.", 400);
    }

    const fullName = String((body as any).name || (body as any).full_name || "").trim();
    if (!fullName) return failure("Name is required.", 400);

    const notes = String((body as any).notes || "").trim();
    const payloadWithNotes = {
      full_name: fullName,
      nickname: String((body as any).nickname || "").trim() || null,
      email: (body as any).email ? String((body as any).email).trim() : null,
      notes: notes || null
    };

    let { data, error } = await supabase.from("visitors").insert(payloadWithNotes).select("*").single();
    if (error && /column .*notes.* does not exist/i.test(error.message || "")) {
      const payloadWithoutNotes = {
        full_name: payloadWithNotes.full_name,
        nickname: payloadWithNotes.nickname,
        email: payloadWithNotes.email
      };
      const retry = await supabase.from("visitors").insert(payloadWithoutNotes).select("*").single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return failure(error.message, 400);
    }

    await supabase.from("visitor_stats").upsert(
      {
        visitor_id: data.id,
        yellow_cards: 0,
        red_cards: 0,
        yellow_paid_count: 0,
        red_paid_count: 0
      },
      { onConflict: "visitor_id" }
    );

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "visitor_added",
      message: `${actor.name || "Someone"} added visitor ${data.full_name || "Unknown"}`,
      actorUserId: user.id,
      relatedVisitorId: data.id,
      metadata: {
        action: "create_visitor",
        visitor_id: data.id,
        visitor_name: data.full_name || null
      }
    });

    return success(mapVisitorBase(data), 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create visitor.";
    return failure(message, 500);
  }
}
