import { NextRequest } from "next/server";
import { failure, success } from "../http/response";
import { getAuthContext } from "../auth/permissions";

const ALLOWED_SNAPSHOT_TYPES = new Set(["player_index"]);

function normalizeSnapshotType(value: unknown) {
  const snapshotType = String(value || "").trim();
  return ALLOWED_SNAPSHOT_TYPES.has(snapshotType) ? snapshotType : "";
}

function normalizeRankingKey(value: unknown) {
  return String(value || "").trim().slice(0, 80);
}

function normalizeRankings(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const keys = ["overall", "performance", "contribution", "attendance"];
  const rankings = keys.reduce<Record<string, string[]>>((next, key) => {
    const rows = Array.isArray(source[key]) ? source[key] : [];
    next[key] = rows.map((id) => String(id || "").trim()).filter(Boolean);
    return next;
  }, {});
  return rankings;
}

export async function getRankingSnapshot(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return failure("Unauthorized", 401);

    const { searchParams } = new URL(request.url);
    const snapshotType = normalizeSnapshotType(searchParams.get("type"));
    const rankingKey = normalizeRankingKey(searchParams.get("key") || "default");
    if (!snapshotType || !rankingKey) return failure("Invalid snapshot request.", 400);

    const { data, error } = await auth.supabase
      .from("ranking_snapshots")
      .select("id, snapshot_type, ranking_key, rankings, created_at, created_by")
      .eq("snapshot_type", snapshotType)
      .eq("ranking_key", rankingKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return failure(error.message, 400);
    return success(data || null);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to load ranking snapshot.", 500);
  }
}

export async function createRankingSnapshot(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return failure("Unauthorized", 401);

    const body = await request.json();
    const snapshotType = normalizeSnapshotType(body?.snapshot_type || body?.snapshotType);
    const rankingKey = normalizeRankingKey(body?.ranking_key || body?.rankingKey || "default");
    const rankings = normalizeRankings(body?.rankings);
    if (!snapshotType || !rankingKey || !rankings) return failure("Invalid snapshot payload.", 400);

    const { data, error } = await auth.supabase
      .from("ranking_snapshots")
      .insert({
        snapshot_type: snapshotType,
        ranking_key: rankingKey,
        rankings,
        created_by: auth.user.id
      })
      .select("id, snapshot_type, ranking_key, rankings, created_at, created_by")
      .single();

    if (error) return failure(error.message, 400);
    return success(data, 201);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to save ranking snapshot.", 500);
  }
}

