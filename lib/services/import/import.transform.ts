import { allowedPositions, isIsoDate, toBoolean } from "./import.validate";

export function normalizePair(name: string, nickname: string) {
  const safeName = String(name || "").trim().toLowerCase();
  const safeNickname = String(nickname || "").trim().toLowerCase();
  return `${safeName}::${safeNickname}`;
}

export function normalizeMonthToDate(value: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!match) return "";
  return `${match[1]}-${match[2]}-01`;
}

export function getMonthlyExpected(schedule: Array<{ from: string; amount: number }>, monthKey: string) {
  if (!schedule.length) return 2000;
  const sorted = [...schedule].sort((a, b) => a.from.localeCompare(b.from));
  let candidate = Number(sorted[0]?.amount) || 2000;
  sorted.forEach((item) => {
    if (item.from <= monthKey) candidate = Number(item.amount) || candidate;
  });
  return candidate;
}

export function buildPlayerInsertRows(rows: any[], existing: Set<string>) {
  let skipped = 0;
  const insertRows: Array<{
    full_name: string;
    nickname: string | null;
    position: string;
    member_since_year: number;
  }> = [];

  for (const row of rows) {
    const name = String(row.name || row.full_name || "").trim();
    const nickname = String(row.nickname || "").trim();
    const position = String(row.position || "").trim();
    const memberSinceYear = Number((row as any).memberSinceYear || (row as any).member_since_year);

    if (!name || !position || !allowedPositions.has(position)) {
      skipped += 1;
      continue;
    }

    const key = normalizePair(name, nickname);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }

    existing.add(key);
    insertRows.push({
      full_name: name,
      nickname: nickname || null,
      position,
      member_since_year: Number.isFinite(memberSinceYear) ? memberSinceYear : new Date().getFullYear()
    });
  }

  return { insertRows, skipped };
}

export function buildPaymentsPayload(
  rows: any[],
  byName: Map<string, any>,
  expectations: { newMemberYearly: number; renewalYearly: number; schedule: Array<{ from: string; amount: number }> }
) {
  let updated = 0;
  const notFound: Array<{ name: string; nickname: string; yearKey: string; monthKey: string }> = [];
  const yearlyPayload: Array<{ player_id: string; year_key: number; expected_amount: number; paid_amount: number }> = [];
  const monthlyPayload: Array<{ player_id: string; month_key: string; expected_amount: number; paid_amount: number }> = [];

  for (const row of rows) {
    const name = String(row.name || row.full_name || "").trim();
    const nickname = String(row.nickname || "").trim();
    const yearKeyStr = String((row as any).yearKey || (row as any).year_key || "").trim();
    const monthKey = String((row as any).monthKey || (row as any).month_key || "").trim();
    const yearlyPaid = Number((row as any).yearlyPaid ?? (row as any).yearly_paid ?? (row as any).paidYearly);
    const monthlyPaid = Number((row as any).monthlyPaid ?? (row as any).monthly_paid ?? (row as any).paidMonthly);

    if (!/^\d{4}$/.test(yearKeyStr) || !/^\d{4}-\d{2}$/.test(monthKey)) continue;
    if (!Number.isFinite(yearlyPaid) || yearlyPaid < 0) continue;
    if (!Number.isFinite(monthlyPaid) || monthlyPaid < 0) continue;

    const player = byName.get(normalizePair(name, nickname));
    if (!player) {
      notFound.push({ name, nickname, yearKey: yearKeyStr, monthKey });
      continue;
    }

    const yearKey = Number(yearKeyStr);
    const monthDateKey = normalizeMonthToDate(monthKey);
    if (!monthDateKey) continue;

    const monthlyExpected = getMonthlyExpected(expectations.schedule, monthKey);
    const yearlyExpected =
      yearKey === Number(player.member_since_year)
        ? expectations.newMemberYearly
        : expectations.renewalYearly;

    yearlyPayload.push({
      player_id: player.id,
      year_key: yearKey,
      expected_amount: yearlyExpected,
      paid_amount: yearlyPaid
    });
    monthlyPayload.push({
      player_id: player.id,
      month_key: monthDateKey,
      expected_amount: monthlyExpected,
      paid_amount: monthlyPaid
    });

    updated += 1;
  }

  return { updated, notFound, yearlyPayload, monthlyPayload };
}

export function buildAttendancePayload(rows: any[], byPair: Map<string, any>) {
  let updated = 0;
  const notFound: Array<{ name: string; nickname: string; date: string }> = [];
  const attendancePayload: Array<{ player_id: string; session_date: string; present: boolean }> = [];

  for (const row of rows) {
    const name = String(row.name || row.full_name || "").trim();
    const nickname = String(row.nickname || "").trim();
    const date = String((row as any).date || (row as any).session_date || "").trim();
    const present = toBoolean((row as any).present ?? (row as any).status);
    if (!name || !isIsoDate(date)) continue;

    const player = byPair.get(normalizePair(name, nickname));
    if (!player?.id) {
      notFound.push({ name, nickname, date });
      continue;
    }

    attendancePayload.push({ player_id: player.id, session_date: date, present });
    updated += 1;
  }

  return { updated, notFound, attendancePayload };
}

export function buildStatsPayload(rows: any[], byPair: Map<string, any>) {
  let updated = 0;
  const notFound: Array<{ name: string; nickname: string }> = [];
  const statsPayload: Array<{
    player_id: string;
    goals: number;
    assists: number;
    yellow_cards: number;
    red_cards: number;
    yellow_paid_count: number;
    red_paid_count: number;
  }> = [];

  for (const row of rows) {
    const name = String(row.name || row.full_name || "").trim();
    const nickname = String(row.nickname || "").trim();
    if (!name) continue;

    const player = byPair.get(normalizePair(name, nickname));
    if (!player?.id) {
      notFound.push({ name, nickname });
      continue;
    }

    statsPayload.push({
      player_id: player.id,
      goals: Number((row as any).goals) || 0,
      assists: Number((row as any).assists) || 0,
      yellow_cards: Number((row as any).yellow ?? (row as any).yellow_cards) || 0,
      red_cards: Number((row as any).red ?? (row as any).red_cards) || 0,
      yellow_paid_count: Number((row as any).yellowPaid ?? (row as any).yellow_paid_count) || 0,
      red_paid_count: Number((row as any).redPaid ?? (row as any).red_paid_count) || 0
    });
    updated += 1;
  }

  return { updated, notFound, statsPayload };
}

export function buildVisitorInsertRows(rows: any[], existing: Set<string>) {
  let skipped = 0;
  const insertVisitors: Array<{ full_name: string; nickname: string | null; email: string | null }> = [];
  const visitorMeta = new Map<string, any>();

  for (const row of rows) {
    const name = String(row.name || row.full_name || "").trim();
    const nickname = String(row.nickname || "").trim();
    const email = String((row as any).email || "").trim() || null;
    if (!name) {
      skipped += 1;
      continue;
    }

    const key = normalizePair(name, nickname);
    if (existing.has(key)) {
      skipped += 1;
      continue;
    }

    insertVisitors.push({ full_name: name, nickname: nickname || null, email });
    visitorMeta.set(key, row);
    existing.add(key);
  }

  return { skipped, insertVisitors, visitorMeta };
}

export function buildVisitorStatsPayload(createdVisitors: any[], visitorMeta: Map<string, any>) {
  return createdVisitors.map((row: any) => {
    const key = normalizePair(row.full_name, row.nickname || "");
    const src = visitorMeta.get(key) || {};
    return {
      visitor_id: row.id,
      yellow_cards: Number(src.yellow ?? src.yellow_cards) || 0,
      red_cards: Number(src.red ?? src.red_cards) || 0,
      yellow_paid_count: Number(src.yellowPaid ?? src.yellow_paid_count) || 0,
      red_paid_count: Number(src.redPaid ?? src.red_paid_count) || 0
    };
  });
}

export function buildVisitorPaymentPayload(createdVisitors: any[], visitorMeta: Map<string, any>) {
  return createdVisitors
    .map((row: any) => {
      const key = normalizePair(row.full_name, row.nickname || "");
      const src = visitorMeta.get(key) || {};
      const sessionDate = String(src.session_date || src.date || "").trim();
      const sessionPaid = Number(src.paid_amount ?? src.paid ?? src.session_paid);
      const sessionExpected = Number(src.expected_amount ?? src.expected ?? src.session_expected);
      if (!isIsoDate(sessionDate) || !Number.isFinite(sessionPaid) || sessionPaid < 0) return null;
      return {
        visitor_id: row.id,
        session_date: sessionDate,
        expected_amount: Number.isFinite(sessionExpected) ? sessionExpected : 1000,
        paid_amount: sessionPaid
      };
    })
    .filter(Boolean) as Array<{
      visitor_id: string;
      session_date: string;
      expected_amount: number;
      paid_amount: number;
    }>;
}

export function buildNotesPayload(rows: any[], userId: string) {
  let created = 0;
  let skipped = 0;
  const notePayload: Array<{ body: string; pinned: boolean; tag: string | null; created_by: string }> = [];
  for (const row of rows) {
    const text = String((row as any).text || (row as any).body || "").trim();
    if (!text) {
      skipped += 1;
      continue;
    }
    notePayload.push({
      body: text,
      pinned: toBoolean((row as any).pinned),
      tag: String((row as any).tag || "").trim() || null,
      created_by: userId
    });
    created += 1;
  }
  return { created, skipped, notePayload };
}

