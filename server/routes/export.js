const fs = require("fs/promises");
const path = require("path");
const express = require("express");

const router = express.Router();
const dbPath = path.join(__dirname, "..", "data", "db.json");
const settingsPath = path.join(__dirname, "..", "data", "settings.json");

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, "\"\"")}"`;
  }
  return str;
}

function toCsv(headers, rows) {
  const lines = [headers.join(",")];
  rows.forEach((row) => {
    lines.push(row.map(csvEscape).join(","));
  });
  return lines.join("\n");
}

function getMemberSinceYear(player, currentYear) {
  const stored = Number(player?.membership?.memberSinceYear);
  if (Number.isFinite(stored) && stored > 0) return stored;
  const years = Object.keys(player?.subscriptions?.year || {})
    .map((year) => Number(year))
    .filter((year) => Number.isFinite(year));
  if (years.length) {
    years.sort((a, b) => a - b);
    return years[0];
  }
  return currentYear;
}

function deriveStatus(expected, paid) {
  if (expected <= 0) return paid > 0 ? "incomplete" : "pending";
  if (paid >= expected) return "paid";
  if (paid > 0) return "incomplete";
  return "pending";
}

router.get("/players.csv", async (req, res, next) => {
  try {
    const db = await readJson(dbPath);
    const currentYear = new Date().getFullYear();
    const rows = (db.players || []).map((player) => [
      player.id,
      player.name || "",
      player.nickname || "",
      player.position || "",
      getMemberSinceYear(player, currentYear)
    ]);

    const csv = toCsv(
      ["id", "name", "nickname", "position", "memberSinceYear"],
      rows
    );
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", "attachment; filename=\"players.csv\"");
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get("/payments.csv", async (req, res, next) => {
  try {
    const db = await readJson(dbPath);
    const settings = await readJson(settingsPath);
    const currentYear = new Date().getFullYear();

    const rows = (db.players || []).map((player) => {
      const memberSinceYear = getMemberSinceYear(player, currentYear);
      const years = Object.keys(player?.payments?.yearly || {});
      const months = Object.keys(player?.payments?.monthly || {});
      const yearKey = years.sort().slice(-1)[0] || String(currentYear);
      const monthKey = months.sort().slice(-1)[0] || "";
      const yearlyRecord = player?.payments?.yearly?.[yearKey] || {};
      const monthlyRecord = player?.payments?.monthly?.[monthKey] || {};
      const yearlyExpected =
        Number(yearKey) === memberSinceYear
          ? settings.fees.newMemberYearly
          : settings.fees.renewalYearly;
      const monthlyExpected = settings.fees.monthly;
      const yearlyPaid = Number(yearlyRecord.paid) || 0;
      const monthlyPaid = Number(monthlyRecord.paid) || 0;
      const yearlyStatus = deriveStatus(yearlyExpected, yearlyPaid);
      const monthlyStatus = deriveStatus(monthlyExpected, monthlyPaid);

      return [
        player.id,
        player.name || "",
        player.nickname || "",
        yearKey,
        yearlyExpected,
        yearlyPaid,
        yearlyStatus,
        monthKey,
        monthlyExpected,
        monthlyPaid,
        monthlyStatus
      ];
    });

    const csv = toCsv(
      [
        "id",
        "name",
        "nickname",
        "yearKey",
        "yearlyExpected",
        "yearlyPaid",
        "yearlyStatus",
        "monthKey",
        "monthlyExpected",
        "monthlyPaid",
        "monthlyStatus"
      ],
      rows
    );
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", "attachment; filename=\"payments.csv\"");
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get("/attendance.csv", async (req, res, next) => {
  try {
    const db = await readJson(dbPath);
    const players = db.players || [];
    const dateSet = new Set();
    players.forEach((player) => {
      Object.keys(player?.attendance || {}).forEach((date) => dateSet.add(date));
    });
    const dates = Array.from(dateSet).sort();
    const rows = [];
    dates.forEach((date) => {
      players.forEach((player) => {
        const present = Boolean(player?.attendance?.[date]);
        rows.push([
          date,
          player.id,
          player.name || "",
          player.nickname || "",
          present
        ]);
      });
    });

    const csv = toCsv(
      ["date", "id", "name", "nickname", "present"],
      rows
    );
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", "attachment; filename=\"attendance.csv\"");
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

router.get("/stats.csv", async (req, res, next) => {
  try {
    const db = await readJson(dbPath);
    const rows = (db.players || []).map((player) => {
      const stats = player.stats || {};
      const discipline = player.discipline || {};
      const goals = Number(stats.goals) || 0;
      const assists = Number(stats.assists) || 0;
      const yellow = Number(stats.yellow) || 0;
      const red = Number(stats.red) || 0;
      const yellowPaid = Number(discipline.yellowPaid) || 0;
      const redPaid = Number(discipline.redPaid) || 0;
      const yellowOwed = Math.max(0, yellow - yellowPaid);
      const redOwed = Math.max(0, red - redPaid);
      const finesOwed = yellowOwed * 500 + redOwed * 1000;
      const status =
        finesOwed === 0
          ? "paid"
          : yellowPaid + redPaid === 0
            ? "pending"
            : "incomplete";

      return [
        player.id,
        player.name || "",
        player.nickname || "",
        goals,
        assists,
        yellow,
        red,
        yellowPaid,
        redPaid,
        yellowOwed,
        redOwed,
        finesOwed,
        status
      ];
    });

    const csv = toCsv(
      [
        "id",
        "name",
        "nickname",
        "goals",
        "assists",
        "yellow",
        "red",
        "yellowPaid",
        "redPaid",
        "yellowOwed",
        "redOwed",
        "finesOwed",
        "status"
      ],
      rows
    );
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", "attachment; filename=\"stats.csv\"");
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
