import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "./supabase";
import { failure } from "./response";

export type AppRole = "viewer" | "admin" | "super_admin" | "super_user";
export type PermissionKey =
  | "view_activity"
  | "view_reports"
  | "manage_players_create"
  | "manage_players_update"
  | "manage_players_delete"
  | "manage_attendance"
  | "manage_visitors"
  | "manage_stats"
  | "manage_fines"
  | "manage_payments"
  | "manage_notes"
  | "manage_settings"
  | "manage_users";

export const ROLE_DEFAULT_PERMISSIONS: Record<AppRole, Record<PermissionKey, boolean>> = {
  super_user: {
    view_activity: true,
    view_reports: true,
    manage_players_create: true,
    manage_players_update: true,
    manage_players_delete: true,
    manage_attendance: true,
    manage_visitors: true,
    manage_stats: true,
    manage_fines: true,
    manage_payments: true,
    manage_notes: true,
    manage_settings: true,
    manage_users: true
  },
  super_admin: {
    view_activity: true,
    view_reports: false,
    manage_players_create: true,
    manage_players_update: true,
    manage_players_delete: true,
    manage_attendance: true,
    manage_visitors: true,
    manage_stats: true,
    manage_fines: true,
    manage_payments: true,
    manage_notes: true,
    manage_settings: false,
    manage_users: false
  },
  admin: {
    view_activity: true,
    view_reports: false,
    manage_players_create: true,
    manage_players_update: true,
    manage_players_delete: false,
    manage_attendance: true,
    manage_visitors: true,
    manage_stats: false,
    manage_fines: false,
    manage_payments: false,
    manage_notes: true,
    manage_settings: false,
    manage_users: false
  },
  viewer: {
    view_activity: true,
    view_reports: false,
    manage_players_create: false,
    manage_players_update: false,
    manage_players_delete: false,
    manage_attendance: false,
    manage_visitors: false,
    manage_stats: false,
    manage_fines: false,
    manage_payments: false,
    manage_notes: false,
    manage_settings: false,
    manage_users: false
  }
};

export type AuthContext = {
  supabase: any;
  user: any;
  profile: {
    id: string;
    full_name: string | null;
    email: string | null;
    role: AppRole;
    is_active: boolean;
  };
  permissions: Record<PermissionKey, boolean>;
};

function extractToken(request: NextRequest) {
  return request.headers.get("authorization")?.replace("Bearer ", "") || "";
}

function coerceRole(value: unknown): AppRole {
  const role = String(value || "viewer") as AppRole;
  if (role === "super_user" || role === "super_admin" || role === "admin" || role === "viewer") {
    return role;
  }
  return "viewer";
}

export async function getAuthContext(request: NextRequest): Promise<AuthContext | null> {
  const token = extractToken(request);
  const supabase = createSupabaseServerClient(token);
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

export async function requirePermission(request: NextRequest, permission: PermissionKey) {
  const auth = await getAuthContext(request);
  if (!auth) return { ok: false as const, response: failure("Unauthorized", 401), auth: null };
  if (!auth.permissions[permission]) {
    return { ok: false as const, response: failure("Forbidden", 403), auth };
  }
  return { ok: true as const, response: null, auth };
}
