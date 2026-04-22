import { NextRequest } from "next/server";
import { getUsers } from "../../../lib/services/users.service";

export async function GET(req: NextRequest) {
  return getUsers(req);
}
