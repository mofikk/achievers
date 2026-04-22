import { NextRequest } from "next/server";
import { createPlayer, getPlayers } from "../../../lib/services/players.service";

export async function GET(req: NextRequest) {
  return getPlayers(req);
}

export async function POST(req: NextRequest) {
  return createPlayer(req);
}