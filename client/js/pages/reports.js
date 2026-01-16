(function () {
  const monthSelect = document.getElementById("report-month");
  const yearSelect = document.getElementById("report-year");
  const monthlyTotals = document.getElementById("monthly-totals");
  const yearlyTotals = document.getElementById("yearly-totals");
  const finesTotals = document.getElementById("fines-totals");
  const monthlyBody = document.getElementById("monthly-body");
  const yearlyBody = document.getElementById("yearly-body");
  const finesBody = document.getElementById("fines-body");
  const visitorDateSelect = document.getElementById("visitor-report-date");
  const visitorsTotals = document.getElementById("visitors-totals");
  const visitorsBody = document.getElementById("visitors-body");

  if (
    !monthSelect ||
    !yearSelect ||
    !monthlyTotals ||
    !yearlyTotals ||
    !finesTotals ||
    !monthlyBody ||
    !yearlyBody ||
    !finesBody ||
    !visitorDateSelect ||
    !visitorsTotals ||
    !visitorsBody
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
    visitors: [],
    settings: defaultSettings,
    months: [],
    years: [],
    visitorSessions: []
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

  function getMonthlyExpected(monthKey) {
    return window.paymentStatus.getMonthlyExpected(state.settings, monthKey);
  }

  function computeStatus(expected, paid) {
    const status = window.paymentStatus.statusFromPaid(expected, paid).status;
    if (status === "PAID") return { text: "Cleared", className: "paid" };
    if (status === "INCOMPLETE") return { text: "Incomplete", className: "incomplete" };
    return { text: "Pending", className: "pending" };
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
      const expected = window.paymentStatus.getYearlyExpected(
        state.settings,
        player,
        yearKey
      );
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

  function renderVisitorsReport() {
    const sessionDate = visitorDateSelect.value;
    const expectedTotal = state.visitors.length * 1000;
    let collected = 0;
    visitorsBody.innerHTML = "";

    state.visitors.forEach((visitor) => {
      const paid = Number(visitor?.payments?.sessions?.[sessionDate]?.paid) || 0;
      const summary = window.paymentStatus.statusFromPaid(1000, paid);
      const remaining = summary.remaining;
      const status =
        summary.status === "PAID"
          ? { text: "Cleared", className: "paid" }
          : summary.status === "INCOMPLETE"
            ? { text: "Incomplete", className: "incomplete" }
            : { text: "Pending", className: "pending" };
      collected += Math.min(paid, 1000);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${visitor.name || ""}</td>
        <td data-label="Paid">${formatCurrency(paid)}</td>
        <td data-label="Remaining">${formatCurrency(remaining)}</td>
        <td data-label="Status"><span class="pill ${status.className}">${status.text}</span></td>
      `;
      visitorsBody.appendChild(row);
    });

    visitorsTotals.innerHTML = `
      <div class="detail-item"><span>Total Expected</span><strong>${formatCurrency(expectedTotal)}</strong></div>
      <div class="detail-item"><span>Total Collected</span><strong>${formatCurrency(collected)}</strong></div>
      <div class="detail-item"><span>Outstanding</span><strong>${formatCurrency(expectedTotal - collected)}</strong></div>
    `;
  }

  function renderAll() {
    renderMonthly();
    renderYearly();
    renderFines();
    renderVisitorsReport();
  }

  function loadData() {
    Promise.all([
      window.apiFetch("/settings").catch(() => defaultSettings),
      window.apiFetch("/players"),
      window.apiFetch("/visitors")
    ])
      .then(([settings, players, visitors]) => {
        state.settings = settings || defaultSettings;
        state.players = players;
        state.visitors = visitors || [];
        buildFilters(players);
        const latestMonth = getLatestMonth(players);
        const defaultMonth = latestMonth || "";
        const defaultYear = String(state.settings.season);
        buildOptions(monthSelect, state.months, defaultMonth);
        buildOptions(yearSelect, state.years, defaultYear);
        const todayStr = new Date().toISOString().slice(0, 10);
        state.visitorSessions = buildSaturdayList(
          state.settings.attendance.startDate,
          todayStr
        );
        buildOptions(
          visitorDateSelect,
          state.visitorSessions,
          state.visitorSessions[state.visitorSessions.length - 1] || ""
        );
        renderAll();
      })
      .catch(console.error);
  }

  monthSelect.addEventListener("change", renderAll);
  yearSelect.addEventListener("change", renderAll);
  visitorDateSelect.addEventListener("change", renderVisitorsReport);

  loadData();
})();
