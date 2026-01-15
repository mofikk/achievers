const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const { nanoid } = require("nanoid");
const { logActivity } = require("./activity");

const router = express.Router();
const dbPath = path.join(__dirname, "..", "data", "db.json");
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

async function readDb() {
  const raw = await fs.readFile(dbPath, "utf-8");
  return JSON.parse(raw);
}

async function writeDb(data) {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(dbPath, json, "utf-8");
}

function formatDisplayName(player) {
  if (!player) return "Player";
  return player.nickname ? `${player.name} (${player.nickname})` : player.name;
}

async function readSettings() {
  const settingsPath = path.join(__dirname, "..", "data", "settings.json");
  const raw = await fs.readFile(settingsPath, "utf-8");
  return JSON.parse(raw);
}

router.get("/", async (req, res, next) => {
  try {
    const db = await readDb();
    res.json(db.players || []);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const position = String(req.body.position || "").trim();
    const nickname = String(req.body.nickname || "").trim();
    const memberSinceInput = Number(req.body.memberSinceYear);

    if (!name || !position) {
      res.status(400).send("Name and position are required.");
      return;
    }

    if (!allowedPositions.has(position)) {
      res.status(400).send("Position is not supported.");
      return;
    }

    const db = await readDb();
    const players = db.players || [];
    const nameNorm = name.trim().toLowerCase();
    const nickNorm = String(nickname || "").trim().toLowerCase();

    const duplicateExists = players.some((player) => {
      const existingName = String(player.name || "").trim().toLowerCase();
      const existingNick = String(player.nickname || "").trim().toLowerCase();
      return existingName === nameNorm && existingNick === nickNorm;
    });

    if (duplicateExists) {
      res.status(409).send("Player with this name and nickname already exists.");
      return;
    }
    const now = new Date();
    const currentYear = now.getFullYear();
    const yearKey = String(currentYear);
    const monthKey = `${yearKey}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const memberSinceYear =
      Number.isFinite(memberSinceInput) &&
      memberSinceInput >= 2000 &&
      memberSinceInput <= currentYear + 1
        ? memberSinceInput
        : currentYear;
    const player = {
      id: nanoid(8),
      name,
      nickname: nickname || "",
      position,
      membership: { memberSinceYear },
      subscriptions: {
        year: { [yearKey]: "pending" },
        months: { [monthKey]: "pending" }
      },
      stats: { goals: 0, assists: 0, yellow: 0, red: 0 },
      attendance: {}
    };

    players.push(player);
    db.players = players;

    await writeDb(db);
    await logActivity(`New member joined: ${formatDisplayName(player)}`);
    res.status(201).json(player);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/payments", async (req, res, next) => {
  try {
    const db = await readDb();
    const players = db.players || [];
    const player = players.find((item) => item.id === req.params.id);

    if (!player) {
      res.status(404).json({ ok: false });
      return;
    }

    const yearKey = String(req.body.yearKey || "").trim();
    const monthKey = String(req.body.monthKey || "").trim();
    const yearly = req.body.yearly || {};
    const monthly = req.body.monthly || {};

    const yearlyExpected = Number(yearly.expected);
    const yearlyPaid = Number(yearly.paid);
    const monthlyExpected = Number(monthly.expected);
    const monthlyPaid = Number(monthly.paid);

    if (!yearKey || !monthKey) {
      res.status(400).send("Year and month are required.");
      return;
    }

    if (
      !Number.isFinite(yearlyExpected) ||
      !Number.isFinite(yearlyPaid) ||
      !Number.isFinite(monthlyExpected) ||
      !Number.isFinite(monthlyPaid) ||
      yearlyExpected < 0 ||
      yearlyPaid < 0 ||
      monthlyExpected < 0 ||
      monthlyPaid < 0
    ) {
      res.status(400).send("Expected and paid must be non-negative numbers.");
      return;
    }

    if (!player.payments) {
      player.payments = { yearly: {}, monthly: {} };
    }
    if (!player.payments.yearly) {
      player.payments.yearly = {};
    }
    if (!player.payments.monthly) {
      player.payments.monthly = {};
    }

    const prevYearlyPaid = Number(player.payments.yearly?.[yearKey]?.paid) || 0;
    const prevMonthlyPaid = Number(player.payments.monthly?.[monthKey]?.paid) || 0;
    const prevYearlyExpected =
      Number(player.payments.yearly?.[yearKey]?.expected) || yearlyExpected;
    const prevMonthlyExpected =
      Number(player.payments.monthly?.[monthKey]?.expected) || monthlyExpected;

    player.payments.yearly[yearKey] = {
      expected: yearlyExpected,
      paid: yearlyPaid
    };
    player.payments.monthly[monthKey] = {
      expected: monthlyExpected,
      paid: monthlyPaid
    };

    await writeDb(db);
    const prevYearlyCleared = prevYearlyPaid >= prevYearlyExpected;
    const newYearlyCleared = yearlyPaid >= yearlyExpected;
    if (!prevYearlyCleared && newYearlyCleared) {
      await logActivity(
        `Yearly subscription cleared: ${formatDisplayName(player)} (${yearKey})`
      );
    }

    const prevMonthlyCleared = prevMonthlyPaid >= prevMonthlyExpected;
    const newMonthlyCleared = monthlyPaid >= monthlyExpected;
    if (!prevMonthlyCleared && newMonthlyCleared) {
      await logActivity(
        `Monthly payment cleared: ${formatDisplayName(player)} (${monthKey})`
      );
    }
    res.json(player);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const db = await readDb();
    const players = db.players || [];
    const player = players.find((item) => item.id === req.params.id);

    if (!player) {
      res.status(404).json({ ok: false });
      return;
    }

    const name = String(req.body.name || "").trim();
    const position = String(req.body.position || "").trim();
    const nickname = String(req.body.nickname || "").trim();
    const memberSinceInput = Number(req.body.memberSinceYear);
    const now = new Date();
    const currentYear = now.getFullYear();

    if (!name || !position) {
      res.status(400).send("Name and position are required.");
      return;
    }

    if (!allowedPositions.has(position)) {
      res.status(400).send("Position is not supported.");
      return;
    }

    if (
      !Number.isFinite(memberSinceInput) ||
      memberSinceInput < 2000 ||
      memberSinceInput > currentYear + 1
    ) {
      res.status(400).send("Member since year is invalid.");
      return;
    }

    const nameNorm = name.trim().toLowerCase();
    const nickNorm = String(nickname || "").trim().toLowerCase();
    const duplicateExists = players.some((item) => {
      if (item.id === player.id) return false;
      const existingName = String(item.name || "").trim().toLowerCase();
      const existingNick = String(item.nickname || "").trim().toLowerCase();
      return existingName === nameNorm && existingNick === nickNorm;
    });

    if (duplicateExists) {
      res.status(409).send("Player with this name and nickname already exists.");
      return;
    }

    player.name = name;
    player.nickname = nickname;
    player.position = position;
    player.membership = { memberSinceYear: memberSinceInput };

    await writeDb(db);
    res.json(player);
  } catch (err) {
    next(err);
  }
});

router.patch("/attendance/:date", async (req, res, next) => {
  try {
    const date = String(req.params.date || "");
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(date)) {
      res.status(400).send("Date must be in YYYY-MM-DD format.");
      return;
    }

    const updates = Array.isArray(req.body.updates) ? req.body.updates : null;
    if (!updates) {
      res.status(400).send("Updates are required.");
      return;
    }

    const db = await readDb();
    const players = db.players || [];

    updates.forEach((update) => {
      const player = players.find((item) => item.id === update.id);
      if (!player) return;
      if (!player.attendance) player.attendance = {};
      player.attendance[date] = Boolean(update.present);
    });

    await writeDb(db);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/stats", async (req, res, next) => {
  try {
    const db = await readDb();
    const players = db.players || [];
    const player = players.find((item) => item.id === req.params.id);

    if (!player) {
      res.status(404).json({ ok: false });
      return;
    }

    const goals = Number(req.body.goals);
    const assists = Number(req.body.assists);
    const yellow = Number(req.body.yellow);
    const red = Number(req.body.red);

    const values = [goals, assists, yellow, red];
    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      res.status(400).send("Stats must be non-negative numbers.");
      return;
    }

    const disciplineInput = req.body.discipline || {};
    const previousStats = player.stats || {};
    const previousDiscipline = player.discipline || { yellowPaid: 0, redPaid: 0 };
    const existingDiscipline = previousDiscipline;
    const yellowPaid = Number.isFinite(Number(disciplineInput.yellowPaid))
      ? Number(disciplineInput.yellowPaid)
      : Number(existingDiscipline.yellowPaid) || 0;
    const redPaid = Number.isFinite(Number(disciplineInput.redPaid))
      ? Number(disciplineInput.redPaid)
      : Number(existingDiscipline.redPaid) || 0;

    const cappedYellowPaid = Math.max(0, Math.min(yellowPaid, yellow));
    const cappedRedPaid = Math.max(0, Math.min(redPaid, red));

    const settings = await readSettings();
    const yellowFine = settings.discipline?.yellowFine ?? 500;
    const redFine = settings.discipline?.redFine ?? 1000;
    const prevYellow = Number(previousStats.yellow) || 0;
    const prevRed = Number(previousStats.red) || 0;
    const prevOwed =
      Math.max(0, prevYellow - (previousDiscipline.yellowPaid || 0)) * yellowFine +
      Math.max(0, prevRed - (previousDiscipline.redPaid || 0)) * redFine;

    player.stats = { goals, assists, yellow, red };
    player.discipline = {
      yellowPaid: cappedYellowPaid,
      redPaid: cappedRedPaid
    };

    await writeDb(db);
    const newOwed =
      Math.max(0, yellow - cappedYellowPaid) * yellowFine +
      Math.max(0, red - cappedRedPaid) * redFine;

    if (prevOwed > 0 && newOwed === 0) {
      await logActivity(`Fines settled: ${formatDisplayName(player)}`);
    }
    res.json(player);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/discipline", async (req, res, next) => {
  try {
    const db = await readDb();
    const players = db.players || [];
    const player = players.find((item) => item.id === req.params.id);

    if (!player) {
      res.status(404).json({ ok: false });
      return;
    }

    const yellowPaid = Number(req.body.yellowPaid);
    const redPaid = Number(req.body.redPaid);
    if (
      !Number.isFinite(yellowPaid) ||
      !Number.isFinite(redPaid) ||
      yellowPaid < 0 ||
      redPaid < 0
    ) {
      res.status(400).send("Discipline payments must be non-negative numbers.");
      return;
    }

    const yellowTotal = Number(player?.stats?.yellow) || 0;
    const redTotal = Number(player?.stats?.red) || 0;
    const previousDiscipline = player.discipline || { yellowPaid: 0, redPaid: 0 };
    const settings = await readSettings();
    const yellowFine = settings.discipline?.yellowFine ?? 500;
    const redFine = settings.discipline?.redFine ?? 1000;
    const prevOwed =
      Math.max(0, yellowTotal - (previousDiscipline.yellowPaid || 0)) * yellowFine +
      Math.max(0, redTotal - (previousDiscipline.redPaid || 0)) * redFine;
    player.discipline = {
      yellowPaid: Math.min(yellowPaid, yellowTotal),
      redPaid: Math.min(redPaid, redTotal)
    };

    await writeDb(db);
    const newOwed =
      Math.max(0, yellowTotal - player.discipline.yellowPaid) * yellowFine +
      Math.max(0, redTotal - player.discipline.redPaid) * redFine;
    if (prevOwed > 0 && newOwed === 0) {
      await logActivity(`Fines settled: ${formatDisplayName(player)}`);
    }
    res.json(player);
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const db = await readDb();
    const id = req.params.id;
    const players = db.players || [];
    const index = players.findIndex((player) => player.id === id);

    if (index === -1) {
      res.status(404).json({ ok: false });
      return;
    }

    players.splice(index, 1);
    db.players = players;
    await writeDb(db);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
