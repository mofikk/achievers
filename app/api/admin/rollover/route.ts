import { NextRequest } from "next/server";
import { postRollover } from "../../../../lib/services/admin.service";

export async function POST(request: NextRequest) {
  return postRollover(request);
}
