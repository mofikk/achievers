const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const { backupAll } = require("../lib/backup");

const router = express.Router();
const dbPath = path.join(__dirname, "..", "data", "db.json");
const settingsPath = path.join(__dirname, "..", "data", "settings.json");

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, json, "utf-8");
}

function validateReset(reset) {
  const fields = [
    "attendance",
    "monthlyPayments",
    "yearlyPayments",
    "stats",
    "disciplinePaid"
  ];
  return fields.every((field) => typeof reset?.[field] === "boolean");
}

async function applyReset(reset) {
  const db = await readJson(dbPath);
  const players = db.players || [];

  players.forEach((player) => {
    if (reset.attendance) player.attendance = {};
    if (reset.monthlyPayments) {
      if (!player.payments) player.payments = { yearly: {}, monthly: {} };
      player.payments.monthly = {};
    }
    if (reset.yearlyPayments) {
      if (!player.payments) player.payments = { yearly: {}, monthly: {} };
      player.payments.yearly = {};
    }
    if (reset.stats) {
      player.stats = { goals: 0, assists: 0, yellow: 0, red: 0 };
    }
    if (reset.disciplinePaid) {
      player.discipline = { yellowPaid: 0, redPaid: 0 };
    }
  });

  await writeJson(dbPath, db);
}

router.post("/rollover", async (req, res, next) => {
  try {
    const settings = await readJson(settingsPath);
    const currentSeason = Number(settings.season);
    const newSeasonYear = Number(req.body.newSeasonYear);
    const reset = req.body.reset;

    if (!Number.isFinite(newSeasonYear) || newSeasonYear < currentSeason) {
      res.status(400).send("New season year must be >= current season year.");
      return;
    }

    if (!validateReset(reset)) {
      res.status(400).send("Reset flags must be boolean.");
      return;
    }

    const backup = await backupAll();
    settings.season = newSeasonYear;
    await writeJson(settingsPath, settings);
    await applyReset(reset);

    res.json({ ok: true, backup, season: newSeasonYear });
  } catch (err) {
    next(err);
  }
});

router.post("/reset-season", async (req, res, next) => {
  try {
    const reset = req.body.reset;
    if (!validateReset(reset)) {
      res.status(400).send("Reset flags must be boolean.");
      return;
    }

    const settings = await readJson(settingsPath);
    const backup = await backupAll();
    await applyReset(reset);

    res.json({ ok: true, backup, season: settings.season });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
