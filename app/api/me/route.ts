import { NextRequest } from "next/server";
import { getMe, patchMe } from "../../../lib/services/me.service";

export async function GET(req: NextRequest) {
  return getMe(req);
}

export async function PATCH(req: NextRequest) {
  return patchMe(req);
}
