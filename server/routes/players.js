const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const { nanoid } = require("nanoid");

const router = express.Router();
const dbPath = path.join(__dirname, "..", "data", "db.json");

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
    const db = await readDb();
    const now = new Date();
    const yearKey = String(now.getFullYear());
    const monthKey = `${yearKey}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const jerseyNumber =
      req.body.jerseyNumber === null || req.body.jerseyNumber === undefined
        ? null
        : Number(req.body.jerseyNumber);
    const player = {
      id: nanoid(8),
      name: req.body.name || "",
      position: req.body.position || "",
      jerseyNumber: Number.isFinite(jerseyNumber) ? jerseyNumber : null,
      subscriptions: {
        year: { [yearKey]: "pending" },
        months: { [monthKey]: "pending" }
      },
      stats: { goals: 0, assists: 0, yellow: 0, red: 0 },
      attendance: {}
    };

    db.players = db.players || [];
    db.players.push(player);

    await writeDb(db);
    res.status(201).json(player);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
