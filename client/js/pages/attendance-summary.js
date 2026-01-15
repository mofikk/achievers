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
    saturdays: []
  };

  function formatDisplayName(player) {
    return player.nickname ? `${player.name} (${player.nickname})` : player.name;
  }

  function buildSaturdayList(startDate, endDate) {
    const dates = [];
    const cursor = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return dates;

    while (cursor.getDay() !== 6) {
      cursor.setDate(cursor.getDate() + 1);
    }

    while (cursor <= end) {
      const dateStr = cursor.toISOString().slice(0, 10);
      dates.push(dateStr);
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }

  function computeStreak(player, saturdays) {
    let count = 0;
    for (let i = saturdays.length - 1; i >= 0; i -= 1) {
      const date = saturdays[i];
      if (player?.attendance?.[date] === true) count += 1;
      else break;
    }
    return count;
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
    const range = Number(rangeSelect.value);
    const search = searchInput.value.trim().toLowerCase();
    const recentSaturdays = state.saturdays.slice(-range);
    const filtered = state.players.filter((player) => {
      const name = String(player.name || "").toLowerCase();
      const nickname = String(player.nickname || "").toLowerCase();
      return !search || name.includes(search) || nickname.includes(search);
    });

    body.innerHTML = "";
    const rows = filtered.map((player) => {
      const present = recentSaturdays.reduce((count, date) => {
        return count + (player?.attendance?.[date] === true ? 1 : 0);
      }, 0);
      const total = recentSaturdays.length;
      const percent = total ? Math.round((present / total) * 100) : 0;
      const streak = computeStreak(player, state.saturdays);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${player.name || ""}</td>
        <td data-label="Nickname">${player.nickname || "-"}</td>
        <td data-label="Present">${present}</td>
        <td data-label="Total">${total}</td>
        <td data-label="Attendance %">${percent}%</td>
        <td data-label="Current Streak">${streak}</td>
      `;
      body.appendChild(row);

      return { ...player, value: percent, streakValue: streak };
    });

    countEl.textContent = `Showing ${filtered.length} of ${state.players.length}`;

    const topPercent = [...rows]
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
    const topStreaks = [...rows]
      .sort((a, b) => b.streakValue - a.streakValue)
      .slice(0, 5);
    buildRankList(topPercent, topPercentEl, (value) => `${value}%`);
    buildRankList(topStreaks, topStreaksEl, (value) => `${value}`);
  }

  function loadData() {
    Promise.all([
      window.apiFetch("/settings").catch(() => defaultSettings),
      window.apiFetch("/players")
    ])
      .then(([settings, players]) => {
        state.settings = settings || defaultSettings;
        state.players = players;
        const todayStr = new Date().toISOString().slice(0, 10);
        state.saturdays = buildSaturdayList(
          state.settings.attendance.startDate,
          todayStr
        );
        render();
      })
      .catch(console.error);
  }

  rangeSelect.addEventListener("change", render);
  searchInput.addEventListener("input", render);

  loadData();
})();
