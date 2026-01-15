const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const { nanoid } = require("nanoid");
const { backupAll } = require("../lib/backup");
const { parseCSV } = require("../lib/csv");

const router = express.Router();
const dbPath = path.join(__dirname, "..", "data", "db.json");
const settingsPath = path.join(__dirname, "..", "data", "settings.json");

const allowedPositions = new Set([
  "FW",
  "CM",
  "CDM",
  "CAM",
  "LM",
  "RM",
  "CB",
  "RB",
  "LB",
  "LW",
  "RW",
  "GK",
  "DF",
  "MF"
]);

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, json, "utf-8");
}

function getCsvBody(req) {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body.csv === "string") return req.body.csv;
  return "";
}

function normalizePair(name, nickname) {
  return {
    name: String(name || "").trim().toLowerCase(),
    nickname: String(nickname || "").trim().toLowerCase()
  };
}

function getMonthlyExpected(settings, monthKey) {
  const schedule = settings.fees?.monthlySchedule || [];
  if (!schedule.length) return 0;
  const sorted = [...schedule].sort((a, b) => a.from.localeCompare(b.from));
  let candidate = sorted[0].amount;
  sorted.forEach((item) => {
    if (item.from <= monthKey) candidate = item.amount;
  });
  return candidate;
}

router.use(express.text({ type: ["text/csv", "text/plain"], limit: "2mb" }));

router.post("/players", async (req, res, next) => {
  try {
    const csvText = getCsvBody(req);
    const rows = parseCSV(csvText);
    const db = await readJson(dbPath);
    const settings = await readJson(settingsPath);
    const season = Number(settings.season) || new Date().getFullYear();

    let created = 0;
    let skipped = 0;

    const existing = new Set(
      (db.players || []).map((player) => {
        const pair = normalizePair(player.name, player.nickname);
        return `${pair.name}::${pair.nickname}`;
      })
    );

    rows.forEach((row) => {
      const name = String(row.name || "").trim();
      const nickname = String(row.nickname || "").trim();
      const position = String(row.position || "").trim();
      const memberSinceYear = Number(row.memberSinceYear);

      if (!name || !position || !allowedPositions.has(position)) {
        skipped += 1;
        return;
      }

      const pair = normalizePair(name, nickname);
      const key = `${pair.name}::${pair.nickname}`;
      if (existing.has(key)) {
        skipped += 1;
        return;
      }

      const player = {
        id: nanoid(8),
        name,
        nickname,
        position,
        membership: {
          memberSinceYear: Number.isFinite(memberSinceYear) ? memberSinceYear : season
        },
        subscriptions: {
          year: {},
          months: {}
        },
        payments: {
          yearly: {},
          monthly: {}
        },
        stats: { goals: 0, assists: 0, yellow: 0, red: 0 },
        discipline: { yellowPaid: 0, redPaid: 0 },
        attendance: {}
      };

      db.players = db.players || [];
      db.players.push(player);
      existing.add(key);
      created += 1;
    });

    await backupAll();
    await writeJson(dbPath, db);
    res.json({ ok: true, created, skipped });
  } catch (err) {
    next(err);
  }
});

router.post("/payments", async (req, res, next) => {
  try {
    const csvText = getCsvBody(req);
    const rows = parseCSV(csvText);
    const db = await readJson(dbPath);
    const settings = await readJson(settingsPath);
    const fees = settings.fees || {};

    const notFound = [];
    let updated = 0;

    rows.forEach((row) => {
      const name = String(row.name || "").trim();
      const nickname = String(row.nickname || "").trim();
      const yearKey = String(row.yearKey || "").trim();
      const monthKey = String(row.monthKey || "").trim();
      const yearlyPaid = Number(row.yearlyPaid);
      const monthlyPaid = Number(row.monthlyPaid);

      if (!/^\d{4}$/.test(yearKey) || !/^\d{4}-\d{2}$/.test(monthKey)) {
        return;
      }
      if (!Number.isFinite(yearlyPaid) || yearlyPaid < 0) return;
      if (!Number.isFinite(monthlyPaid) || monthlyPaid < 0) return;

      const pair = normalizePair(name, nickname);
      const player = (db.players || []).find((item) => {
        const key = normalizePair(item.name, item.nickname);
        return key.name === pair.name && key.nickname === pair.nickname;
      });

      if (!player) {
        notFound.push({ name, nickname, yearKey, monthKey });
        return;
      }

      const memberSinceYear = Number(player?.membership?.memberSinceYear) || Number(yearKey);
      const yearlyExpected =
        Number(yearKey) === memberSinceYear ? fees.newMemberYearly : fees.renewalYearly;
      const monthlyExpected = getMonthlyExpected(settings, monthKey);

      if (!player.payments) player.payments = { yearly: {}, monthly: {} };
      if (!player.payments.yearly) player.payments.yearly = {};
      if (!player.payments.monthly) player.payments.monthly = {};

      player.payments.yearly[yearKey] = {
        expected: yearlyExpected,
        paid: yearlyPaid
      };
      player.payments.monthly[monthKey] = {
        expected: monthlyExpected,
        paid: monthlyPaid
      };
      updated += 1;
    });

    await backupAll();
    await writeJson(dbPath, db);
    res.json({ ok: true, updated, notFound });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
