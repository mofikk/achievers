import { NextRequest } from "next/server";
import { failure, success } from "../_lib/response";
import { getAuthContext } from "../_lib/permissions";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return failure("Unauthorized", 401);

    return success({
      id: auth.profile.id,
      email: auth.profile.email || "",
      full_name: auth.profile.full_name || "",
      role: auth.profile.role,
      is_active: auth.profile.is_active,
      permissions: auth.permissions
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to fetch current user.", 500);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return failure("Unauthorized", 401);
    const { supabase, user, profile, permissions } = auth;

    const body = await req.json();
    const fullName = String(body?.full_name || "").trim();
    if (!fullName) {
      return failure("full_name is required.", 400);
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({ full_name: fullName })
      .eq("id", profile.id)
      .select("id, full_name, email, role, is_active")
      .single();

    if (error) {
      return failure(error?.message || "Failed to update profile.", 400);
    }

    return success({
      ...data,
      email: user.email || data.email || "",
      permissions
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to update profile.", 500);
  }
}
