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

async function logActivity(message) {
  const entry = {
    id: nanoid(10),
    message,
    timestamp: Date.now()
  };
  const activity = await readActivity();
  activity.push(entry);
  await writeActivity(activity);
}

router.get("/", async (req, res, next) => {
  try {
    const activity = await readActivity();
    const latest = activity
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);
    res.json(latest);
  } catch (err) {
    next(err);
  }
});

module.exports = { router, logActivity };
