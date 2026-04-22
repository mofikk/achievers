import { NextRequest } from "next/server";
import { getRolePermissions, patchRolePermissions } from "../../../lib/services/users.service";

export async function GET(request: NextRequest) {
  return getRolePermissions(request);
}

export async function PATCH(request: NextRequest) {
  return patchRolePermissions(request);
}
