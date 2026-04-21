import { NextRequest } from "next/server";
import { failure, success } from "../../../_lib/response";
import { requirePermission } from "../../../_lib/permissions";
import { buildReview } from "../../../_lib/session-summary";

export async function POST(request: NextRequest) {
  try {
    const check = await requirePermission(request, "manage_attendance");
    if (!check.ok || !check.auth) return check.response;
    const { supabase } = check.auth;

    const body = await request.json();
    const rawText = String(body?.raw_text || body?.rawText || "").trim();
    if (!rawText) return failure("raw_text is required.", 400);

    const [{ data: players }, { data: visitors }] = await Promise.all([
      supabase.from("players").select("id, full_name, nickname"),
      supabase.from("visitors").select("id, full_name, nickname")
    ]);

    const playerRows = (players ?? []).map((row: any) => ({
      id: row.id,
      name: row.full_name,
      nickname: row.nickname
    }));
    const visitorRows = (visitors ?? []).map((row: any) => ({
      id: row.id,
      name: row.full_name,
      nickname: row.nickname
    }));

    const review = buildReview(rawText, playerRows, visitorRows);
    return success(review);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to review summary text.", 500);
  }
}
