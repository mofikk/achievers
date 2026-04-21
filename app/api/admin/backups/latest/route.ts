import { NextRequest } from "next/server";
import { requireAuthenticatedUser } from "../../../_lib/auth";
import { failure } from "../../../_lib/response";
import { createSupabaseServerClient } from "../../../_lib/supabase";
import { getLatestBackup } from "../../../_lib/backups";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    if (!user) return failure("Unauthorized", 401);

    const token = request.headers.get("authorization")?.replace("Bearer ", "");
    const supabase = createSupabaseServerClient(token);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) return failure(profileError.message, 400);
    if (profile?.role !== "super_user") return failure("Forbidden", 403);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") === "settings" ? "settings" : "db";
    const latest = await getLatestBackup(type);
    if (!latest) return failure("No backups found", 404);

    const raw = await (await import("node:fs/promises")).readFile(latest.fullPath, "utf8");
    return new Response(raw, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${latest.name}"`,
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to fetch backup.", 500);
  }
}
