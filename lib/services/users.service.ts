import { NextRequest } from "next/server";
import { failure, success } from "../http/response";
import {
  AppRole,
  PermissionKey,
  ROLE_DEFAULT_PERMISSIONS,
  getAuthContext,
  requirePermission
} from "../auth/permissions";

const ALL_ROLES: AppRole[] = ["viewer", "admin", "super_admin", "super_user"];

function normalizePermissions(input: any) {
  const result: Record<PermissionKey, boolean> = {} as Record<PermissionKey, boolean>;
  const keys = Object.keys(ROLE_DEFAULT_PERMISSIONS.super_user) as PermissionKey[];
  keys.forEach((key) => {
    result[key] = Boolean(input?.[key]);
  });
  return result;
}

export async function getUsers(req: NextRequest) {
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

export async function patchUser(req: NextRequest, id: string) {
  try {
    const check = await requirePermission(req, "manage_users");
    if (!check.ok || !check.auth) return check.response;
    const { supabase } = check.auth;

    const body = await req.json();
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

export async function getRolePermissions(req: NextRequest) {
  try {
    const check = await requirePermission(req, "manage_users");
    if (!check.ok || !check.auth) return check.response;
    const { supabase } = check.auth;

    const { data: rows, error } = await supabase
      .from("role_permissions")
      .select("role, permissions");
    if (error) return failure(error.message, 400);

    const rowMap = new Map<string, any>((rows ?? []).map((r: any) => [String(r.role), r.permissions || {}]));
    const merged = ALL_ROLES.map((role) => {
      const defaults = ROLE_DEFAULT_PERMISSIONS[role];
      const overrides = rowMap.get(role) || {};
      const values = { ...defaults };
      (Object.keys(defaults) as PermissionKey[]).forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(overrides, key)) {
          values[key] = Boolean(overrides[key]);
        }
      });
      return { role, permissions: values };
    });

    return success({
      permissions: merged,
      keys: Object.keys(ROLE_DEFAULT_PERMISSIONS.super_user)
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to fetch permissions.", 500);
  }
}

export async function patchRolePermissions(req: NextRequest) {
  try {
    const check = await requirePermission(req, "manage_users");
    if (!check.ok || !check.auth) return check.response;
    const { supabase } = check.auth;

    const body = await req.json();
    const role = String(body?.role || "") as AppRole;
    if (!ALL_ROLES.includes(role)) return failure("Invalid role.", 400);
    if (role === "super_user") return failure("Super user permissions cannot be modified.", 400);

    const permissions = normalizePermissions(body?.permissions || {});
    delete (permissions as any).manage_users;
    if (role === "viewer") {
      permissions.view_reports = false;
    }
    if (role === "super_admin" || role === "admin" || role === "viewer") {
      permissions.view_reports = false;
    }
    permissions.manage_settings = false;

    const { data, error } = await supabase
      .from("role_permissions")
      .upsert(
        { role, permissions, updated_at: new Date().toISOString() },
        { onConflict: "role" }
      )
      .select("role, permissions")
      .single();

    if (error) return failure(error.message, 400);
    return success(data);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to update permissions.", 500);
  }
}

export async function getReportsAccess(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return failure("Unauthorized", 401);
    if (!auth.permissions.view_reports) return failure("Forbidden", 403);
    return success({ ok: true });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to validate reports access.", 500);
  }
}

