type PersonRef = {
  id: string;
  name: string;
  nickname: string;
};

type MatchResult = {
  status: "matched" | "unmatched";
  confidence: number;
  personId: string | null;
  personName: string | null;
  sourceName: string;
};

export type ReviewRow = {
  source_name: string;
  normalized_name: string;
  resolved_type: "player" | "visitor";
  resolved_id: string | null;
  resolved_name: string;
  confidence: number;
  auto_added?: boolean;
};

export type ReviewGoalRow = {
  source_name: string;
  normalized_name: string;
  goals: number;
  resolved_id: string | null;
  resolved_name: string | null;
  confidence: number;
  status: "ok" | "needs_review";
};

export type ReviewCardRow = {
  source_name: string;
  normalized_name: string;
  card_type: "yellow" | "red";
  count: number;
  paid_count: number;
  resolved_type: "player" | "visitor";
  resolved_id: string | null;
  resolved_name: string;
  confidence: number;
};

export type ReviewResult = {
  parsed_date: string | null;
  attendance: ReviewRow[];
  goals: ReviewGoalRow[];
  cards: ReviewCardRow[];
  visitors_to_create: Array<{ source_name: string; normalized_name: string }>;
  warnings: string[];
  can_commit: boolean;
};

function normalizeName(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\.\,\(\)\[\]\{\}\-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildRef(rows: any[], kind: "players" | "visitors"): PersonRef[] {
  if (kind === "players") {
    return (rows ?? []).map((row: any) => ({
      id: String(row.id),
      name: String(row.name || "").trim(),
      nickname: String(row.nickname || "").trim()
    }));
  }
  return (rows ?? []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name || "").trim(),
    nickname: String(row.nickname || "").trim()
  }));
}

function diceCoefficient(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aBigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const pair = a.slice(i, i + 2);
    aBigrams.set(pair, (aBigrams.get(pair) || 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const pair = b.slice(i, i + 2);
    const count = aBigrams.get(pair) || 0;
    if (count > 0) {
      aBigrams.set(pair, count - 1);
      overlap += 1;
    }
  }
  return (2 * overlap) / (a.length + b.length - 2);
}

function matchPerson(sourceName: string, people: PersonRef[]): MatchResult {
  const sourceNorm = normalizeName(sourceName);
  if (!sourceNorm) {
    return {
      status: "unmatched",
      confidence: 0,
      personId: null,
      personName: null,
      sourceName
    };
  }

  let best: { person: PersonRef | null; confidence: number } = { person: null, confidence: 0 };

  for (const person of people) {
    const nameNorm = normalizeName(person.name);
    const nickNorm = normalizeName(person.nickname);
    let confidence = 0;

    if (sourceNorm === nameNorm || (nickNorm && sourceNorm === nickNorm)) {
      confidence = 1;
    } else if (nameNorm && (sourceNorm.includes(nameNorm) || nameNorm.includes(sourceNorm))) {
      confidence = 0.94;
    } else if (nickNorm && (sourceNorm.includes(nickNorm) || nickNorm.includes(sourceNorm))) {
      confidence = 0.93;
    } else {
      const byName = diceCoefficient(sourceNorm, nameNorm);
      const byNick = nickNorm ? diceCoefficient(sourceNorm, nickNorm) : 0;
      confidence = Math.max(byName, byNick);
    }

    if (confidence > best.confidence) {
      best = { person, confidence };
    }
  }

  if (!best.person || best.confidence < 0.9) {
    return {
      status: "unmatched",
      confidence: best.confidence || 0,
      personId: null,
      personName: null,
      sourceName
    };
  }

  return {
    status: "matched",
    confidence: best.confidence,
    personId: best.person.id,
    personName: best.person.name || best.person.nickname || sourceName,
    sourceName
  };
}

function parsePossibleDate(line: string) {
  const text = line.trim().toLowerCase();
  const direct = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (direct) return direct[1];
  const monthMap: Record<string, string> = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12"
  };
  const match = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\b/);
  if (!match) return null;
  const day = String(Number(match[1])).padStart(2, "0");
  const month = monthMap[match[2]];
  if (!month) return null;
  const year = new Date().getFullYear();
  return `${year}-${month}-${day}`;
}

function cleanListLine(line: string) {
  return String(line || "")
    .replace(/^\s*\d+\s*[\.\)\-:]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCount(value: string, fallback = 1) {
  const match = value.match(/x\s*(\d+)/i);
  if (!match) return fallback;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNameAndCount(raw: string) {
  const count = parseCount(raw, 1);
  const name = raw.replace(/x\s*\d+/gi, "").trim();
  return { name, count };
}

export function buildReview(rawText: string, playersData: any[], visitorsData: any[]): ReviewResult {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const players = buildRef(playersData, "players");
  const visitors = buildRef(visitorsData, "visitors");
  const warnings: string[] = [];
  let parsedDate: string | null = null;
  let section: "attendance" | "cards" | "goals" = "attendance";

  const attendanceNames: string[] = [];
  const goalsRaw: Array<{ name: string; goals: number }> = [];
  const cardsRaw: Array<{ name: string; cardType: "yellow" | "red"; count: number; paid: boolean }> = [];

  for (const line of lines) {
    if (!parsedDate) {
      parsedDate = parsePossibleDate(line);
    }
    const lower = line.toLowerCase();
    if (lower.includes("yellow card") || lower === "cards" || lower === "card") {
      section = "cards";
      continue;
    }
    if (lower.includes("goals") || lower === "goal") {
      section = "goals";
      continue;
    }
    if (lower.includes("attendance")) {
      section = "attendance";
      continue;
    }

    const cleaned = cleanListLine(line);
    if (!cleaned) continue;

    if (section === "attendance") {
      attendanceNames.push(cleaned);
      continue;
    }

    if (section === "goals") {
      const parsed = parseNameAndCount(cleaned);
      if (!parsed.name) continue;
      goalsRaw.push({ name: parsed.name, goals: parsed.count });
      continue;
    }

    const explicitRed = /\bred\b/i.test(cleaned);
    const explicitPaid = /\bpaid\b/i.test(cleaned);
    const stripped = cleaned.replace(/\(.*?(red|paid).*?\)/gi, "").trim();
    const parsed = parseNameAndCount(stripped);
    if (!parsed.name) continue;
    cardsRaw.push({
      name: parsed.name,
      cardType: explicitRed ? "red" : "yellow",
      count: parsed.count,
      paid: explicitPaid
    });
  }

  const dedupeKey = new Set<string>();
  const attendanceRows: ReviewRow[] = [];
  const attendancePlayerIds = new Set<string>();
  const visitorsToCreate = new Set<string>();

  for (const rawName of attendanceNames) {
    const normalized = normalizeName(rawName);
    if (!normalized || dedupeKey.has(`a:${normalized}`)) continue;
    dedupeKey.add(`a:${normalized}`);
    const playerMatch = matchPerson(rawName, players);
    if (playerMatch.status === "matched" && playerMatch.personId) {
      attendancePlayerIds.add(playerMatch.personId);
      attendanceRows.push({
        source_name: rawName,
        normalized_name: normalized,
        resolved_type: "player",
        resolved_id: playerMatch.personId,
        resolved_name: playerMatch.personName || rawName,
        confidence: playerMatch.confidence
      });
    } else {
      attendanceRows.push({
        source_name: rawName,
        normalized_name: normalized,
        resolved_type: "visitor",
        resolved_id: null,
        resolved_name: titleCase(rawName),
        confidence: playerMatch.confidence
      });
      visitorsToCreate.add(normalized);
      warnings.push(`"${rawName}" is not a player match and will be ignored for attendance.`);
    }
  }

  const goalsMerged = new Map<string, { sourceName: string; goals: number }>();
  for (const row of goalsRaw) {
    const norm = normalizeName(row.name);
    if (!norm) continue;
    const existing = goalsMerged.get(norm);
    if (existing) {
      existing.goals += row.goals;
    } else {
      goalsMerged.set(norm, { sourceName: row.name, goals: row.goals });
    }
  }

  const goalsRows: ReviewGoalRow[] = [];
  for (const [norm, row] of goalsMerged.entries()) {
    const playerMatch = matchPerson(row.sourceName, players);
    if (playerMatch.status !== "matched" || !playerMatch.personId) {
      warnings.push(`Goal scorer "${row.sourceName}" could not be matched to a player.`);
      goalsRows.push({
        source_name: row.sourceName,
        normalized_name: norm,
        goals: row.goals,
        resolved_id: null,
        resolved_name: null,
        confidence: playerMatch.confidence,
        status: "needs_review"
      });
      continue;
    }
    goalsRows.push({
      source_name: row.sourceName,
      normalized_name: norm,
      goals: row.goals,
      resolved_id: playerMatch.personId,
      resolved_name: playerMatch.personName,
      confidence: playerMatch.confidence,
      status: "ok"
    });
    if (!attendancePlayerIds.has(playerMatch.personId)) {
      attendancePlayerIds.add(playerMatch.personId);
      attendanceRows.push({
        source_name: row.sourceName,
        normalized_name: norm,
        resolved_type: "player",
        resolved_id: playerMatch.personId,
        resolved_name: playerMatch.personName || row.sourceName,
        confidence: playerMatch.confidence,
        auto_added: true
      });
    }
  }

  const cardsMerged = new Map<
    string,
    { sourceName: string; yellow: number; red: number; yellowPaid: number; redPaid: number }
  >();
  for (const row of cardsRaw) {
    const norm = normalizeName(row.name);
    if (!norm) continue;
    const existing = cardsMerged.get(norm);
    if (existing) {
      if (row.cardType === "yellow") {
        existing.yellow += row.count;
        if (row.paid) existing.yellowPaid += row.count;
      } else {
        existing.red += row.count;
        if (row.paid) existing.redPaid += row.count;
      }
    } else {
      cardsMerged.set(norm, {
        sourceName: row.name,
        yellow: row.cardType === "yellow" ? row.count : 0,
        red: row.cardType === "red" ? row.count : 0,
        yellowPaid: row.cardType === "yellow" && row.paid ? row.count : 0,
        redPaid: row.cardType === "red" && row.paid ? row.count : 0
      });
    }
  }

  const cardsRows: ReviewCardRow[] = [];
  for (const [norm, card] of cardsMerged.entries()) {
    const playerMatch = matchPerson(card.sourceName, players);
    const visitorMatch = matchPerson(card.sourceName, visitors);
    const usePlayer = playerMatch.status === "matched";
    const useVisitor = !usePlayer && visitorMatch.status === "matched";
    const resolvedType: "player" | "visitor" = usePlayer ? "player" : "visitor";
    const resolvedId = usePlayer
      ? playerMatch.personId
      : useVisitor
        ? visitorMatch.personId
        : null;
    const resolvedName = usePlayer
      ? (playerMatch.personName || card.sourceName)
      : useVisitor
        ? (visitorMatch.personName || card.sourceName)
        : titleCase(card.sourceName);
    const confidence = usePlayer
      ? playerMatch.confidence
      : useVisitor
        ? visitorMatch.confidence
        : Math.max(playerMatch.confidence, visitorMatch.confidence);

    if (!usePlayer && !useVisitor) visitorsToCreate.add(norm);

    if (card.yellow > 0) {
      cardsRows.push({
        source_name: card.sourceName,
        normalized_name: norm,
        card_type: "yellow",
        count: card.yellow,
        paid_count: card.yellowPaid,
        resolved_type: resolvedType,
        resolved_id: resolvedId,
        resolved_name: resolvedName,
        confidence
      });
    }
    if (card.red > 0) {
      cardsRows.push({
        source_name: card.sourceName,
        normalized_name: norm,
        card_type: "red",
        count: card.red,
        paid_count: card.redPaid,
        resolved_type: resolvedType,
        resolved_id: resolvedId,
        resolved_name: resolvedName,
        confidence
      });
    }

    if (resolvedType === "player" && resolvedId && !attendancePlayerIds.has(resolvedId)) {
      attendancePlayerIds.add(resolvedId);
      attendanceRows.push({
        source_name: card.sourceName,
        normalized_name: norm,
        resolved_type: "player",
        resolved_id: resolvedId,
        resolved_name: resolvedName,
        confidence,
        auto_added: true
      });
    }
  }

  const visitors_to_create = Array.from(visitorsToCreate).map((normalized) => {
    const fromAttendance = attendanceRows.find((r) => r.normalized_name === normalized)?.source_name || normalized;
    return {
      source_name: titleCase(fromAttendance),
      normalized_name: normalized
    };
  });

  const can_commit = goalsRows.every((row) => row.status === "ok");

  if (!can_commit) {
    warnings.push("Resolve goal scorer names before commit.");
  }

  return {
    parsed_date: parsedDate,
    attendance: attendanceRows,
    goals: goalsRows,
    cards: cardsRows,
    visitors_to_create,
    warnings,
    can_commit
  };
}
