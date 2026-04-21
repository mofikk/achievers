import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const rootDir = process.cwd();
const dataDir = path.join(rootDir, "server", "data");

const ALLOWED_POSITIONS = new Set([
  "FW", "CM", "CDM", "CAM", "LM", "RM", "CB", "RB", "LB", "LW", "RW", "GK", "DF", "MF"
]);

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function readJson(fileName, fallback) {
  const fullPath = path.join(dataDir, fileName);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function asIsoOrNow(value) {
  const stamp = new Date(value || "");
  if (Number.isNaN(stamp.getTime())) return new Date().toISOString();
  return stamp.toISOString();
}

function normalizePair(name, nickname) {
  return `${String(name || "").trim().toLowerCase()}::${String(nickname || "").trim().toLowerCase()}`;
}

function normalizeMonthKey(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-01`;
}

function normalizeDateKey(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toYear(value, fallback = new Date().getFullYear()) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : fallback;
}

async function run() {
  loadEnvFromFile(path.join(rootDir, ".env.local"));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  const supabase = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const db = readJson("db.json", { players: [] });
  const notes = readJson("notes.json", []);
  const visitors = readJson("visitors.json", []);

  const players = Array.isArray(db?.players) ? db.players : [];
  const visitorsList = Array.isArray(visitors) ? visitors : [];
  const notesList = Array.isArray(notes) ? notes : [];

  const playerIdByLegacyId = new Map();
  const playerIdByPair = new Map();
  const visitorIdByLegacyId = new Map();
  const counters = {
    players: 0,
    playerStats: 0,
    playerMonthlyPayments: 0,
    playerYearlyPayments: 0,
    playerAttendance: 0,
    visitors: 0,
    visitorStats: 0,
    visitorSessionPayments: 0,
    visitorAttendance: 0,
    notes: 0
  };

  for (const row of players) {
    const fullName = String(row?.name || row?.full_name || "").trim();
    if (!fullName) continue;
    const nickname = String(row?.nickname || "").trim();
    const rawPosition = String(row?.position || "").trim().toUpperCase();
    const position = ALLOWED_POSITIONS.has(rawPosition) ? rawPosition : null;
    const memberSinceYear = toYear(row?.membership?.memberSinceYear ?? row?.member_since_year);
    const email = String(row?.email || "").trim() || null;
    const createdAt = asIsoOrNow(row?.createdAt ?? row?.created_at);

    const { data, error } = await supabase
      .from("players")
      .insert({
        full_name: fullName,
        nickname: nickname || null,
        email,
        position,
        member_since_year: memberSinceYear,
        created_at: createdAt,
        updated_at: createdAt
      })
      .select("id, full_name, nickname")
      .single();

    if (error || !data?.id) {
      console.error("Player insert failed:", fullName, error?.message || "unknown error");
      continue;
    }

    counters.players += 1;
    playerIdByLegacyId.set(String(row?.id || ""), data.id);
    playerIdByPair.set(normalizePair(data.full_name, data.nickname || ""), data.id);
  }

  for (const row of players) {
    const playerId = playerIdByLegacyId.get(String(row?.id || ""));
    if (!playerId) continue;

    const stats = row?.stats || {};
    const discipline = row?.discipline || {};
    const { error: statsError } = await supabase
      .from("player_stats")
      .upsert(
        {
          player_id: playerId,
          goals: toNumber(stats.goals),
          assists: toNumber(stats.assists),
          yellow_cards: toNumber(stats.yellow),
          red_cards: toNumber(stats.red),
          yellow_paid_count: toNumber(discipline.yellowPaid),
          red_paid_count: toNumber(discipline.redPaid)
        },
        { onConflict: "player_id" }
      );
    if (!statsError) counters.playerStats += 1;

    const monthly = row?.payments?.monthly || {};
    for (const [key, value] of Object.entries(monthly)) {
      const monthKey = normalizeMonthKey(key);
      if (!monthKey) continue;
      const expected = toNumber(value?.expected);
      const paid = toNumber(value?.paid);
      const { error } = await supabase
        .from("player_monthly_payments")
        .upsert(
          {
            player_id: playerId,
            month_key: monthKey,
            expected_amount: expected,
            paid_amount: paid
          },
          { onConflict: "player_id,month_key" }
        );
      if (!error) counters.playerMonthlyPayments += 1;
    }

    const yearly = row?.payments?.yearly || {};
    for (const [key, value] of Object.entries(yearly)) {
      const yearKey = toYear(key, 0);
      if (!yearKey) continue;
      const expected = toNumber(value?.expected);
      const paid = toNumber(value?.paid);
      const { error } = await supabase
        .from("player_yearly_payments")
        .upsert(
          {
            player_id: playerId,
            year_key: yearKey,
            expected_amount: expected,
            paid_amount: paid
          },
          { onConflict: "player_id,year_key" }
        );
      if (!error) counters.playerYearlyPayments += 1;
    }

    const attendance = row?.attendance || {};
    for (const [dateKey, present] of Object.entries(attendance)) {
      const sessionDate = normalizeDateKey(dateKey);
      if (!sessionDate) continue;
      const { error } = await supabase
        .from("player_attendance")
        .upsert(
          {
            player_id: playerId,
            session_date: sessionDate,
            present: Boolean(present)
          },
          { onConflict: "player_id,session_date" }
        );
      if (!error) counters.playerAttendance += 1;
    }
  }

  for (const row of visitorsList) {
    const fullName = String(row?.name || row?.full_name || "").trim();
    if (!fullName) continue;
    const nickname = String(row?.nickname || "").trim();
    const email = String(row?.email || "").trim() || null;
    const createdAt = asIsoOrNow(row?.createdAt ?? row?.created_at);

    const { data, error } = await supabase
      .from("visitors")
      .insert({
        full_name: fullName,
        nickname: nickname || null,
        email,
        created_at: createdAt,
        updated_at: createdAt
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      console.error("Visitor insert failed:", fullName, error?.message || "unknown error");
      continue;
    }

    counters.visitors += 1;
    visitorIdByLegacyId.set(String(row?.id || ""), data.id);
  }

  for (const row of visitorsList) {
    const visitorId = visitorIdByLegacyId.get(String(row?.id || ""));
    if (!visitorId) continue;

    const stats = row?.stats || {};
    const discipline = row?.discipline || {};
    const { error: statsError } = await supabase
      .from("visitor_stats")
      .upsert(
        {
          visitor_id: visitorId,
          yellow_cards: toNumber(stats.yellow),
          red_cards: toNumber(stats.red),
          yellow_paid_count: toNumber(discipline.yellowPaid),
          red_paid_count: toNumber(discipline.redPaid)
        },
        { onConflict: "visitor_id" }
      );
    if (!statsError) counters.visitorStats += 1;

    const sessionPayments = row?.payments?.sessions || {};
    for (const [dateKey, value] of Object.entries(sessionPayments)) {
      const sessionDate = normalizeDateKey(dateKey);
      if (!sessionDate) continue;
      const expected = toNumber(value?.expected);
      const paid = toNumber(value?.paid);
      const { error } = await supabase
        .from("visitor_session_payments")
        .upsert(
          {
            visitor_id: visitorId,
            session_date: sessionDate,
            expected_amount: expected,
            paid_amount: paid
          },
          { onConflict: "visitor_id,session_date" }
        );
      if (!error) counters.visitorSessionPayments += 1;
    }

    const attendance = row?.attendance || {};
    for (const [dateKey, present] of Object.entries(attendance)) {
      const sessionDate = normalizeDateKey(dateKey);
      if (!sessionDate) continue;
      const { error } = await supabase
        .from("visitor_attendance")
        .upsert(
          {
            visitor_id: visitorId,
            session_date: sessionDate,
            present: Boolean(present)
          },
          { onConflict: "visitor_id,session_date" }
        );
      if (!error) counters.visitorAttendance += 1;
    }
  }

  for (const row of notesList) {
    const body = String(row?.text || row?.body || "").trim();
    if (!body) continue;
    const createdAt = asIsoOrNow(row?.createdAt ?? row?.created_at);
    const updatedAt = asIsoOrNow(row?.updatedAt ?? row?.updated_at ?? createdAt);
    const { error } = await supabase.from("notes").insert({
      body,
      pinned: Boolean(row?.pinned),
      tag: String(row?.tag || "").trim() || null,
      created_by: null,
      created_at: createdAt,
      updated_at: updatedAt
    });
    if (!error) counters.notes += 1;
  }

  console.log("Migration complete.");
  console.table(counters);
}

run().catch((error) => {
  console.error("Migration failed:", error?.message || error);
  process.exitCode = 1;
});
