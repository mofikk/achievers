import { NextRequest } from "next/server";
import { failure } from "../http/response";

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

export async function getAuthContext(request: NextRequest): Promise<AuthContext | null> {
  const { resolveAuthContext } = await import("../services/auth-context.service");
  return resolveAuthContext(request);
}

export async function requirePermission(request: NextRequest, permission: PermissionKey) {
  const auth = await getAuthContext(request);
  if (!auth) return { ok: false as const, response: failure("Unauthorized", 401), auth: null };
  if (!auth.permissions[permission]) {
    return { ok: false as const, response: failure("Forbidden", 403), auth };
  }
  return { ok: true as const, response: null, auth };
}

export async function requireAuthenticatedUser(request: NextRequest) {
  const auth = await getAuthContext(request);
  return auth?.user || null;
}

