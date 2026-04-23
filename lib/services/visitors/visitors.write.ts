import { NextRequest } from "next/server";
import { failure, success } from "../../http/response";
import { getActorContext, logActivity } from "../activity.service";
import { requirePermission } from "../../auth/permissions";
import { mapVisitorBase } from "./visitors.shared";

export async function createVisitor(request: NextRequest) {
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

    let { data, error } = await supabase
      .from("visitors")
      .insert(payloadWithNotes)
      .select("id, full_name, nickname, email, notes, created_at")
      .single();
    if (error && /column .*notes.* does not exist/i.test(error.message || "")) {
      const payloadWithoutNotes = {
        full_name: payloadWithNotes.full_name,
        nickname: payloadWithNotes.nickname,
        email: payloadWithNotes.email
      };
      const retry = await supabase
        .from("visitors")
        .insert(payloadWithoutNotes)
        .select("id, full_name, nickname, email, created_at")
        .single();
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

export async function patchVisitor(request: NextRequest, id: string) {
  try {
    const perm = await requirePermission(request, "manage_visitors");
    if (!perm.ok || !perm.auth) return perm.response;
    const { user, supabase } = perm.auth;

    const body = await request.json();
    if (!body || typeof body !== "object") {
      return failure("Invalid request body.", 400);
    }

    const patchPayload: Record<string, unknown> = {};
    const fullName = (body as any).full_name ?? (body as any).name;
    if (fullName !== undefined) patchPayload.full_name = String(fullName || "").trim();
    if ((body as any).nickname !== undefined) patchPayload.nickname = (body as any).nickname ? String((body as any).nickname).trim() : null;
    if ((body as any).email !== undefined) patchPayload.email = (body as any).email ? String((body as any).email).trim() : null;
    if ((body as any).notes !== undefined) patchPayload.notes = (body as any).notes ? String((body as any).notes).trim() : null;

    let { data, error } = await supabase
      .from("visitors")
      .update(patchPayload)
      .eq("id", id)
      .select("id, full_name, nickname, email, notes, created_at")
      .single();

    if (error && /column .*notes.* does not exist/i.test(error.message || "")) {
      const fallbackPayload = { ...patchPayload };
      delete fallbackPayload.notes;
      const retry = await supabase
        .from("visitors")
        .update(fallbackPayload)
        .eq("id", id)
        .select("id, full_name, nickname, email, created_at")
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return failure(error.message, 400);
    }

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "visitor_updated",
      message: `${actor.name || "Someone"} updated visitor ${data.full_name || "Unknown"}`,
      actorUserId: user.id,
      relatedVisitorId: id,
      metadata: {
        action: "update_visitor",
        visitor_id: id,
        visitor_name: data.full_name || null
      }
    });

    return success(mapVisitorBase(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update visitor.";
    return failure(message, 500);
  }
}

export async function deleteVisitor(request: NextRequest, id: string) {
  try {
    const perm = await requirePermission(request, "manage_visitors");
    if (!perm.ok || !perm.auth) return perm.response;
    const { user, supabase } = perm.auth;

    const { data: visitorBeforeDelete } = await supabase
      .from("visitors")
      .select("full_name")
      .eq("id", id)
      .maybeSingle();

    await Promise.all([
      supabase.from("visitor_attendance").delete().eq("visitor_id", id),
      supabase.from("visitor_session_payments").delete().eq("visitor_id", id),
      supabase.from("visitor_stats").delete().eq("visitor_id", id)
    ]);

    const { error } = await supabase.from("visitors").delete().eq("id", id);
    if (error) {
      return failure(error.message, 400);
    }

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "visitor_updated",
      message: `${actor.name || "Someone"} deleted visitor ${visitorBeforeDelete?.full_name || "Unknown"}`,
      actorUserId: user.id,
      metadata: {
        action: "delete_visitor",
        visitor_id: id,
        visitor_name: visitorBeforeDelete?.full_name || null
      }
    });

    return success({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete visitor.";
    return failure(message, 500);
  }
}

export async function patchVisitorPayments(request: NextRequest, id: string) {
  try {
    const check = await requirePermission(request, "manage_payments");
    if (!check.ok || !check.auth) return check.response;
    const { supabase, user } = check.auth;
    const body = await request.json();
    const sessionDate = String(body?.sessionDate || "").trim();
    const paid = Number(body?.paid);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
      return failure("Session date must be YYYY-MM-DD.", 400);
    }
    if (!Number.isFinite(paid) || paid < 0) {
      return failure("Paid amount must be non-negative.", 400);
    }

    const { data: previous } = await supabase
      .from("visitor_session_payments")
      .select("paid_amount, expected_amount, session_date")
      .eq("visitor_id", id)
      .eq("session_date", sessionDate)
      .maybeSingle();

    const { data: appSettings } = await supabase
      .from("app_settings")
      .select("id, visitor_session_fee")
      .eq("id", true)
      .maybeSingle();
    const visitorSessionFee = Number(appSettings?.visitor_session_fee) || 1000;

    const payload = {
      visitor_id: id,
      session_date: sessionDate,
      expected_amount: visitorSessionFee,
      paid_amount: paid
    };

    const { data: updated, error: updateError } = await supabase
      .from("visitor_session_payments")
      .upsert(payload, { onConflict: "visitor_id,session_date" })
      .select("id, visitor_id, session_date, expected_amount, paid_amount, created_at, updated_at")
      .single();

    if (updateError) return failure(updateError.message, 400);

    const previousPaid = Number(previous?.paid_amount ?? 0);
    const nextPaid = Number(updated?.paid_amount ?? 0);
    if (previousPaid !== nextPaid) {
      const [{ data: visitor }, actor] = await Promise.all([
        supabase.from("visitors").select("full_name").eq("id", id).maybeSingle(),
        getActorContext(supabase, user.id)
      ]);
      await logActivity(supabase, {
        type: "visitor_updated",
        message: `${actor.name || "Someone"} updated visitor payment for ${visitor?.full_name || "Unknown visitor"} (${sessionDate})`,
        actorUserId: user.id,
        relatedVisitorId: id,
        metadata: {
          action: "update_visitor_payment",
          visitor_id: id,
          visitor_name: visitor?.full_name || null,
          session_date: sessionDate,
          previous_paid_amount: previous?.paid_amount ?? null,
          paid_amount: nextPaid,
          expected_amount: Number(updated?.expected_amount ?? visitorSessionFee)
        }
      });
    }

    return success({
      id: updated.id,
      visitor_id: updated.visitor_id,
      sessionDate: String(updated.session_date || "").slice(0, 10),
      expected: Number(updated.expected_amount) || visitorSessionFee,
      paid: Number(updated.paid_amount) || 0
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to update visitor payments.", 500);
  }
}

export async function promoteVisitor(request: NextRequest, id: string) {
  try {
    const check = await requirePermission(request, "manage_players_create");
    if (!check.ok || !check.auth) return check.response;
    const { user, supabase } = check.auth;

    const body = await request.json().catch(() => ({}));
    const position = String((body as any)?.position || "").trim();
    if (!position) {
      return failure("Position is required.", 400);
    }

    const { data: visitor, error: visitorError } = await supabase
      .from("visitors")
      .select("id, full_name, nickname, email, created_at")
      .eq("id", id)
      .single();

    if (visitorError || !visitor) {
      return failure(visitorError?.message || "Visitor not found.", 404);
    }

    const playerPayload = {
      full_name: visitor.full_name,
      nickname: visitor.nickname || null,
      email: visitor.email || null,
      position,
      member_since_year: new Date().getFullYear()
    };

    const { data: player, error: insertError } = await supabase
      .from("players")
      .insert(playerPayload)
      .select("id, full_name, nickname, email, position, member_since_year, created_at")
      .single();

    if (insertError) {
      return failure(insertError.message, 400);
    }

    await supabase.from("player_stats").upsert(
      {
        player_id: player.id,
        goals: 0,
        assists: 0,
        yellow_cards: 0,
        red_cards: 0,
        yellow_paid_count: 0,
        red_paid_count: 0
      },
      { onConflict: "player_id" }
    );

    await Promise.all([
      supabase.from("visitor_attendance").delete().eq("visitor_id", id),
      supabase.from("visitor_session_payments").delete().eq("visitor_id", id),
      supabase.from("visitor_stats").delete().eq("visitor_id", id)
    ]);

    const { error: deleteError } = await supabase.from("visitors").delete().eq("id", id);
    if (deleteError) {
      return failure(deleteError.message, 400);
    }

    const actor = await getActorContext(supabase, user.id);
    await logActivity(supabase, {
      type: "visitor_promoted",
      message: `${actor.name || "Someone"} promoted visitor ${visitor.full_name || "Unknown"} to player`,
      actorUserId: user.id,
      relatedPlayerId: player.id,
      metadata: {
        action: "promote_visitor",
        visitor_id: id,
        visitor_name: visitor.full_name || null,
        player_id: player.id,
        player_name: player.full_name || null
      }
    });

    return success(player, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to promote visitor.";
    return failure(message, 500);
  }
}
