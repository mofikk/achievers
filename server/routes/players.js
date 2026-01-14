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
    const yearKey = String(now.getFullYear());
    const monthKey = `${yearKey}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const player = {
      id: nanoid(8),
      name,
      nickname: nickname || "",
      position,
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
