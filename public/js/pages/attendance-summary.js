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
    attendance: { startDate: "2026-01-10", playableDayOfWeek: 6 }
  };

  const state = {
    players: [],
    settings: defaultSettings,
    attendanceDates: []
  };

  function formatDisplayName(player) {
    return player.nickname ? `${player.name} (${player.nickname})` : player.name;
  }

  function getAttendanceDates(players) {
    if (window.attendanceMetrics?.getAttendanceDateKeys) {
      return window.attendanceMetrics.getAttendanceDateKeys(players, 0);
    }

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
    if (!list.length) {
      container.innerHTML = '<li class="muted">No attendance records found.</li>';
      return;
    }

    const maxValue = Math.max(...list.map((item) => item.value), 0);
    list.forEach((item, index) => {
      const rank = String(index + 1);
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

  function renderEmpty() {
    body.innerHTML = '<tr><td colspan="6">No attendance records found.</td></tr>';
    countEl.textContent = `Showing 0 of ${state.players.length}`;
    buildRankList([], topPercentEl, (value) => `${value}%`);
    buildRankList([], topStreaksEl, (value) => `${value}`);
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

    if (!state.attendanceDates.length) {
      renderEmpty();
      return;
    }

    body.innerHTML = "";
    if (!filtered.length) {
      body.innerHTML = '<tr><td colspan="6">No players match your search.</td></tr>';
      countEl.textContent = `Showing 0 of ${state.players.length}`;
      buildRankList([], topPercentEl, (value) => `${value}%`);
      buildRankList([], topStreaksEl, (value) => `${value}`);
      return;
    }

    const rows = filtered.map((player) => {
      const summary = getAttendanceSummary(player, recentAttendanceDates);
      const streak = summary.currentStreak ?? computeStreak(player, recentAttendanceDates);

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

  function updateRangeLabels() {
    const options = Array.from(rangeSelect.options);
    const allOption = options.find((option) => option.value === "all");
    if (allOption) {
      allOption.textContent = `All Recorded Sessions (${state.attendanceDates.length})`;
    }

    options.forEach((option) => {
      const value = Number(option.value);
      if (!Number.isFinite(value)) return;
      option.textContent = `Last ${value} Recorded Sessions`;
    });
  }

  function loadData() {
    Promise.all([
      window.apiFetch("/settings").catch(() => ({ data: defaultSettings })),
      window.apiFetch("/players")
    ])
      .then(([settingsRes, playersRes]) => {
        state.settings = settingsRes?.data || defaultSettings;
        state.players = Array.isArray(playersRes?.data) ? playersRes.data : [];
        state.attendanceDates = getAttendanceDates(state.players);
        rangeSelect.value = "all";
        updateRangeLabels();
        render();
      })
      .catch((error) => {
        console.error(error);
        body.innerHTML = '<tr><td colspan="6">Unable to load attendance summary.</td></tr>';
        countEl.textContent = "";
        buildRankList([], topPercentEl, (value) => `${value}%`);
        buildRankList([], topStreaksEl, (value) => `${value}`);
        if (window.toast) window.toast("Unable to load attendance summary", "error");
      });
  }

  rangeSelect.addEventListener("change", render);
  searchInput.addEventListener("input", render);

  loadData();
})();
