import { NextRequest } from "next/server";
import { getAttendance, postAttendance } from "../../../lib/services/attendance.service";

export async function GET(request: NextRequest) {
  return getAttendance(request);
}

export async function POST(request: NextRequest) {
  return postAttendance(request);
}
