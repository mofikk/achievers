import { NextRequest } from "next/server";
import { getOverview } from "../../../lib/services/overview.service";

export async function GET(request: NextRequest) {
  return getOverview(request);
}
