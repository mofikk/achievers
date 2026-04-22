import { NextRequest } from "next/server";
import { importByType } from "@/lib/services/import";

type RouteContext = {
  params: Promise<{
    type: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { type } = await context.params;
  return importByType(request, type);
}

