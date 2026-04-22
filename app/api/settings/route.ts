import { NextRequest } from "next/server";
import { getSettings, patchSettings } from "../../../lib/services/settings.service";

export async function GET(request: NextRequest) {
  return getSettings(request);
}

export async function PATCH(request: NextRequest) {
  return patchSettings(request);
}
