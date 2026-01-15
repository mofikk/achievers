const fs = require("fs/promises");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");
const backupsDir = path.join(dataDir, "backups");

async function ensureDir() {
  await fs.mkdir(backupsDir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function backupFile(filename) {
  const source = path.join(dataDir, filename);
  const backupName = `${path.parse(filename).name}-${timestamp()}.json`;
  const dest = path.join(backupsDir, backupName);
  const raw = await fs.readFile(source, "utf-8");
  await fs.writeFile(dest, raw, "utf-8");
  return backupName;
}

async function backupAll() {
  await ensureDir();
  const db = await backupFile("db.json");
  const settings = await backupFile("settings.json");
  return { db, settings };
}

module.exports = { backupAll };
