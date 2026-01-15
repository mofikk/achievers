const fs = require("fs/promises");
const path = require("path");
const express = require("express");

const router = express.Router();
const settingsPath = path.join(__dirname, "..", "data", "settings.json");

async function readSettings() {
  const raw = await fs.readFile(settingsPath, "utf-8");
  return JSON.parse(raw);
}

async function writeSettings(data) {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(settingsPath, json, "utf-8");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

router.get("/", async (req, res, next) => {
  try {
    const settings = await readSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
});

router.patch("/", async (req, res, next) => {
  try {
    const settings = await readSettings();
    const payload = req.body || {};

    if (!isNonEmptyString(payload.clubName)) {
      res.status(400).send("Club name is required.");
      return;
    }

    const season = Number(payload.season);
    if (!Number.isFinite(season) || season < 2000) {
      res.status(400).send("Season must be a number >= 2000.");
      return;
    }

    const currencySymbol = String(payload.currencySymbol || "").trim();
    if (!currencySymbol || currencySymbol.length > 3) {
      res.status(400).send("Currency symbol is required.");
      return;
    }

    const fees = payload.fees || {};
    const monthly = Number(fees.monthly);
    const newMemberYearly = Number(fees.newMemberYearly);
    const renewalYearly = Number(fees.renewalYearly);

    if (
      !Number.isFinite(monthly) ||
      !Number.isFinite(newMemberYearly) ||
      !Number.isFinite(renewalYearly) ||
      monthly < 0 ||
      newMemberYearly < 0 ||
      renewalYearly < 0
    ) {
      res.status(400).send("Fees must be non-negative numbers.");
      return;
    }

    const attendance = payload.attendance || {};
    const startDate = String(attendance.startDate || "");
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!datePattern.test(startDate)) {
      res.status(400).send("Attendance start date must be YYYY-MM-DD.");
      return;
    }

    if (typeof attendance.lockFuture !== "boolean") {
      res.status(400).send("Attendance lockFuture must be boolean.");
      return;
    }

    const updated = {
      ...settings,
      clubName: payload.clubName.trim(),
      season,
      currencySymbol,
      fees: { monthly, newMemberYearly, renewalYearly },
      attendance: { startDate, lockFuture: attendance.lockFuture }
    };

    await writeSettings(updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
