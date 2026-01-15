(function () {
  const yearlyPaidEl = document.getElementById("yearly-paid");
  const yearlyPendingEl = document.getElementById("yearly-pending");
  const monthlyPaidEl = document.getElementById("monthly-paid");
  const monthlyPendingEl = document.getElementById("monthly-pending");
  const activityList = document.getElementById("activity-list");
  const performersList = document.getElementById("performers-list");
  const performersEmpty = document.getElementById("performers-empty");

  if (
    !yearlyPaidEl ||
    !yearlyPendingEl ||
    !monthlyPaidEl ||
    !monthlyPendingEl ||
    !activityList ||
    !performersList ||
    !performersEmpty
  ) {
    return;
  }

  const defaultSettings = {
    fees: { monthly: 3000, newMemberYearly: 5000, renewalYearly: 2500 }
  };

  const state = {
    players: [],
    settings: defaultSettings,
    leaderboards: {}
  };

  function getMemberSinceYear(player) {
    const stored = Number(player?.membership?.memberSinceYear);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const years = Object.keys(player?.subscriptions?.year || {})
      .map((year) => Number(year))
      .filter((year) => Number.isFinite(year));
    if (years.length) {
      years.sort((a, b) => a - b);
      return years[0];
    }
    return new Date().getFullYear();
  }

  function getPaymentSummary(players) {
    const now = new Date();
    const yearKey = String(now.getFullYear());
    const monthKey = `${yearKey}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    let yearlyPaid = 0;
    let yearlyPending = 0;
    let monthlyPaid = 0;
    let monthlyPending = 0;

    players.forEach((player) => {
      const yearlyPaidValue = Number(player?.payments?.yearly?.[yearKey]?.paid) || 0;
      const monthlyPaidValue = Number(player?.payments?.monthly?.[monthKey]?.paid) || 0;
      const memberSinceYear = getMemberSinceYear(player);
      const yearlyExpected =
        Number(yearKey) === memberSinceYear
          ? state.settings.fees.newMemberYearly
          : state.settings.fees.renewalYearly;
      const monthlyExpected = state.settings.fees.monthly;

      if (yearlyPaidValue >= yearlyExpected) yearlyPaid += 1;
      else yearlyPending += 1;

      if (monthlyPaidValue >= monthlyExpected) monthlyPaid += 1;
      else monthlyPending += 1;
    });

    return { yearlyPaid, yearlyPending, monthlyPaid, monthlyPending };
  }

  function renderCards() {
    const counts = getPaymentSummary(state.players);
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

  function renderLeaderboard(metric) {
    const list = state.leaderboards[metric] || [];
    const hasValues = list.some((item) => item.value > 0);
    performersList.innerHTML = "";
    if (!hasValues) {
      performersEmpty.classList.remove("hidden");
      return;
    }
    performersEmpty.classList.add("hidden");
    list.forEach((item) => {
      const row = document.createElement("li");
      const label = item.nickname ? `${item.name} (${item.nickname})` : item.name;
      row.innerHTML = `
        <span>${label}</span>
        <span class="badge paid">${item.value}</span>
      `;
      performersList.appendChild(row);
    });
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

  function loadDashboard() {
    const playersRequest = window.apiFetch("/players");
    const settingsRequest = window.apiFetch("/settings").catch(() => defaultSettings);
    const activityRequest = window.apiFetch("/activity").catch(() => []);

    Promise.all([playersRequest, settingsRequest, activityRequest])
      .then(([players, settings, activity]) => {
        state.players = players;
        state.settings = settings || defaultSettings;
        renderCards();
        renderActivity(activity);
        buildLeaderboards();
        setupTabs();
      })
      .catch(console.error);
  }

  loadDashboard();
})();
