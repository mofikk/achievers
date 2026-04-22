import { NextRequest } from "next/server";
import { createServerClient } from "../supabase/server";
import { getTokenFromRequest } from "../auth/getToken";
import { ROLE_DEFAULT_PERMISSIONS } from "../auth/permissions";
import type { AppRole, PermissionKey, AuthContext } from "../auth/permissions";

function coerceRole(value: unknown): AppRole {
  const role = String(value || "viewer") as AppRole;
  if (role === "super_user" || role === "super_admin" || role === "admin" || role === "viewer") {
    return role;
  }
  return "viewer";
}

export async function resolveAuthContext(request: NextRequest): Promise<AuthContext | null> {
  const token = getTokenFromRequest(request);
  const supabase = createServerClient(token || undefined);
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return null;
  }

  const effectiveProfile = profile
    ? profile
    : {
        id: user.id,
        full_name: (user.user_metadata?.full_name as string) || null,
        email: user.email || null,
        role: "viewer",
        is_active: true
      };

  if (effectiveProfile.is_active === false) return null;

  const role = coerceRole(effectiveProfile.role);
  const defaults = ROLE_DEFAULT_PERMISSIONS[role];

  const { data: rolePermissionRow } = await supabase
    .from("role_permissions")
    .select("permissions")
    .eq("role", role)
    .maybeSingle();

  const overrides = rolePermissionRow?.permissions && typeof rolePermissionRow.permissions === "object"
    ? rolePermissionRow.permissions
    : {};

  const merged: Record<PermissionKey, boolean> = { ...defaults };
  (Object.keys(defaults) as PermissionKey[]).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(overrides, key)) {
      merged[key] = Boolean((overrides as any)[key]);
    }
  });

  return {
    supabase,
    user,
    profile: {
      id: String(effectiveProfile.id),
      full_name: effectiveProfile.full_name ?? null,
      email: effectiveProfile.email ?? user.email ?? null,
      role,
      is_active: effectiveProfile.is_active !== false
    },
    permissions: merged
  };
}
