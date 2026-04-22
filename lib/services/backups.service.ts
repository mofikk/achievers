import fs from "node:fs/promises";
import path from "node:path";

type BackupType = "db" | "settings";

const BACKUP_DIR = path.join(process.cwd(), "server", "backups");

async function ensureBackupDir() {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function fileNameFor(type: BackupType) {
  return `${type}-${nowStamp()}.json`;
}

async function readTable(supabase: any, table: string, select = "*") {
  const { data, error } = await supabase.from(table).select(select);
  if (error) {
    throw new Error(`${table}: ${error.message}`);
  }
  return data ?? [];
}

async function buildDbSnapshot(supabase: any) {
  const [
    players,
    playerStats,
    playerMonthlyPayments,
    playerYearlyPayments,
    playerAttendance,
    visitors,
    visitorStats,
    visitorSessionPayments,
    visitorAttendance,
    notes,
    activityLogs
  ] = await Promise.all([
    readTable(supabase, "players"),
    readTable(supabase, "player_stats"),
    readTable(supabase, "player_monthly_payments"),
    readTable(supabase, "player_yearly_payments"),
    readTable(supabase, "player_attendance"),
    readTable(supabase, "visitors"),
    readTable(supabase, "visitor_stats"),
    readTable(supabase, "visitor_session_payments"),
    readTable(supabase, "visitor_attendance"),
    readTable(supabase, "notes"),
    readTable(supabase, "activity_logs")
  ]);

  return {
    meta: {
      type: "db",
      createdAt: new Date().toISOString()
    },
    data: {
      players,
      player_stats: playerStats,
      player_monthly_payments: playerMonthlyPayments,
      player_yearly_payments: playerYearlyPayments,
      player_attendance: playerAttendance,
      visitors,
      visitor_stats: visitorStats,
      visitor_session_payments: visitorSessionPayments,
      visitor_attendance: visitorAttendance,
      notes,
      activity_logs: activityLogs
    }
  };
}

async function buildSettingsSnapshot(supabase: any) {
  const [appSettings, monthlyFeeSchedule] = await Promise.all([
    readTable(supabase, "app_settings"),
    readTable(supabase, "monthly_fee_schedule")
  ]);

  return {
    meta: {
      type: "settings",
      createdAt: new Date().toISOString()
    },
    data: {
      app_settings: appSettings,
      monthly_fee_schedule: monthlyFeeSchedule
    }
  };
}

export async function createBackup(supabase: any, type: BackupType) {
  await ensureBackupDir();
  const payload = type === "db" ? await buildDbSnapshot(supabase) : await buildSettingsSnapshot(supabase);

  const fileName = fileNameFor(type);
  const fullPath = path.join(BACKUP_DIR, fileName);
  const raw = JSON.stringify(payload, null, 2);
  await fs.writeFile(fullPath, raw, "utf8");

  return {
    fileName,
    fullPath,
    sizeBytes: Buffer.byteLength(raw, "utf8"),
    createdAt: new Date().toISOString(),
    type
  };
}

export async function listBackups() {
  await ensureBackupDir();
  const entries = await fs.readdir(BACKUP_DIR, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const fullPath = path.join(BACKUP_DIR, entry.name);
        const stats = await fs.stat(fullPath);
        const match = entry.name.match(/^(db|settings)-/);
        const type = (match?.[1] || "db") as BackupType;
        return {
          name: entry.name,
          fullPath,
          type,
          sizeBytes: stats.size,
          updatedAt: stats.mtime.toISOString()
        };
      })
  );

  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return files;
}

export async function getLatestBackup(type: BackupType) {
  const backups = await listBackups();
  return backups.find((item) => item.type === type) || null;
}

export { BACKUP_DIR };
