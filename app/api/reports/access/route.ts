import { NextRequest } from "next/server";
import { failure, success } from "../../_lib/response";
import { getAuthContext } from "../../_lib/permissions";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return failure("Unauthorized", 401);
    if (!auth.permissions.view_reports) return failure("Forbidden", 403);
    return success({ ok: true });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to validate reports access.", 500);
  }
}
