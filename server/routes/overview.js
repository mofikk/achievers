const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const {
  getPlayerPaymentSummary
} = require("../lib/paymentStatus");

const router = express.Router();
const dbPath = path.join(__dirname, "..", "data", "db.json");
const settingsPath = path.join(__dirname, "..", "data", "settings.json");

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

function getCurrentMonthKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

router.get("/", async (req, res, next) => {
  try {
    const db = await readJson(dbPath);
    const settings = await readJson(settingsPath);
    const yearKey = String(req.query.yearKey || settings.season || new Date().getFullYear());
    const monthKey = String(req.query.monthKey || getCurrentMonthKey());

    if (!/^\d{4}$/.test(yearKey)) {
      res.status(400).send("yearKey must be YYYY.");
      return;
    }

    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      res.status(400).send("monthKey must be YYYY-MM.");
      return;
    }

    const players = (db.players || []).map((player) => {
      if (!player.createdAt) {
        player.createdAt = new Date(0).toISOString();
      }
      const summary = getPlayerPaymentSummary(db, settings, player.id, yearKey, monthKey);
      return {
        id: player.id,
        name: player.name,
        nickname: player.nickname || "",
        position: player.position || "",
        createdAt: player.createdAt,
        yearly: summary ? summary.yearly : null,
        monthly: summary ? summary.monthly : null
      };
    });

    const missingCreatedAt = (db.players || []).some((player) => !player.createdAt);
    if (missingCreatedAt) {
      await fs.writeFile(dbPath, JSON.stringify(db, null, 2), "utf-8");
    }

    const counts = {
      totalMembers: players.length,
      yearlyPaid: 0,
      yearlyPending: 0,
      yearlyIncomplete: 0,
      monthlyPaid: 0,
      monthlyPending: 0,
      monthlyIncomplete: 0
    };

    players.forEach((player) => {
      const yearlyStatus = player.yearly?.status;
      const monthlyStatus = player.monthly?.status;
      if (yearlyStatus === "PAID") counts.yearlyPaid += 1;
      else if (yearlyStatus === "INCOMPLETE") counts.yearlyIncomplete += 1;
      else counts.yearlyPending += 1;

      if (monthlyStatus === "PAID") counts.monthlyPaid += 1;
      else if (monthlyStatus === "INCOMPLETE") counts.monthlyIncomplete += 1;
      else counts.monthlyPending += 1;
    });

    res.json({ players, counts, yearKey, monthKey });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
