import { NextRequest } from "next/server";
import { failure, success } from "../../_lib/response";
import { requireAuthenticatedUser } from "../../_lib/auth";
import { createSupabaseServerClient } from "../../_lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (!user) return failure("Unauthorized", 401);

    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const supabase = createSupabaseServerClient(token);
    const { searchParams } = new URL(request.url);
    const date = String(searchParams.get("date") || "").trim();

    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return failure("Invalid date format. Use YYYY-MM-DD.", 400);
      const { data, error } = await supabase
        .from("session_summaries")
        .select("*")
        .eq("session_date", date)
        .maybeSingle();
      if (error) return failure(error.message, 400);
      return success(data || null);
    }

    const { data, error } = await supabase
      .from("session_summaries")
      .select("id, session_date, created_by, created_at, updated_at")
      .order("session_date", { ascending: false })
      .limit(20);
    if (error) return failure(error.message, 400);
    return success(data ?? []);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to fetch session summaries.", 500);
  }
}
