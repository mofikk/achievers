(function () {
  const monthSelect = document.getElementById("report-month");
  const yearSelect = document.getElementById("report-year");
  const monthlyTotals = document.getElementById("monthly-totals");
  const yearlyTotals = document.getElementById("yearly-totals");
  const finesTotals = document.getElementById("fines-totals");
  const monthlyBody = document.getElementById("monthly-body");
  const yearlyBody = document.getElementById("yearly-body");
  const finesBody = document.getElementById("fines-body");

  if (
    !monthSelect ||
    !yearSelect ||
    !monthlyTotals ||
    !yearlyTotals ||
    !finesTotals ||
    !monthlyBody ||
    !yearlyBody ||
    !finesBody
  ) {
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

  function buildOptions(select, options, selected) {
    select.innerHTML = "";
    options.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option;
      opt.textContent = option;
      if (option === selected) opt.selected = true;
      select.appendChild(opt);
    });
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

  function buildFilters(players) {
    const months = new Set();
    const years = new Set([String(state.settings.season)]);
    players.forEach((player) => {
      Object.keys(player?.payments?.monthly || {}).forEach((key) => months.add(key));
      Object.keys(player?.subscriptions?.months || {}).forEach((key) => months.add(key));
      Object.keys(player?.payments?.yearly || {}).forEach((key) => years.add(key));
      Object.keys(player?.subscriptions?.year || {}).forEach((key) => years.add(key));
    });
    state.months = Array.from(months).sort();
    state.years = Array.from(years).sort();
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

  function computeStatus(expected, paid) {
    if (paid >= expected) return { text: "Cleared", className: "paid" };
    if (paid === 0) return { text: "Pending", className: "pending" };
    return { text: "Incomplete", className: "incomplete" };
  }

  function renderMonthly() {
    const monthKey = monthSelect.value;
    const monthlyExpected = getMonthlyExpected(monthKey);
    const expectedTotal = state.players.length * monthlyExpected;
    let collected = 0;

    monthlyBody.innerHTML = "";
    state.players.forEach((player) => {
      const paid = Number(player?.payments?.monthly?.[monthKey]?.paid) || 0;
      const remaining = Math.max(0, monthlyExpected - paid);
      const status = computeStatus(monthlyExpected, paid);
      collected += Math.min(paid, monthlyExpected);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${player.name || ""}</td>
        <td data-label="Paid">${formatCurrency(paid)}</td>
        <td data-label="Remaining">${formatCurrency(remaining)}</td>
        <td data-label="Status"><span class="pill ${status.className}">${status.text}</span></td>
      `;
      monthlyBody.appendChild(row);
    });

    monthlyTotals.innerHTML = `
      <div class="detail-item"><span>Total Expected</span><strong>${formatCurrency(expectedTotal)}</strong></div>
      <div class="detail-item"><span>Total Collected</span><strong>${formatCurrency(collected)}</strong></div>
      <div class="detail-item"><span>Outstanding</span><strong>${formatCurrency(expectedTotal - collected)}</strong></div>
    `;
  }

  function renderYearly() {
    const yearKey = yearSelect.value;
    let expectedTotal = 0;
    let collected = 0;

    yearlyBody.innerHTML = "";
    state.players.forEach((player) => {
      const memberSinceYear = getMemberSinceYear(player);
      const expected =
        Number(yearKey) === memberSinceYear
          ? state.settings.fees.newMemberYearly
          : state.settings.fees.renewalYearly;
      const paid = Number(player?.payments?.yearly?.[yearKey]?.paid) || 0;
      const remaining = Math.max(0, expected - paid);
      const status = computeStatus(expected, paid);
      expectedTotal += expected;
      collected += Math.min(paid, expected);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${player.name || ""}</td>
        <td data-label="Paid">${formatCurrency(paid)}</td>
        <td data-label="Remaining">${formatCurrency(remaining)}</td>
        <td data-label="Status"><span class="pill ${status.className}">${status.text}</span></td>
      `;
      yearlyBody.appendChild(row);
    });

    yearlyTotals.innerHTML = `
      <div class="detail-item"><span>Total Expected</span><strong>${formatCurrency(expectedTotal)}</strong></div>
      <div class="detail-item"><span>Total Collected</span><strong>${formatCurrency(collected)}</strong></div>
      <div class="detail-item"><span>Outstanding</span><strong>${formatCurrency(expectedTotal - collected)}</strong></div>
    `;
  }

  function renderFines() {
    let owedTotal = 0;
    let clearedTotal = 0;

    finesBody.innerHTML = "";
    state.players.forEach((player) => {
      const stats = player?.stats || {};
      const discipline = player?.discipline || {};
      const yellow = Number(stats.yellow) || 0;
      const red = Number(stats.red) || 0;
      const yellowPaid = Number(discipline.yellowPaid) || 0;
      const redPaid = Number(discipline.redPaid) || 0;
      const owedYellow = Math.max(0, yellow - yellowPaid);
      const owedRed = Math.max(0, red - redPaid);
      const amountOwed =
        owedYellow * state.settings.discipline.yellowFine +
        owedRed * state.settings.discipline.redFine;
      const totalCards = yellow + red;
      const paidCards = yellowPaid + redPaid;
      const status =
        totalCards === 0
          ? "No cards"
          : amountOwed === 0
            ? "Cleared"
            : paidCards === 0
              ? "Pending"
              : "Incomplete";

      const statusClass =
        status === "Cleared"
          ? "paid"
          : status === "Pending"
            ? "pending"
            : status === "Incomplete"
              ? "incomplete"
              : "neutral";

      owedTotal += amountOwed;
      const paidTotal =
        Math.min(yellowPaid, yellow) * state.settings.discipline.yellowFine +
        Math.min(redPaid, red) * state.settings.discipline.redFine;
      clearedTotal += paidTotal;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${player.name || ""}</td>
        <td data-label="Yellow Owed">${owedYellow}</td>
        <td data-label="Red Owed">${owedRed}</td>
        <td data-label="Amount Owed">${formatCurrency(amountOwed)}</td>
        <td data-label="Status"><span class="pill ${statusClass}">${status}</span></td>
      `;
      finesBody.appendChild(row);
    });

    finesTotals.innerHTML = `
      <div class="detail-item"><span>Total Owed</span><strong>${formatCurrency(owedTotal)}</strong></div>
      <div class="detail-item"><span>Total Cleared</span><strong>${formatCurrency(clearedTotal)}</strong></div>
      <div class="detail-item"><span>Outstanding</span><strong>${formatCurrency(owedTotal - clearedTotal)}</strong></div>
    `;
  }

  function renderAll() {
    renderMonthly();
    renderYearly();
    renderFines();
  }

  function loadData() {
    Promise.all([
      window.apiFetch("/settings").catch(() => defaultSettings),
      window.apiFetch("/players")
    ])
      .then(([settings, players]) => {
        state.settings = settings || defaultSettings;
        state.players = players;
        buildFilters(players);
        const latestMonth = getLatestMonth(players);
        const defaultMonth = latestMonth || "";
        const defaultYear = String(state.settings.season);
        buildOptions(monthSelect, state.months, defaultMonth);
        buildOptions(yearSelect, state.years, defaultYear);
        renderAll();
      })
      .catch(console.error);
  }

  monthSelect.addEventListener("change", renderAll);
  yearSelect.addEventListener("change", renderAll);

  loadData();
})();
