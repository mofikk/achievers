import { NextRequest } from "next/server";
import { failure, success } from "../_lib/response";
import { requirePermission } from "../_lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const check = await requirePermission(req, "manage_users");
    if (!check.ok || !check.auth) return check.response;
    const { supabase } = check.auth;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, role, is_active");

    if (error) {
      return failure(error.message, 400);
    }

    return success(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch users.";
    return failure(message, 500);
  }
}
