(function () {
  const totalMembersEl = document.getElementById("total-members");
  const yearlyPaidEl = document.getElementById("yearly-paid");
  const yearlyPendingEl = document.getElementById("yearly-pending");
  const monthlyPaidEl = document.getElementById("monthly-paid");
  const monthlyPendingEl = document.getElementById("monthly-pending");
  const bestAttendanceEl = document.getElementById("best-attendance");
  const performersList = document.getElementById("performers-list");
  const performersEmpty = document.getElementById("performers-empty");
  const attendanceConsistencyList = document.getElementById("attendance-consistency-list");
  const attendanceConsistencyEmpty = document.getElementById("attendance-consistency-empty");
  const performanceIndexScore = document.getElementById("performance-index-score");
  const performanceIndexWidget = document.getElementById("performance-index-widget");
  const performanceIndexEmpty = document.getElementById("performance-index-empty");
  const contributionIndexScore = document.getElementById("contribution-index-score");
  const contributionIndexWidget = document.getElementById("contribution-index-widget");
  const contributionIndexEmpty = document.getElementById("contribution-index-empty");

  if (
    !totalMembersEl ||
    !yearlyPaidEl ||
    !yearlyPendingEl ||
    !monthlyPaidEl ||
    !monthlyPendingEl ||
    !bestAttendanceEl ||
    !performersList ||
    !performersEmpty ||
    !attendanceConsistencyList ||
    !attendanceConsistencyEmpty ||
    !performanceIndexScore ||
    !performanceIndexWidget ||
    !performanceIndexEmpty ||
    !contributionIndexScore ||
    !contributionIndexWidget ||
    !contributionIndexEmpty
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
    attendanceDates: [],
    indexes: null
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
      .slice(0, 8);
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
      .slice(0, 8);
    const best = sorted[0]?.attendancePercentage || 0;
    bestAttendanceEl.textContent = `${best}%`;
    renderAttendanceRankList(sorted, attendanceConsistencyList);
  }

  function formatDecimal(value) {
    return (Number(value) || 0).toFixed(2);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderIndexWidget(options) {
    const { ranking, scoreEl, widgetEl, emptyEl, scoreKey, metrics } = options;
    widgetEl.innerHTML = "";
    const topPlayer = ranking[0];
    if (!topPlayer) {
      scoreEl.textContent = "0 / 100";
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");
    const score = Number(topPlayer[scoreKey]) || 0;
    scoreEl.textContent = `${score} / 100`;

    const hero = document.createElement("div");
    hero.className = "analytics-primary";
    hero.innerHTML = `
      <div class="analytics-player-row">
        <div>
          <div class="analytics-player-name">${escapeHtml(topPlayer.name || "Player")}</div>
          <div class="rank-meta">${escapeHtml(topPlayer.position || "No position")}</div>
        </div>
        <strong>${score} / 100</strong>
      </div>
      <div class="analytics-progress" aria-label="${score} out of 100">
        <span style="width: ${Math.min(score, 100)}%"></span>
      </div>
      <div class="analytics-metrics">
        ${metrics(topPlayer)
          .map((item) => `<span><strong>${escapeHtml(item.label)}</strong>${escapeHtml(item.value)}</span>`)
          .join("")}
      </div>
    `;
    widgetEl.appendChild(hero);

    const compactList = document.createElement("div");
    compactList.className = "analytics-rank-list";
    ranking.slice(1, 4).forEach((player, index) => {
      const row = document.createElement("div");
      row.className = "analytics-rank-row";
      const rowScore = Number(player[scoreKey]) || 0;
      row.innerHTML = `
        <span>${String(index + 2).padStart(2, "0")}</span>
        <span>${escapeHtml(player.name || "Player")}</span>
        <strong>${rowScore}</strong>
      `;
      compactList.appendChild(row);
    });
    if (compactList.children.length) widgetEl.appendChild(compactList);
  }

  function renderAnalytics() {
    if (!window.playerIndexes?.buildPlayerIndexes) return;
    const monthKey = getCurrentMonthKey();
    const yearKey = String(state.settings.season || new Date().getFullYear());
    state.indexes = window.playerIndexes.buildPlayerIndexes(
      state.players,
      state.settings,
      state.attendanceDates,
      { yearKey, monthKey }
    );

    renderIndexWidget({
      ranking: state.indexes.rankings.performance,
      scoreEl: performanceIndexScore,
      widgetEl: performanceIndexWidget,
      emptyEl: performanceIndexEmpty,
      scoreKey: "performanceIndex",
      metrics: (player) => [
        { label: "Goals", value: player.metrics.goals },
        { label: "Goals/App", value: formatDecimal(player.metrics.goalsPerAppearance) },
        { label: "Attendance", value: `${player.metrics.attendancePercentage}%` }
      ]
    });

    renderIndexWidget({
      ranking: state.indexes.rankings.contribution,
      scoreEl: contributionIndexScore,
      widgetEl: contributionIndexWidget,
      emptyEl: contributionIndexEmpty,
      scoreKey: "contributionIndex",
      metrics: (player) => [
        { label: "Attendance", value: `${player.metrics.attendancePercentage}%` },
        { label: "Monthly Payments", value: `${player.metrics.monthlyPaymentPercentage}%` },
        { label: "Yearly Payments", value: `${player.metrics.yearlyPaymentPercentage}%` }
      ]
    });
  }

  function loadDashboard() {
    if (window.clearPartialData) window.clearPartialData();
    const settingsRequest = window.apiFetch("/settings", { silent: true }).catch((error) => {
      if (window.reportPartialData) {
        window.reportPartialData(error?.message || "Settings are temporarily unavailable.");
      }
      return { data: defaultSettings };
    });
    Promise.all([settingsRequest])
      .then(([settingsRes]) => {
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
          })
        ]);
      })
      .then(([overviewRes, playersRes]) => {
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
        buildLeaderboards();
        setupTabs();
        renderAttendanceConsistency();
        renderAnalytics();
      })
      .catch(console.error);
  }

  loadDashboard();
})();


