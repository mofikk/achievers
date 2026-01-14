const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const { nanoid } = require("nanoid");

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

    player.payments.yearly[yearKey] = {
      expected: yearlyExpected,
      paid: yearlyPaid
    };
    player.payments.monthly[monthKey] = {
      expected: monthlyExpected,
      paid: monthlyPaid
    };

    await writeDb(db);
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
