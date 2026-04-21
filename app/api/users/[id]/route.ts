import { failure, success } from "../../_lib/response";
import { NextRequest } from "next/server";
import { requirePermission } from "../../_lib/permissions";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const check = await requirePermission(request, "manage_users");
    if (!check.ok || !check.auth) return check.response;
    const { supabase } = check.auth;

    const body = await request.json();
    const updatePayload: { role?: string; is_active?: boolean } = {};

    if (typeof body?.role === "string") {
      const allowedRoles = new Set(["viewer", "admin", "super_admin", "super_user"]);
      if (!allowedRoles.has(body.role)) {
        return failure("Invalid role.", 400);
      }
      updatePayload.role = body.role;
    }
    if (typeof body?.is_active === "boolean") {
      updatePayload.is_active = body.is_active;
    }

    if (!Object.keys(updatePayload).length) {
      return failure("No valid fields to update.", 400);
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", id)
      .select("id, full_name, email, role, is_active")
      .single();

    if (error) {
      return failure(error.message, 400);
    }

    return success(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update user.";
    return failure(message, 500);
  }
}
