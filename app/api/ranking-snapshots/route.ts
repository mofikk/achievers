import { NextRequest } from "next/server";
import { createRankingSnapshot, getRankingSnapshot } from "../../../lib/services/ranking-snapshots.service";

export async function GET(request: NextRequest) {
  return getRankingSnapshot(request);
}

export async function POST(request: NextRequest) {
  return createRankingSnapshot(request);
}
