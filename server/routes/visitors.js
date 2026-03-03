const path = require("path");
const express = require("express");
const { nanoid } = require("nanoid");
const { logActivity } = require("./activity");
const { readJson, writeJsonAtomic, withFileLock } = require("../lib/fsStore");

const router = express.Router();
const visitorsPath = path.join(__dirname, "..", "data", "visitors.json");
const dbPath = path.join(__dirname, "..", "data", "db.json");
const settingsPath = path.join(__dirname, "..", "data", "settings.json");

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

async function readJsonFile(filePath) {
  return readJson(filePath, { fallback: [] });
}

async function writeJsonFile(filePath, data) {
  await writeJsonAtomic(filePath, data);
}

function isSaturday(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.getDay() === 6;
}

router.get("/", async (req, res, next) => {
  try {
    const visitors = await readJsonFile(visitorsPath);
    res.json(visitors);
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const nickname = String(req.body.nickname || "").trim();
    const notes = String(req.body.notes || "").trim();
    if (!name) {
      res.status(400).send("Name is required.");
      return;
    }

    const now = new Date().toISOString();
    const visitor = {
      id: nanoid(8),
      name,
      nickname,
      notes,
      createdAt: now,
      attendance: {},
      payments: { sessions: {} },
      stats: { yellow: 0, red: 0 },
      discipline: { yellowPaid: 0, redPaid: 0 }
    };

    await withFileLock(visitorsPath, async () => {
      const visitors = await readJsonFile(visitorsPath);
      visitors.push(visitor);
      await writeJsonFile(visitorsPath, visitors);
    });
    res.status(201).json(visitor);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    let updated = null;
    await withFileLock(visitorsPath, async () => {
      const visitors = await readJsonFile(visitorsPath);
      const visitor = visitors.find((item) => item.id === req.params.id);
      if (!visitor) return;

      const name = String(req.body.name || "").trim();
      const nickname = String(req.body.nickname || "").trim();
      const notes = String(req.body.notes || "").trim();
      if (name) visitor.name = name;
      visitor.nickname = nickname;
      visitor.notes = notes;
      await writeJsonFile(visitorsPath, visitors);
      updated = visitor;
    });
    if (!updated) {
      res.status(404).json({ ok: false });
      return;
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/payments", async (req, res, next) => {
  try {
    let updated = null;
    await withFileLock(visitorsPath, async () => {
      const visitors = await readJsonFile(visitorsPath);
      const visitor = visitors.find((item) => item.id === req.params.id);
      if (!visitor) return;

      const sessionDate = String(req.body.sessionDate || "").trim();
      const paid = Number(req.body.paid);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
        throw new Error("Session date must be YYYY-MM-DD.");
      }
      if (!Number.isFinite(paid) || paid < 0) {
        throw new Error("Paid amount must be non-negative.");
      }

      if (!visitor.payments) visitor.payments = { sessions: {} };
      if (!visitor.payments.sessions) visitor.payments.sessions = {};
      visitor.payments.sessions[sessionDate] = { expected: 1000, paid };
      await writeJsonFile(visitorsPath, visitors);
      updated = visitor;
    });
    if (!updated) {
      res.status(404).json({ ok: false });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err.message === "Session date must be YYYY-MM-DD.") {
      res.status(400).send(err.message);
      return;
    }
    if (err.message === "Paid amount must be non-negative.") {
      res.status(400).send(err.message);
      return;
    }
    next(err);
  }
});

router.patch("/:id/stats", async (req, res, next) => {
  try {
    let updated = null;
    await withFileLock(visitorsPath, async () => {
      const visitors = await readJsonFile(visitorsPath);
      const visitor = visitors.find((item) => item.id === req.params.id);
      if (!visitor) return;

      const yellow = Number(req.body.yellow);
      const red = Number(req.body.red);
      if (!Number.isFinite(yellow) || !Number.isFinite(red) || yellow < 0 || red < 0) {
        throw new Error("Card counts must be non-negative.");
      }

      const discipline = req.body.discipline || {};
      const yellowPaid = Number(discipline.yellowPaid);
      const redPaid = Number(discipline.redPaid);
      const cappedYellow = Math.max(
        0,
        Math.min(Number.isFinite(yellowPaid) ? yellowPaid : 0, yellow)
      );
      const cappedRed = Math.max(
        0,
        Math.min(Number.isFinite(redPaid) ? redPaid : 0, red)
      );

      visitor.stats = { yellow, red };
      visitor.discipline = { yellowPaid: cappedYellow, redPaid: cappedRed };
      await writeJsonFile(visitorsPath, visitors);
      updated = visitor;
    });
    if (!updated) {
      res.status(404).json({ ok: false });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err.message === "Card counts must be non-negative.") {
      res.status(400).send(err.message);
      return;
    }
    next(err);
  }
});

router.patch("/attendance/:date", async (req, res, next) => {
  try {
    const date = String(req.params.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).send("Date must be in YYYY-MM-DD format.");
      return;
    }
    if (!isSaturday(date)) {
      res.status(400).send("Attendance can only be recorded for Saturdays.");
      return;
    }

    const updates = Array.isArray(req.body.updates) ? req.body.updates : null;
    if (!updates) {
      res.status(400).send("Updates are required.");
      return;
    }

    await withFileLock(visitorsPath, async () => {
      const visitors = await readJsonFile(visitorsPath);
      updates.forEach((update) => {
        const visitor = visitors.find((item) => item.id === update.id);
        if (!visitor) return;
        if (!visitor.attendance) visitor.attendance = {};
        visitor.attendance[date] = Boolean(update.present);
      });
      await writeJsonFile(visitorsPath, visitors);
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/promote", async (req, res, next) => {
  try {
    const visitors = await readJsonFile(visitorsPath);
    const visitorIndex = visitors.findIndex((item) => item.id === req.params.id);
    if (visitorIndex === -1) {
      res.status(404).json({ ok: false });
      return;
    }
    const visitor = visitors[visitorIndex];
    const settings = await readJson(settingsPath, { fallback: {} });
    const db = await readJson(dbPath, { fallback: { players: [] } });

    const position = String(req.body.position || "FW").trim();
    if (!allowedPositions.has(position)) {
      res.status(400).send("Position is not supported.");
      return;
    }

    const now = new Date();
    const yearKey = String(settings.season || now.getFullYear());
    const monthKey = `${yearKey}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const player = {
      id: nanoid(8),
      name: visitor.name,
      nickname: visitor.nickname || "",
      position,
      email: "",
      createdAt: new Date().toISOString(),
      membership: { memberSinceYear: Number(yearKey) },
      subscriptions: {
        year: { [yearKey]: "pending" },
        months: { [monthKey]: "pending" }
      },
      stats: { goals: 0, assists: 0, yellow: 0, red: 0 },
      attendance: {},
      payments: { yearly: {}, monthly: {} }
    };

    db.players = db.players || [];
    db.players.push(player);
    visitors.splice(visitorIndex, 1);

    await withFileLock(dbPath, async () => {
      await writeJsonFile(dbPath, db);
    });
    await withFileLock(visitorsPath, async () => {
      await writeJsonFile(visitorsPath, visitors);
    });
    await logActivity(
      `Visitor promoted to member: ${visitor.nickname ? `${visitor.name} (${visitor.nickname})` : visitor.name}`,
      "visitor_promoted"
    );
    res.json({ ok: true, player });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    let deleted = false;
    await withFileLock(visitorsPath, async () => {
      const visitors = await readJsonFile(visitorsPath);
      const index = visitors.findIndex((item) => item.id === req.params.id);
      if (index === -1) return;
      visitors.splice(index, 1);
      await writeJsonFile(visitorsPath, visitors);
      deleted = true;
    });
    if (!deleted) {
      res.status(404).json({ ok: false });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
