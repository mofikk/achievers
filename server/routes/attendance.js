const fs = require("fs/promises");
const path = require("path");
const express = require("express");

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

router.patch("/:date", async (req, res, next) => {
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

module.exports = router;
