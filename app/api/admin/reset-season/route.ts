import { NextRequest } from "next/server";
import { postResetSeason } from "../../../../lib/services/admin.service";

export async function POST(request: NextRequest) {
  return postResetSeason(request);
}
