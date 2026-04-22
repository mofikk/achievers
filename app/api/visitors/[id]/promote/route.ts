import { NextRequest } from "next/server";
import { failure } from "../../../../../lib/http/response";
import { promoteVisitor } from "@/lib/services/visitors";
import { validateId } from "../../../../../lib/validation/params";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!validateId(id).ok) return failure("Invalid ID", 400);
  return promoteVisitor(request, id);
}

