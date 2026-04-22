import { NextRequest } from "next/server";
import { getDataHealth } from "../../../../lib/services/admin.service";

export async function GET(request: NextRequest) {
  return getDataHealth(request);
}
