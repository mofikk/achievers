import { NextRequest } from "next/server";
import { getSessionSummaries } from "../../../../lib/services/session-summary.service";

export async function GET(request: NextRequest) {
  return getSessionSummaries(request);
}
