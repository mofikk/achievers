import { NextRequest } from "next/server";
import { createVisitor, getVisitors } from "@/lib/services/visitors";

export async function GET(request: NextRequest) {
  return getVisitors(request);
}

export async function POST(request: NextRequest) {
  return createVisitor(request);
}
