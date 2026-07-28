(function () {
  const totalMembersEl = document.getElementById("total-members");
  const yearlyPaidEl = document.getElementById("yearly-paid");
  const yearlyPendingEl = document.getElementById("yearly-pending");
  const monthlyPaidEl = document.getElementById("monthly-paid");
  const monthlyPendingEl = document.getElementById("monthly-pending");
  const bestAttendanceEl = document.getElementById("best-attendance");
  const activityList = document.getElementById("activity-list");
  const performersList = document.getElementById("performers-list");
  const performersEmpty = document.getElementById("performers-empty");
  const attendanceConsistencyList = document.getElementById("attendance-consistency-list");
  const attendanceConsistencyEmpty = document.getElementById("attendance-consistency-empty");

  if (
    !totalMembersEl ||
    !yearlyPaidEl ||
    !yearlyPendingEl ||
    !monthlyPaidEl ||
    !monthlyPendingEl ||
    !bestAttendanceEl ||
    !activityList ||
    !performersList ||
    !performersEmpty ||
    !attendanceConsistencyList ||
    !attendanceConsistencyEmpty
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
    leaderboards: {},
    attendanceDates: []
  };

  function formatPrimaryName(player) {
    if (!player) return "Player";
    return player.name || "Player";
  }

  function formatSecondaryMeta(player) {
    const nickname = (player?.nickname || "").trim();
    const position = (player?.position || "").trim();
    if (nickname && position) return `${nickname} | ${position}`;
    if (nickname) return nickname;
    if (position) return position;
    return "No nickname or position";
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
          position: player.position || "",
          value
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }

  function renderRankList(list, container) {
    container.innerHTML = "";

    list.forEach((item, index) => {
      const rank = String(index + 1).padStart(2, "0");
      const primaryName = formatPrimaryName(item);
      const secondaryMeta = formatSecondaryMeta(item);
      const row = document.createElement("li");
      row.className = "rank-row";
      row.innerHTML = `
        <span class="rank-number">${rank}</span>
        <span class="rank-details">
          <span class="rank-name">${primaryName}</span>
          <span class="rank-meta">${secondaryMeta}</span>
        </span>
        <span class="rank-value">${item.value}</span>
      `;
      container.appendChild(row);
    });
  }

  function renderAttendanceRankList(list, container) {
    container.innerHTML = "";

    list.forEach((item, index) => {
      const rank = String(index + 1).padStart(2, "0");
      const primaryName = formatPrimaryName(item);
      const position = (item.position || "").trim() || "No position";
      const totalMeta = `Present ${item.matchesPresent}/${item.totalMatches}`;
      const row = document.createElement("li");
      row.className = "rank-row";
      row.innerHTML = `
        <span class="rank-number">${rank}</span>
        <span class="rank-details">
          <span class="rank-name">${primaryName}</span>
          <span class="rank-meta">${position} &bull; ${totalMeta}</span>
        </span>
        <span class="rank-value">${item.value}%</span>
      `;
      container.appendChild(row);
    });
  }
  function renderLeaderboard(metric) {
    const list = state.leaderboards[metric] || [];
    performersList.innerHTML = "";
    if (!list.length) {
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

  function renderAttendanceConsistency() {
    attendanceConsistencyList.innerHTML = "";
    if (!state.attendanceDates.length) {
      attendanceConsistencyEmpty.classList.remove("hidden");
      bestAttendanceEl.textContent = "No attendance yet";
      return;
    }
    attendanceConsistencyEmpty.classList.add("hidden");

    const attendanceRows = state.players.map((player) => {
      const attendanceSummary = window.attendanceMetrics?.getPlayerAttendanceSummary
        ? window.attendanceMetrics.getPlayerAttendanceSummary(player, state.attendanceDates)
        : null;
      const matchesPresent = attendanceSummary
        ? attendanceSummary.present
        : state.attendanceDates.reduce((count, date) => {
            return count + (player?.attendance?.[date] === true ? 1 : 0);
          }, 0);
      const totalMatches = attendanceSummary ? attendanceSummary.total : state.attendanceDates.length;
      const attendancePercentage =
        totalMatches > 0 ? Math.round((matchesPresent / totalMatches) * 100) : 0;

      return {
        id: player.id,
        name: player.name || "",
        position: player.position || "",
        matchesPresent,
        totalMatches,
        attendancePercentage,
        value: attendancePercentage
      };
    });

    const sorted = attendanceRows
      .sort((a, b) => {
        if (b.attendancePercentage !== a.attendancePercentage) {
          return b.attendancePercentage - a.attendancePercentage;
        }
        if (b.matchesPresent !== a.matchesPresent) return b.matchesPresent - a.matchesPresent;
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
      .slice(0, 5);
    const best = sorted[0]?.attendancePercentage || 0;
    bestAttendanceEl.textContent = `${best}%`;
    renderAttendanceRankList(sorted, attendanceConsistencyList);
  }

  function loadDashboard() {
    if (window.clearPartialData) window.clearPartialData();
    const settingsRequest = window.apiFetch("/settings", { silent: true }).catch((error) => {
      if (window.reportPartialData) {
        window.reportPartialData(error?.message || "Settings are temporarily unavailable.");
      }
      return { data: defaultSettings };
    });
    const activityRequest = window
      .apiFetch("/activity?limit=10&page=1", { silent: true })
      .then((res) => {
        const data = res?.data || [];
        return data?.items || data || [];
      })
      .catch((error) => {
        if (window.reportPartialData) {
          window.reportPartialData(error?.message || "Activity feed is temporarily unavailable.");
        }
        return [];
      });

    Promise.all([settingsRequest, activityRequest])
      .then(([settingsRes, activity]) => {
        state.settings = settingsRes?.data || defaultSettings;
        const yearKey = String(state.settings.season || new Date().getFullYear());
        const monthKey = getCurrentMonthKey();
        return Promise.all([
          window
            .apiFetch(`/overview?yearKey=${yearKey}&monthKey=${monthKey}`, { silent: true })
            .catch((error) => {
              if (window.reportPartialData) {
                window.reportPartialData(error?.message || "Overview is temporarily unavailable.");
              }
              return { data: { counts: {
                totalMembers: 0,
                yearlyPaid: 0,
                yearlyPending: 0,
                monthlyPaid: 0,
                monthlyPending: 0
              } } };
            }),
          window.apiFetch("/players", { silent: true }).catch((error) => {
            if (window.reportPartialData) {
              window.reportPartialData(error?.message || "Players are temporarily unavailable.");
            }
            return { data: [] };
          }),
          Promise.resolve(activity)
        ]);
      })
      .then(([overviewRes, playersRes, activity]) => {
        const players = playersRes?.data || [];
        const overview = overviewRes?.data || {};
        state.players = players;
        state.attendanceDates = getAttendanceDates(players);
        renderCards(overview.counts || {
          totalMembers: 0,
          yearlyPaid: 0,
          yearlyPending: 0,
          monthlyPaid: 0,
          monthlyPending: 0
        });
        renderActivity(activity);
        buildLeaderboards();
        setupTabs();
        renderAttendanceConsistency();
      })
      .catch(console.error);
  }

  loadDashboard();
})();


