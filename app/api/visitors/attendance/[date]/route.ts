import { NextRequest } from "next/server";
import { failure } from "../../../../../lib/http/response";
import { patchVisitorAttendanceByDate } from "@/lib/services/visitors";
import { validateDate } from "../../../../../lib/validation/params";

type RouteContext = {
  params: Promise<{
    date: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { date } = await context.params;
  if (!validateDate(date).ok) return failure("Invalid date format. Use YYYY-MM-DD.", 400);
  return patchVisitorAttendanceByDate(request, date);
}

