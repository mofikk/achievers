import { NextRequest } from "next/server";
import { failure } from "../http/response";
import { getAuthContext } from "../auth/permissions";

function csvEscape(value: unknown) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>) {
  const lines = [headers.map(csvEscape).join(",")];
  rows.forEach((row) => lines.push(row.map(csvEscape).join(",")));
  return lines.join("\n");
}

function statusFromPaid(expected: number, paid: number) {
  if (expected > 0) {
    if (paid >= expected) return "paid";
    if (paid > 0) return "incomplete";
    return "pending";
  }
  return paid > 0 ? "incomplete" : "pending";
}

function downloadHeaders(filename: string, csv: string) {
  return {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(Buffer.byteLength(csv, "utf8")),
      "X-Meta": JSON.stringify({ data: { success: true, file: filename }, error: null })
    }
  };
}

export async function exportByFile(request: NextRequest, file: string) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return failure("Unauthorized", 401);
    if (!auth.permissions.view_reports) return failure("Forbidden", 403);
    const supabase = auth.supabase;

    if (file === "players.csv") {
      const { data, error } = await supabase
        .from("players")
        .select("id, full_name, nickname, position, email, member_since_year")
        .order("full_name", { ascending: true });
      if (error) return failure(error.message, 400);

      const rows = (data ?? []).map((player: any) => [
        player.id,
        player.full_name || "",
        player.nickname || "",
        player.position || "",
        player.email || "",
        player.member_since_year || ""
      ]);
      const csv = toCsv(
        ["id", "name", "nickname", "position", "email", "memberSinceYear"],
        rows
      );
      return new Response(csv, downloadHeaders("players.csv", csv));
    }

    if (file === "payments.csv") {
      const [{ data: players, error: playersError }, { data: monthlyRows, error: monthlyError }, { data: yearlyRows, error: yearlyError }] =
        await Promise.all([
          supabase.from("players").select("id, full_name, nickname").order("full_name", { ascending: true }),
          supabase.from("player_monthly_payments").select("player_id, month_key, expected_amount, paid_amount"),
          supabase.from("player_yearly_payments").select("player_id, year_key, expected_amount, paid_amount")
        ]);
      if (playersError || monthlyError || yearlyError) {
        return failure(playersError?.message || monthlyError?.message || yearlyError?.message || "Failed to export payments.", 400);
      }

      const monthlyByPlayer = new Map<string, any[]>();
      (monthlyRows ?? []).forEach((row: any) => {
        const id = String(row.player_id || "");
        if (!monthlyByPlayer.has(id)) monthlyByPlayer.set(id, []);
        monthlyByPlayer.get(id)?.push(row);
      });
      monthlyByPlayer.forEach((items) => items.sort((a, b) => String(b.month_key).localeCompare(String(a.month_key))));

      const yearlyByPlayer = new Map<string, any[]>();
      (yearlyRows ?? []).forEach((row: any) => {
        const id = String(row.player_id || "");
        if (!yearlyByPlayer.has(id)) yearlyByPlayer.set(id, []);
        yearlyByPlayer.get(id)?.push(row);
      });
      yearlyByPlayer.forEach((items) => items.sort((a, b) => String(b.year_key).localeCompare(String(a.year_key))));

      const rows = (players ?? []).map((player: any) => {
        const yearly = yearlyByPlayer.get(String(player.id || ""))?.[0] || null;
        const monthly = monthlyByPlayer.get(String(player.id || ""))?.[0] || null;
        const yearlyExpected = Number(yearly?.expected_amount) || 0;
        const yearlyPaid = Number(yearly?.paid_amount) || 0;
        const monthlyExpected = Number(monthly?.expected_amount) || 0;
        const monthlyPaid = Number(monthly?.paid_amount) || 0;
        return [
          player.id,
          player.full_name || "",
          player.nickname || "",
          yearly?.year_key || "",
          yearlyExpected,
          yearlyPaid,
          statusFromPaid(yearlyExpected, yearlyPaid),
          String(monthly?.month_key || "").slice(0, 7),
          monthlyExpected,
          monthlyPaid,
          statusFromPaid(monthlyExpected, monthlyPaid)
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
      return new Response(csv, downloadHeaders("payments.csv", csv));
    }

    if (file === "attendance.csv") {
      const { data, error } = await supabase
        .from("player_attendance")
        .select("session_date, player_id, present, players:player_id(full_name, nickname)")
        .order("session_date", { ascending: true });
      if (error) return failure(error.message, 400);

      const rows = (data ?? []).map((row: any) => [
        row.session_date || "",
        row.player_id || "",
        row.players?.full_name || "",
        row.players?.nickname || "",
        row.present === true
      ]);

      const csv = toCsv(["date", "id", "name", "nickname", "present"], rows);
      return new Response(csv, downloadHeaders("attendance.csv", csv));
    }

    if (file === "stats.csv") {
      const [{ data: rows, error }, { data: settingsRow }] = await Promise.all([
        supabase
          .from("player_stats")
          .select("player_id, goals, assists, yellow_cards, red_cards, yellow_paid_count, red_paid_count, players:player_id(full_name, nickname)")
          .order("player_id", { ascending: true }),
        supabase.from("app_settings").select("yellow_card_fine, red_card_fine").eq("id", true).maybeSingle()
      ]);
      if (error) return failure(error.message, 400);

      const yellowFine = Number(settingsRow?.yellow_card_fine) || 500;
      const redFine = Number(settingsRow?.red_card_fine) || 1000;

      const out = (rows ?? []).map((row: any) => {
        const yellow = Number(row.yellow_cards) || 0;
        const red = Number(row.red_cards) || 0;
        const yellowPaid = Number(row.yellow_paid_count) || 0;
        const redPaid = Number(row.red_paid_count) || 0;
        const yellowOwed = Math.max(0, yellow - yellowPaid);
        const redOwed = Math.max(0, red - redPaid);
        const finesOwed = yellowOwed * yellowFine + redOwed * redFine;
        const status =
          yellow + red === 0
            ? "no_cards"
            : finesOwed === 0
              ? "cleared"
              : yellowPaid + redPaid === 0
                ? "pending"
                : "incomplete";
        return [
          row.player_id,
          row.players?.full_name || "",
          row.players?.nickname || "",
          Number(row.goals) || 0,
          Number(row.assists) || 0,
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
        out
      );
      return new Response(csv, downloadHeaders("stats.csv", csv));
    }

    if (file === "visitor-stats.csv") {
      const [statsResult, { data: settingsRow }] = await Promise.all([
        supabase
          .from("visitor_stats")
          .select("visitor_id, goals, yellow_cards, red_cards, yellow_paid_count, red_paid_count, visitors:visitor_id(full_name, nickname)")
          .order("visitor_id", { ascending: true }),
        supabase.from("app_settings").select("yellow_card_fine, red_card_fine").eq("id", true).maybeSingle()
      ]);
      let rows = statsResult.data as any[] | null;
      let error = statsResult.error;
      if (error) {
        const retry = await supabase
          .from("visitor_stats")
          .select("visitor_id, yellow_cards, red_cards, yellow_paid_count, red_paid_count, visitors:visitor_id(full_name, nickname)")
          .order("visitor_id", { ascending: true });
        rows = retry.data as any[] | null;
        error = retry.error;
      }
      if (error) return failure(error.message, 400);

      const yellowFine = Number(settingsRow?.yellow_card_fine) || 500;
      const redFine = Number(settingsRow?.red_card_fine) || 1000;

      const out = (rows ?? []).map((row: any) => {
        const yellow = Number(row.yellow_cards) || 0;
        const red = Number(row.red_cards) || 0;
        const yellowPaid = Number(row.yellow_paid_count) || 0;
        const redPaid = Number(row.red_paid_count) || 0;
        const yellowOwed = Math.max(0, yellow - yellowPaid);
        const redOwed = Math.max(0, red - redPaid);
        const finesOwed = yellowOwed * yellowFine + redOwed * redFine;
        const status =
          yellow + red === 0
            ? "no_cards"
            : finesOwed === 0
              ? "cleared"
              : yellowPaid + redPaid === 0
                ? "pending"
                : "incomplete";
        return [
          row.visitor_id,
          row.visitors?.full_name || "",
          row.visitors?.nickname || "",
          Number(row.goals) || 0,
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
          "yellow",
          "red",
          "yellowPaid",
          "redPaid",
          "yellowOwed",
          "redOwed",
          "finesOwed",
          "status"
        ],
        out
      );
      return new Response(csv, downloadHeaders("visitor-stats.csv", csv));
    }

    return failure("Unsupported export file.", 400);
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Failed to export CSV.", 500);
  }
}

