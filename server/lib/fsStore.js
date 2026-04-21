const fs = require("fs/promises");
const path = require("path");

const locks = new Map();

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath, data) {
  const json = JSON.stringify(data, null, 2);
  const dir = path.dirname(filePath);
  const tmpName = `${path.basename(filePath)}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;
  const tmpPath = path.join(dir, tmpName);
  await fs.writeFile(tmpPath, json, "utf-8");
  await fs.rename(tmpPath, filePath);
}

function withFileLock(filePath, fn) {
  const previous = locks.get(filePath) || Promise.resolve();
  const run = previous.then(() => fn());
  const chain = run.catch(() => {});
  locks.set(filePath, chain);
  return run.finally(() => {
    if (locks.get(filePath) === chain) {
      locks.delete(filePath);
    }
  });
}

async function restoreFromLatestBackup(filePath) {
  const backupsDir = path.join(path.dirname(filePath), "backups");
  let entries;
  try {
    entries = await fs.readdir(backupsDir, { withFileTypes: true });
  } catch (err) {
    return null;
  }

  const baseName = path.parse(filePath).name;
  const candidates = await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.startsWith(`${baseName}-`) &&
          entry.name.endsWith(".json")
      )
      .map(async (entry) => {
        const fullPath = path.join(backupsDir, entry.name);
        const stats = await fs.stat(fullPath);
        return { fullPath, mtimeMs: stats.mtimeMs };
      })
  );

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latest = candidates[0];
  const raw = await fs.readFile(latest.fullPath, "utf-8");
  const parsed = safeParse(raw);
  if (parsed === null) {
    return null;
  }

  await withFileLock(filePath, async () => {
    await writeJsonAtomic(filePath, parsed);
  });
  return parsed;
}

async function safeLoadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  const parsed = safeParse(raw);
  if (parsed !== null) {
    return parsed;
  }

  try {
    const restored = await restoreFromLatestBackup(filePath);
    if (restored !== null) return restored;
    const error = new Error(
      `Unable to parse JSON in ${filePath}. No valid backups available.`
    );
    error.cause = new Error("Invalid JSON");
    throw error;
  } catch (err) {
    throw err;
  }
}

async function readJson(filePath, { fallback } = {}) {
  try {
    return await safeLoadJson(filePath);
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

module.exports = { readJson, writeJsonAtomic, withFileLock, safeLoadJson };
