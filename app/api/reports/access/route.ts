import { NextRequest } from "next/server";
import { getReportsAccess } from "../../../../lib/services/users.service";

export async function GET(request: NextRequest) {
  return getReportsAccess(request);
}
