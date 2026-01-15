const fs = require("fs/promises");
const path = require("path");
const express = require("express");

const router = express.Router();
const settingsPath = path.join(__dirname, "..", "data", "settings.json");

async function writeSettings(data) {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(settingsPath, json, "utf-8");
}

async function readSettings() {
  const raw = await fs.readFile(settingsPath, "utf-8");
  const parsed = JSON.parse(raw);
  const fees = parsed.fees || {};
  const schedule =
    Array.isArray(fees.monthlySchedule) && fees.monthlySchedule.length
      ? fees.monthlySchedule
      : null;
  const legacyMonthly = Number(fees.monthly);

  if (!schedule && Number.isFinite(legacyMonthly)) {
    const seasonYear = Number(parsed.season) || new Date().getFullYear();
    const migrated = {
      ...parsed,
      fees: {
        ...fees,
        monthlySchedule: [{ from: `${seasonYear}-01`, amount: legacyMonthly }]
      }
    };
    delete migrated.fees.monthly;
    await writeSettings(migrated);
    return migrated;
  }

  return parsed;
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
    const schedule = Array.isArray(fees.monthlySchedule) ? fees.monthlySchedule : [];
    const newMemberYearly = Number(fees.newMemberYearly);
    const renewalYearly = Number(fees.renewalYearly);

    if (!schedule.length) {
      res.status(400).send("Monthly schedule is required.");
      return;
    }

    const fromPattern = /^\d{4}-\d{2}$/;
    const scheduleValidated = schedule.map((item) => ({
      from: String(item.from || "").trim(),
      amount: Number(item.amount)
    }));

    const hasInvalidEntry = scheduleValidated.some(
      (item) =>
        !fromPattern.test(item.from) || !Number.isFinite(item.amount) || item.amount < 0
    );

    if (hasInvalidEntry) {
      res.status(400).send("Monthly schedule entries must use YYYY-MM and valid amounts.");
      return;
    }

    const seen = new Set();
    const hasDuplicates = scheduleValidated.some((item) => {
      if (seen.has(item.from)) return true;
      seen.add(item.from);
      return false;
    });

    if (hasDuplicates) {
      res.status(400).send("Monthly schedule cannot contain duplicate months.");
      return;
    }

    scheduleValidated.sort((a, b) => a.from.localeCompare(b.from));

    if (
      !Number.isFinite(newMemberYearly) ||
      !Number.isFinite(renewalYearly) ||
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

    const discipline = payload.discipline || {};
    const yellowFine = Number(discipline.yellowFine);
    const redFine = Number(discipline.redFine);
    if (
      !Number.isFinite(yellowFine) ||
      !Number.isFinite(redFine) ||
      yellowFine < 0 ||
      redFine < 0
    ) {
      res.status(400).send("Discipline fines must be non-negative numbers.");
      return;
    }

    const updated = {
      ...settings,
      clubName: payload.clubName.trim(),
      season,
      currencySymbol,
      fees: { monthlySchedule: scheduleValidated, newMemberYearly, renewalYearly },
      attendance: { startDate, lockFuture: attendance.lockFuture },
      discipline: { yellowFine, redFine }
    };

    await writeSettings(updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
