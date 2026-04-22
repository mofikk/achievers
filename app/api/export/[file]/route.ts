import { NextRequest } from "next/server";
import { exportByFile } from "../../../../lib/services/export.service";

type RouteContext = {
  params: Promise<{
    file: string;
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  const { file } = await context.params;
  return exportByFile(request, file);
}
