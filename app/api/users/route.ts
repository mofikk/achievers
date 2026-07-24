import { NextRequest } from "next/server";
import { createUser, getUsers } from "../../../lib/services/users.service";

export async function GET(req: NextRequest) {
  return getUsers(req);
}

export async function POST(req: NextRequest) {
  return createUser(req);
}
