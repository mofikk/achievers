(function () {
  const monthSelect = document.getElementById("obligation-month");
  const yearSelect = document.getElementById("obligation-year");
  const searchInput = document.getElementById("obligation-search");
  const countEl = document.getElementById("obligation-count");
  const body = document.getElementById("obligation-body");

  if (!monthSelect || !yearSelect || !searchInput || !countEl || !body) {
    return;
  }

  const defaultSettings = {
    season: new Date().getFullYear(),
    currencySymbol: "\u20a6",
    fees: {
      monthlySchedule: [
        { from: "2026-01", amount: 2000 },
        { from: "2026-02", amount: 3000 }
      ],
      newMemberYearly: 5000,
      renewalYearly: 2500
    },
    discipline: { yellowFine: 500, redFine: 1000 }
  };

  const state = {
    players: [],
    settings: defaultSettings,
    months: [],
    years: []
  };

  function formatCurrency(amount) {
    return `${state.settings.currencySymbol}${amount}`;
  }

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
    return state.settings.season;
  }

  function getLatestMonth(players) {
    const keys = [];
    players.forEach((player) => {
      Object.keys(player?.payments?.monthly || {}).forEach((key) => keys.push(key));
      Object.keys(player?.subscriptions?.months || {}).forEach((key) => keys.push(key));
    });
    keys.sort();
    return keys[keys.length - 1] || "";
  }

  function getMonthlyExpected(monthKey) {
    const schedule = state.settings.fees.monthlySchedule || [];
    if (!schedule.length) return 0;
    const sorted = [...schedule].sort((a, b) => a.from.localeCompare(b.from));
    let candidate = sorted[0].amount;
    sorted.forEach((item) => {
      if (item.from <= monthKey) candidate = item.amount;
    });
    return candidate;
  }

  function buildFilters(players) {
    const monthSet = new Set();
    const yearSet = new Set([String(state.settings.season)]);
    players.forEach((player) => {
      Object.keys(player?.payments?.monthly || {}).forEach((key) => monthSet.add(key));
      Object.keys(player?.subscriptions?.months || {}).forEach((key) => monthSet.add(key));
      Object.keys(player?.payments?.yearly || {}).forEach((key) => yearSet.add(key));
      Object.keys(player?.subscriptions?.year || {}).forEach((key) => yearSet.add(key));
    });
    state.months = Array.from(monthSet).sort();
    state.years = Array.from(yearSet).sort();
  }

  function populateSelect(select, options, selected) {
    select.innerHTML = "";
    options.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option;
      opt.textContent = option;
      if (option === selected) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function getFineSummary(player) {
    const stats = player.stats || {};
    const discipline = player.discipline || {};
    const yellow = Number(stats.yellow) || 0;
    const red = Number(stats.red) || 0;
    const yellowPaid = Number(discipline.yellowPaid) || 0;
    const redPaid = Number(discipline.redPaid) || 0;
    const owedYellow = Math.max(0, yellow - yellowPaid);
    const owedRed = Math.max(0, red - redPaid);
    const fineOwed =
      owedYellow * state.settings.discipline.yellowFine +
      owedRed * state.settings.discipline.redFine;
    return {
      owedYellow,
      owedRed,
      fineOwed,
      paidCount: yellowPaid + redPaid
    };
  }

  function computeStatus(totalOwed, paidTotals) {
    if (totalOwed === 0) return { text: "Cleared", className: "paid" };
    if (paidTotals === 0) return { text: "Pending", className: "pending" };
    return { text: "Incomplete", className: "incomplete" };
  }

  function renderTable(players) {
    body.innerHTML = "";
    const monthKey = monthSelect.value;
    const yearKey = yearSelect.value;

    const rows = players.map((player) => {
      const memberSinceYear = getMemberSinceYear(player);
      const yearlyExpected =
        Number(yearKey) === memberSinceYear
          ? state.settings.fees.newMemberYearly
          : state.settings.fees.renewalYearly;
      const yearlyPaid = Number(player?.payments?.yearly?.[yearKey]?.paid) || 0;
      const yearlyOwed = Math.max(0, yearlyExpected - yearlyPaid);

      const monthlyExpected = getMonthlyExpected(monthKey);
      const monthlyPaid = Number(player?.payments?.monthly?.[monthKey]?.paid) || 0;
      const monthlyOwed = Math.max(0, monthlyExpected - monthlyPaid);

      const fines = getFineSummary(player);
      const totalOwed = monthlyOwed + yearlyOwed + fines.fineOwed;
      const status = computeStatus(
        totalOwed,
        yearlyPaid + monthlyPaid + fines.paidCount
      );

      return {
        player,
        yearlyOwed,
        monthlyOwed,
        fines,
        totalOwed,
        status
      };
    });

    const statusRank = {
      Pending: 3,
      Incomplete: 2,
      Cleared: 1
    };

    rows.sort((a, b) => {
      const rankA = statusRank[a.status.text] || 0;
      const rankB = statusRank[b.status.text] || 0;
      if (rankA !== rankB) return rankB - rankA;
      if (a.totalOwed !== b.totalOwed) return b.totalOwed - a.totalOwed;
      return String(a.player.name || "").localeCompare(String(b.player.name || ""));
    });

    rows.forEach((rowData) => {
      const player = rowData.player;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${player.name || ""}</td>
        <td data-label="Nickname">${player.nickname || "-"}</td>
        <td data-label="Monthly Owed">${formatCurrency(rowData.monthlyOwed)}</td>
        <td data-label="Yearly Owed">${formatCurrency(rowData.yearlyOwed)}</td>
        <td data-label="Fines Owed">${formatCurrency(rowData.fines.fineOwed)}</td>
        <td data-label="Total Owed">${formatCurrency(rowData.totalOwed)}</td>
        <td data-label="Status"><span class="pill ${rowData.status.className}">${rowData.status.text}</span></td>
        <td data-label="Actions">
          <div class="actions">
            <a class="action-btn" href="profile.html?id=${player.id}">View Profile</a>
          </div>
        </td>
      `;
      body.appendChild(row);
    });

    countEl.textContent = `Showing ${rows.length} of ${state.players.length}`;
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = state.players.filter((player) => {
      const name = String(player.name || "").toLowerCase();
      const nickname = String(player.nickname || "").toLowerCase();
      return !query || name.includes(query) || nickname.includes(query);
    });
    renderTable(filtered);
  }

  function loadData() {
    const settingsRequest = window.apiFetch("/settings").catch(() => defaultSettings);
    const playersRequest = window.apiFetch("/players");

    Promise.all([settingsRequest, playersRequest])
      .then(([settings, players]) => {
        state.settings = settings || defaultSettings;
        state.players = players;
        buildFilters(players);
        const latestMonth = getLatestMonth(players);
        const defaultMonth = latestMonth || "";
        const defaultYear = String(state.settings.season || new Date().getFullYear());

        populateSelect(monthSelect, state.months, defaultMonth);
        populateSelect(yearSelect, state.years, defaultYear);
        applyFilters();
      })
      .catch(console.error);
  }

  monthSelect.addEventListener("change", applyFilters);
  yearSelect.addEventListener("change", applyFilters);
  searchInput.addEventListener("input", applyFilters);

  loadData();
})();
