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
    const player = {
      id: nanoid(8),
      name: req.body.name || "",
      position: req.body.position || "",
      subscriptions: req.body.subscriptions || { year: {}, months: {} },
      stats: req.body.stats || { goals: 0, assists: 0, yellow: 0, red: 0 },
      attendance: req.body.attendance || {}
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
