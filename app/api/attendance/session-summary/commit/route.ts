import { NextRequest } from "next/server";
import { commitSessionSummary } from "../../../../../lib/services/session-summary.service";

export async function POST(request: NextRequest) {
  return commitSessionSummary(request);
}
