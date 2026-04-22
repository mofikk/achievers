import { NextRequest } from "next/server";
import { getLatestBackupFile } from "../../../../../lib/services/admin.service";

export async function GET(request: NextRequest) {
  return getLatestBackupFile(request);
}
