(function () {
  const totalMembersEl = document.getElementById("total-members");
  const yearlyPaidEl = document.getElementById("yearly-paid");
  const yearlyPendingEl = document.getElementById("yearly-pending");
  const monthlyPaidEl = document.getElementById("monthly-paid");
  const monthlyPendingEl = document.getElementById("monthly-pending");
  const bestStreakEl = document.getElementById("best-streak");
  const activityList = document.getElementById("activity-list");
  const performersList = document.getElementById("performers-list");
  const performersEmpty = document.getElementById("performers-empty");
  const streaksList = document.getElementById("streaks-list");
  const streaksEmpty = document.getElementById("streaks-empty");

  if (
    !totalMembersEl ||
    !yearlyPaidEl ||
    !yearlyPendingEl ||
    !monthlyPaidEl ||
    !monthlyPendingEl ||
    !bestStreakEl ||
    !activityList ||
    !performersList ||
    !performersEmpty ||
    !streaksList ||
    !streaksEmpty
  ) {
    return;
  }

  const defaultSettings = {
    season: new Date().getFullYear(),
    attendance: { startDate: "2026-01-10" }
  };

  const state = {
    players: [],
    settings: defaultSettings,
    leaderboards: {}
  };

  function formatDisplayName(player) {
    if (!player) return "Player";
    return player.nickname ? `${player.name} (${player.nickname})` : player.name;
  }

  function getCurrentMonthKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
  }

  function renderCards(counts) {
    totalMembersEl.textContent = counts.totalMembers;
    yearlyPaidEl.textContent = counts.yearlyPaid;
    yearlyPendingEl.textContent = counts.yearlyPending;
    monthlyPaidEl.textContent = counts.monthlyPaid;
    monthlyPendingEl.textContent = counts.monthlyPending;
  }

  function formatRelativeTime(timestamp) {
    const diffMs = Date.now() - timestamp;
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function renderActivity(activity) {
    activityList.innerHTML = "";
    if (!activity.length) {
      const item = document.createElement("li");
      item.textContent = "No recent activity yet.";
      activityList.appendChild(item);
      return;
    }

    activity.forEach((entry) => {
      const item = document.createElement("li");
      const time = formatRelativeTime(entry.timestamp);
      item.textContent = `${entry.message} • ${time}`;
      activityList.appendChild(item);
    });
  }

  function getTopList(players, metric) {
    return players
      .map((player) => {
        const stats = player.stats || {};
        const goals = Number(stats.goals) || 0;
        const assists = Number(stats.assists) || 0;
        const yellow = Number(stats.yellow) || 0;
        const red = Number(stats.red) || 0;
        const value =
          metric === "goals"
            ? goals
            : metric === "assists"
              ? assists
              : metric === "ga"
                ? goals + assists
                : metric === "yellow"
                  ? yellow
                  : red;
        return {
          id: player.id,
          name: player.name || "",
          nickname: player.nickname || "",
          value
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }

  function renderRankList(list, container) {
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
      const label = formatDisplayName(item);
      const width = maxValue ? Math.round((item.value / maxValue) * 100) : 0;
      const row = document.createElement("li");
      row.className = "rank-row";
      row.innerHTML = `
        <span class="rank-icon">${rank}</span>
        <span class="rank-name">${label}</span>
        <span class="rank-value">${item.value}</span>
        <span class="value-bar"><span class="value-fill" style="width: ${width}%"></span></span>
      `;
      container.appendChild(row);
    });
  }

  function renderLeaderboard(metric) {
    const list = state.leaderboards[metric] || [];
    const hasValues = list.some((item) => item.value > 0);
    performersList.innerHTML = "";
    if (!hasValues) {
      performersEmpty.classList.remove("hidden");
      return;
    }
    performersEmpty.classList.add("hidden");
    renderRankList(list, performersList);
  }

  function setupTabs() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((btn) => btn.classList.remove("active"));
        tab.classList.add("active");
        renderLeaderboard(tab.dataset.tab);
      });
    });
  }

  function buildLeaderboards() {
    state.leaderboards = {
      goals: getTopList(state.players, "goals"),
      assists: getTopList(state.players, "assists"),
      ga: getTopList(state.players, "ga"),
      yellow: getTopList(state.players, "yellow"),
      red: getTopList(state.players, "red")
    };
    renderLeaderboard("goals");
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

  function getLatestAttendanceDate(players) {
    let latest = null;
    players.forEach((player) => {
      Object.keys(player?.attendance || {}).forEach((date) => {
        if (!latest || date > latest) {
          latest = date;
        }
      });
    });
    return latest;
  }

  function renderStreaks() {
    streaksList.innerHTML = "";
    const hasAttendance = state.players.some(
      (player) => Object.keys(player?.attendance || {}).length > 0
    );

    if (!hasAttendance) {
      streaksEmpty.classList.remove("hidden");
      bestStreakEl.textContent = "No attendance yet";
      return;
    }
    streaksEmpty.classList.add("hidden");

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const latestAttendance = getLatestAttendanceDate(state.players) || todayStr;
    const endDate = latestAttendance > todayStr ? latestAttendance : todayStr;
    const startDate = state.settings.attendance.startDate;
    const saturdays = buildSaturdayList(startDate, endDate);
    if (!saturdays.length) {
      streaksEmpty.classList.remove("hidden");
      bestStreakEl.textContent = "No attendance yet";
      return;
    }

    const latestSaturday = [...saturdays]
      .reverse()
      .find((date) => date <= todayStr);
    if (!latestSaturday) {
      streaksEmpty.classList.remove("hidden");
      bestStreakEl.textContent = "No attendance yet";
      return;
    }

    const streaks = state.players.map((player) => {
      let count = 0;
      for (let i = saturdays.length - 1; i >= 0; i -= 1) {
        const date = saturdays[i];
        if (date > latestSaturday) continue;
        if (player?.attendance?.[date] === true) count += 1;
        else break;
      }
      return {
        id: player.id,
        name: player.name || "",
        nickname: player.nickname || "",
        value: count
      };
    });

    const sorted = streaks.sort((a, b) => b.value - a.value).slice(0, 5);
    const best = sorted[0]?.value || 0;
    bestStreakEl.textContent = `${best} weeks`;
    renderRankList(sorted, streaksList);
  }

  function loadDashboard() {
    const settingsRequest = window.apiFetch("/settings").catch(() => defaultSettings);
    const activityRequest = window.apiFetch("/activity").catch(() => []);

    Promise.all([settingsRequest, activityRequest])
      .then(([settings, activity]) => {
        state.settings = settings || defaultSettings;
        const yearKey = String(state.settings.season || new Date().getFullYear());
        const monthKey = getCurrentMonthKey();
        return Promise.all([
          window.apiFetch(`/overview?yearKey=${yearKey}&monthKey=${monthKey}`),
          window.apiFetch("/players"),
          Promise.resolve(activity)
        ]);
      })
      .then(([overview, players, activity]) => {
        state.players = players;
        renderCards(overview.counts);
        renderActivity(activity);
        buildLeaderboards();
        setupTabs();
        renderStreaks();
      })
      .catch(console.error);
  }

  loadDashboard();
})();
