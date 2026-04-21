(function () {
  const rangeSelect = document.getElementById("summary-range");
  const searchInput = document.getElementById("summary-search");
  const countEl = document.getElementById("summary-count");
  const topPercentEl = document.getElementById("summary-top-percent");
  const topStreaksEl = document.getElementById("summary-top-streaks");
  const body = document.getElementById("summary-body");

  if (
    !rangeSelect ||
    !searchInput ||
    !countEl ||
    !topPercentEl ||
    !topStreaksEl ||
    !body
  ) {
    return;
  }

  const defaultSettings = {
    attendance: { startDate: "2026-01-10" }
  };

  const state = {
    players: [],
    settings: defaultSettings,
    attendanceDates: []
  };

  function toLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function formatDisplayName(player) {
    return player.nickname ? `${player.name} (${player.nickname})` : player.name;
  }

  function buildSaturdayList(startDate, endDate) {
    const startMatch = String(startDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const endMatch = String(endDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!startMatch || !endMatch) return [];

    const dates = [];
    const cursor = new Date(
      Number(startMatch[1]),
      Number(startMatch[2]) - 1,
      Number(startMatch[3])
    );
    const end = new Date(
      Number(endMatch[1]),
      Number(endMatch[2]) - 1,
      Number(endMatch[3])
    );
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return dates;

    while (cursor.getDay() !== 6) {
      cursor.setDate(cursor.getDate() + 1);
    }

    while (cursor <= end) {
      dates.push(toLocalDateKey(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }

    return dates;
  }

  function getAttendanceDates(players, settings) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const configuredStart = String(settings?.attendance?.startDate || "").slice(0, 10);
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(configuredStart)
      ? configuredStart
      : `${new Date().getFullYear()}-01-01`;

    const timeline = buildSaturdayList(startDate, todayStr);
    if (timeline.length) return timeline;

    const keys = new Set();
    (players || []).forEach((player) => {
      Object.keys(player?.attendance || {}).forEach((dateKey) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) keys.add(dateKey);
      });
    });
    return Array.from(keys).sort();
  }

  function computeStreak(player, attendanceDates) {
    if (window.attendanceMetrics?.computeAttendanceStreak) {
      return window.attendanceMetrics.computeAttendanceStreak(player, attendanceDates);
    }
    let count = 0;
    for (let i = attendanceDates.length - 1; i >= 0; i -= 1) {
      const date = attendanceDates[i];
      if (player?.attendance?.[date] === true) count += 1;
      else break;
    }
    return count;
  }

  function getAttendanceSummary(player, attendanceDates) {
    if (window.attendanceMetrics?.getPlayerAttendanceSummary) {
      return window.attendanceMetrics.getPlayerAttendanceSummary(player, attendanceDates);
    }
    const present = attendanceDates.reduce((count, date) => {
      return count + (player?.attendance?.[date] === true ? 1 : 0);
    }, 0);
    const total = attendanceDates.length;
    const attendancePercent = total > 0 ? Math.round((present / total) * 100) : 0;
    const currentStreak = computeStreak(player, attendanceDates);
    return { present, total, attendancePercent, currentStreak };
  }

  function buildRankList(list, container, formatter) {
    container.innerHTML = "";
    const maxValue = Math.max(...list.map((item) => item.value), 0);
    list.forEach((item, index) => {
      const rank =
        index === 0
          ? "🥇"
          : index === 1
            ? "🥈"
            : index === 2
              ? "🥉"
              : String(index + 1);
      const width = maxValue ? Math.round((item.value / maxValue) * 100) : 0;
      const row = document.createElement("li");
      row.className = "rank-row";
      row.innerHTML = `
        <span class="rank-icon">${rank}</span>
        <span class="rank-name">${formatDisplayName(item)}</span>
        <span class="rank-value">${formatter(item.value)}</span>
        <span class="value-bar"><span class="value-fill" style="width: ${width}%"></span></span>
      `;
      container.appendChild(row);
    });
  }

  function render() {
    const rangeValue = String(rangeSelect.value || "all");
    const search = searchInput.value.trim().toLowerCase();
    const recentAttendanceDates =
      rangeValue === "all"
        ? state.attendanceDates
        : state.attendanceDates.slice(-Math.max(1, Number(rangeValue)));
    const filtered = state.players.filter((player) => {
      const name = String(player.name || "").toLowerCase();
      const nickname = String(player.nickname || "").toLowerCase();
      return !search || name.includes(search) || nickname.includes(search);
    });

    body.innerHTML = "";
    const rows = filtered.map((player) => {
      const summary = getAttendanceSummary(player, recentAttendanceDates);
      const streak = computeStreak(player, recentAttendanceDates);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${player.name || ""}</td>
        <td data-label="Nickname">${player.nickname || "-"}</td>
        <td data-label="Present">${summary.present}</td>
        <td data-label="Total">${summary.total}</td>
        <td data-label="Attendance %">${summary.attendancePercent}%</td>
        <td data-label="Current Streak">${streak}</td>
      `;
      body.appendChild(row);

      return {
        ...player,
        value: summary.attendancePercent,
        presentCount: summary.present,
        streakValue: streak
      };
    });

    countEl.textContent = `Showing ${filtered.length} of ${state.players.length}`;

    const topPercent = [...rows]
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        if (b.presentCount !== a.presentCount) return b.presentCount - a.presentCount;
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
      .slice(0, 5);
    const topStreaks = [...rows]
      .sort((a, b) => {
        if (b.streakValue !== a.streakValue) return b.streakValue - a.streakValue;
        if (b.value !== a.value) return b.value - a.value;
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
      .slice(0, 5);
    buildRankList(topPercent, topPercentEl, (value) => `${value}%`);
    buildRankList(topStreaks, topStreaksEl, (value) => `${value}`);
  }

  function loadData() {
    if (!rangeSelect.querySelector('option[value="all"]')) {
      const option = document.createElement("option");
      option.value = "all";
      option.textContent = "All";
      rangeSelect.insertBefore(option, rangeSelect.firstChild);
    }
    rangeSelect.value = "all";

    Promise.all([
      window.apiFetch("/settings").catch(() => ({ data: defaultSettings })),
      window.apiFetch("/players")
    ])
      .then(([settingsRes, playersRes]) => {
        const players = playersRes?.data || [];
        state.settings = settingsRes?.data || defaultSettings;
        state.players = players;
        state.attendanceDates = getAttendanceDates(players, state.settings);
        render();
      })
      .catch(console.error);
  }

  rangeSelect.addEventListener("change", render);
  searchInput.addEventListener("input", render);

  loadData();
})();
