import { NextRequest } from "next/server";
import { reviewSessionSummary } from "../../../../../lib/services/session-summary.service";

export async function POST(request: NextRequest) {
  return reviewSessionSummary(request);
}
