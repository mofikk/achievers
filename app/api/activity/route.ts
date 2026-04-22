import { NextRequest } from "next/server";
import { getActivity } from "../../../lib/services/activity.service";

export async function GET(request: NextRequest) {
  return getActivity(request);
}
