const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const { nanoid } = require("nanoid");

const router = express.Router();
const activityPath = path.join(__dirname, "..", "data", "activity.json");

async function readActivity() {
  const raw = await fs.readFile(activityPath, "utf-8");
  return JSON.parse(raw);
}

async function writeActivity(data) {
  const json = JSON.stringify(data, null, 2);
  await fs.writeFile(activityPath, json, "utf-8");
}

async function logActivity(message, type) {
  const entry = {
    id: nanoid(10),
    message,
    timestamp: Date.now()
  };
  if (type) {
    entry.type = type;
  }
  const activity = await readActivity();
  activity.push(entry);
  await writeActivity(activity);
}

router.get("/", async (req, res, next) => {
  try {
    const activity = await readActivity();
    const limit = Math.max(1, Number(req.query.limit) || 25);
    const page = Math.max(1, Number(req.query.page) || 1);
    const from = String(req.query.from || "").trim();
    const to = String(req.query.to || "").trim();
    const type = String(req.query.type || "").trim();
    const q = String(req.query.q || "").trim().toLowerCase();

    const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toTime = to ? new Date(`${to}T23:59:59`).getTime() : null;

    const filtered = activity.filter((entry) => {
      const timestamp = Number(entry.timestamp) || 0;
      if (Number.isFinite(fromTime) && timestamp < fromTime) return false;
      if (Number.isFinite(toTime) && timestamp > toTime) return false;
      if (type && entry.type !== type) return false;
      if (q && !String(entry.message || "").toLowerCase().includes(q)) return false;
      return true;
    });

    const sorted = filtered.sort((a, b) => Number(b.timestamp) - Number(a.timestamp));
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const items = sorted.slice(start, start + limit);

    res.json({ items, total, page, totalPages });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, logActivity };
