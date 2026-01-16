(function () {
  const sessionSelect = document.getElementById("visitor-session");
  const searchInput = document.getElementById("visitors-search");
  const countEl = document.getElementById("visitors-count");
  const body = document.getElementById("visitors-body");

  if (!sessionSelect || !searchInput || !countEl || !body) {
    return;
  }

  const defaultSettings = {
    currencySymbol: "₦",
    attendance: { startDate: "2026-01-10" },
    discipline: { yellowFine: 500, redFine: 1000 }
  };

  const state = {
    visitors: [],
    settings: defaultSettings,
    sessions: []
  };

  function formatCurrency(amount) {
    return `${state.settings.currencySymbol}${amount}`;
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

  function buildSessions() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const startDate = state.settings.attendance.startDate;
    state.sessions = buildSaturdayList(startDate, todayStr);
    sessionSelect.innerHTML = "";
    state.sessions.forEach((date) => {
      const option = document.createElement("option");
      option.value = date;
      option.textContent = date;
      sessionSelect.appendChild(option);
    });
    if (!state.sessions.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No sessions yet";
      sessionSelect.appendChild(option);
    }
  }

  function computeFines(visitor) {
    const yellow = Number(visitor?.stats?.yellow) || 0;
    const red = Number(visitor?.stats?.red) || 0;
    const yellowPaid = Number(visitor?.discipline?.yellowPaid) || 0;
    const redPaid = Number(visitor?.discipline?.redPaid) || 0;
    const owedYellow = Math.max(0, yellow - yellowPaid);
    const owedRed = Math.max(0, red - redPaid);
    const fineOwed =
      owedYellow * state.settings.discipline.yellowFine +
      owedRed * state.settings.discipline.redFine;
    return { fineOwed, paidCount: yellowPaid + redPaid };
  }

  function computeStatus(totalOwed, paidTotals) {
    if (totalOwed === 0) return { text: "Cleared", className: "paid" };
    if (paidTotals === 0) return { text: "Pending", className: "pending" };
    return { text: "Incomplete", className: "incomplete" };
  }

  function renderTable(visitors) {
    body.innerHTML = "";
    const sessionDate = sessionSelect.value;
    visitors.forEach((visitor) => {
      const paid = Number(visitor?.payments?.sessions?.[sessionDate]?.paid) || 0;
      const summary = window.paymentStatus.statusFromPaid(1000, paid);
      const playOwed = summary.remaining;
      const fines = computeFines(visitor);
      const totalOwed = playOwed + fines.fineOwed;
      const status = computeStatus(totalOwed, paid + fines.paidCount);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${visitor.name || ""}</td>
        <td data-label="Nickname">${visitor.nickname || "-"}</td>
        <td data-label="Play Fee Owed">${formatCurrency(playOwed)}</td>
        <td data-label="Fines Owed">${formatCurrency(fines.fineOwed)}</td>
        <td data-label="Total Owed">${formatCurrency(totalOwed)}</td>
        <td data-label="Status"><span class="pill ${status.className}">${status.text}</span></td>
      `;
      body.appendChild(row);
    });
    countEl.textContent = `Showing ${visitors.length} of ${state.visitors.length} visitors`;
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = state.visitors.filter((visitor) => {
      const name = String(visitor.name || "").toLowerCase();
      const nickname = String(visitor.nickname || "").toLowerCase();
      return !query || name.includes(query) || nickname.includes(query);
    });
    renderTable(filtered);
  }

  function loadData() {
    Promise.all([
      window.apiFetch("/settings").catch(() => defaultSettings),
      window.apiFetch("/visitors")
    ])
      .then(([settings, visitors]) => {
        state.settings = settings || defaultSettings;
        state.visitors = visitors || [];
        buildSessions();
        applyFilters();
      })
      .catch(console.error);
  }

  sessionSelect.addEventListener("change", applyFilters);
  searchInput.addEventListener("input", applyFilters);

  loadData();
})();
