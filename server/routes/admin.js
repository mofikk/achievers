const path = require("path");
const fs = require("fs/promises");
const express = require("express");
const { backupAll } = require("../lib/backup");
const { readJson, writeJsonAtomic, withFileLock, safeLoadJson } = require("../lib/fsStore");

const router = express.Router();
const dataDir = path.join(__dirname, "..", "data");
const backupsDir = path.join(dataDir, "backups");
const dbPath = path.join(__dirname, "..", "data", "db.json");
const settingsPath = path.join(__dirname, "..", "data", "settings.json");
const notesPath = path.join(__dirname, "..", "data", "notes.json");
const visitorsPath = path.join(__dirname, "..", "data", "visitors.json");
const activityPath = path.join(__dirname, "..", "data", "activity.json");

async function readJsonFile(filePath) {
  return readJson(filePath);
}

async function writeJsonFile(filePath, data) {
  await writeJsonAtomic(filePath, data);
}

function toRepoPath(filePath) {
  return path.relative(path.join(__dirname, "..", ".."), filePath).replace(/\\/g, "/");
}

function shortError(err) {
  return String(err?.message || "Unknown error").slice(0, 140);
}

function toIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function toEntryIso(entry) {
  if (!entry) return null;
  const raw =
    entry.timestamp !== undefined
      ? entry.timestamp
      : entry.createdAt !== undefined
        ? entry.createdAt
        : entry.updatedAt;
  return toIsoDate(raw);
}

async function getJsonFileHealth(filePath) {
  const base = {
    ok: true,
    path: toRepoPath(filePath),
    sizeBytes: 0,
    updatedAt: null
  };

  let parsed;
  try {
    parsed = await safeLoadJson(filePath);
  } catch (err) {
    base.ok = false;
    base.error = shortError(err);
  }

  try {
    const stats = await fs.stat(filePath);
    base.sizeBytes = stats.size;
    base.updatedAt = stats.mtime.toISOString();
  } catch (err) {
    base.ok = false;
    base.error = shortError(err);
  }

  return { file: base, parsed };
}

async function listBackupFiles() {
  let entries = [];
  try {
    entries = await fs.readdir(backupsDir, { withFileTypes: true });
  } catch (err) {
    return [];
  }

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const fullPath = path.join(backupsDir, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          fullPath,
          mtimeMs: stats.mtimeMs,
          updatedAt: stats.mtime.toISOString()
        };
      })
  );
  return files;
}

function findLatestBackup(files, type) {
  const prefix = `${type}-`;
  const matching = files.filter(
    (file) => file.name.startsWith(prefix) && file.name.endsWith(".json")
  );
  if (!matching.length) return null;
  matching.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return matching[0];
}

async function buildDataHealthPayload() {
  const [db, settings, notes, visitors, activityInfo, backupFiles] = await Promise.all([
    getJsonFileHealth(dbPath),
    getJsonFileHealth(settingsPath),
    getJsonFileHealth(notesPath),
    getJsonFileHealth(visitorsPath),
    getJsonFileHealth(activityPath),
    listBackupFiles()
  ]);

  const activityItems = Array.isArray(activityInfo.parsed) ? activityInfo.parsed : [];
  const sortedActivity = [...activityItems].sort(
    (a, b) => new Date(toEntryIso(b) || 0).getTime() - new Date(toEntryIso(a) || 0).getTime()
  );
  const latestActivity = sortedActivity[0] || null;
  const latestBackup = backupFiles.length
    ? [...backupFiles].sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
    : null;
  const latestDb = findLatestBackup(backupFiles, "db");
  const latestSettings = findLatestBackup(backupFiles, "settings");

  return {
    ok: true,
    files: {
      db: db.file,
      settings: settings.file,
      notes: notes.file,
      visitors: visitors.file,
      activity: activityInfo.file
    },
    activity: {
      totalEvents: activityItems.length,
      lastEventAt: toEntryIso(latestActivity),
      lastEventType: latestActivity?.type || null,
      fileSizeBytes: activityInfo.file.sizeBytes
    },
    backups: {
      count: backupFiles.length,
      latestAt: latestBackup?.updatedAt || null,
      latestFiles: {
        db: latestDb?.name || null,
        settings: latestSettings?.name || null
      },
      latestByType: {
        db: latestDb?.updatedAt || null,
        settings: latestSettings?.updatedAt || null
      }
    },
    serverTime: new Date().toISOString()
  };
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
  await withFileLock(dbPath, async () => {
    const db = await readJsonFile(dbPath);
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

    await writeJsonFile(dbPath, db);
  });
}

router.post("/rollover", async (req, res, next) => {
  try {
    const settings = await readJsonFile(settingsPath);
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
    await withFileLock(settingsPath, async () => {
      await writeJsonFile(settingsPath, settings);
    });
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

    const settings = await readJsonFile(settingsPath);
    const backup = await backupAll();
    await applyReset(reset);

    res.json({ ok: true, backup, season: settings.season });
  } catch (err) {
    next(err);
  }
});

router.get("/data-health", async (req, res, next) => {
  try {
    const payload = await buildDataHealthPayload();
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

router.get("/activity-health", async (req, res, next) => {
  try {
    const payload = await buildDataHealthPayload();
    res.json({ ok: true, ...payload.activity, serverTime: payload.serverTime });
  } catch (err) {
    next(err);
  }
});

router.get("/backups/latest", async (req, res, next) => {
  try {
    const type = String(req.query.type || "").trim();
    if (type !== "db" && type !== "settings") {
      res.status(400).json({ ok: false, error: "Invalid backup type" });
      return;
    }

    const files = await listBackupFiles();
    const latest = findLatestBackup(files, type);
    if (!latest) {
      res.status(404).json({ ok: false, error: "No backups found" });
      return;
    }

    res.download(latest.fullPath, latest.name);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
