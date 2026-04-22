import { NextRequest } from "next/server";
import { failure, success } from "../../http/response";
import { getAuthContext } from "../../auth/permissions";
import { getActorContext, logActivity } from "../activity.service";

export async function patchVisitorStats(request: NextRequest, id: string) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return failure("Unauthorized", 401);
    const { user, supabase, permissions } = auth;
    const body = await request.json();
    const touchesStats = (body as any)?.yellow !== undefined || (body as any)?.red !== undefined;
    const touchesFines =
      (body as any)?.discipline?.yellowPaid !== undefined ||
      (body as any)?.discipline?.redPaid !== undefined;
    if (touchesStats && !permissions.manage_stats) return failure("Forbidden", 403);
    if (touchesFines && !permissions.manage_fines) return failure("Forbidden", 403);
    const { data: previous } = await supabase
      .from("visitor_stats")
      .select("visitor_id, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
      .eq("visitor_id", id)
      .maybeSingle();

    const payload = {
      visitor_id: id,
      yellow_cards: Number((body as any)?.yellow) || 0,
      red_cards: Number((body as any)?.red) || 0,
      yellow_paid_count: Number((body as any)?.discipline?.yellowPaid) || 0,
      red_paid_count: Number((body as any)?.discipline?.redPaid) || 0
    };

    const { data, error } = await supabase
      .from("visitor_stats")
      .upsert(payload, { onConflict: "visitor_id" })
      .select("visitor_id, yellow_cards, red_cards, yellow_paid_count, red_paid_count")
      .single();

    if (error) return failure(error.message, 400);

    const actor = await getActorContext(supabase, user.id);
    const { data: visitor } = await supabase
      .from("visitors")
      .select("full_name")
      .eq("id", id)
      .maybeSingle();
    const visitorName = visitor?.full_name || "Unknown visitor";

    const statsChanged =
      !previous ||
      Number(previous.yellow_cards) !== Number(data.yellow_cards) ||
      Number(previous.red_cards) !== Number(data.red_cards);

    const fineChanged =
      !previous ||
      Number(previous.yellow_paid_count) !== Number(data.yellow_paid_count) ||
      Number(previous.red_paid_count) !== Number(data.red_paid_count);

    if (statsChanged) {
      await logActivity(supabase, {
        type: "stats_updated",
        message: `${actor.name || "Someone"} updated stats for ${visitorName}`,
        actorUserId: user.id,
        relatedVisitorId: id,
        metadata: {
          action: "update_visitor_stats",
          visitor_id: id,
          visitor_name: visitorName
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
            ? `${actor.name || "Someone"} cleared fines for ${visitorName}`
            : `${actor.name || "Someone"} updated fines for ${visitorName}`,
        actorUserId: user.id,
        relatedVisitorId: id,
        metadata: {
          action: "update_visitor_fines",
          visitor_id: id,
          visitor_name: visitorName,
          yellow_paid_count: Number(data.yellow_paid_count) || 0,
          red_paid_count: Number(data.red_paid_count) || 0
        }
      });
    }

    return success({
      visitor_id: data.visitor_id,
      yellow: Number(data.yellow_cards) || 0,
      red: Number(data.red_cards) || 0,
      discipline: {
        yellowPaid: Number(data.yellow_paid_count) || 0,
        redPaid: Number(data.red_paid_count) || 0
      }
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to update visitor stats.", 500);
  }
}

