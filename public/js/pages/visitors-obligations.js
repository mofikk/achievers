(function () {
  const yearSelect = document.getElementById("visitor-obligation-year");
  const monthSelect = document.getElementById("visitor-obligation-month");
  const searchInput = document.getElementById("visitors-search");
  const countEl = document.getElementById("visitors-count");
  const body = document.getElementById("visitors-body");

  if (!yearSelect || !monthSelect || !searchInput || !countEl || !body) {
    return;
  }

  const defaultSettings = {
    currencySymbol: "\u20a6",
    fees: { visitorSessionFee: 1000 },
    attendance: { startDate: "2026-01-10", playableDayOfWeek: 6 },
    discipline: { yellowFine: 500, redFine: 1000 }
  };

  const state = {
    visitors: [],
    settings: defaultSettings,
    sessions: [],
    years: [],
    selectedYear: null,
    selectedMonth: null,
    sortKey: "status",
    sortDir: "desc"
  };

  function formatCurrency(amount) {
    return `${state.settings.currencySymbol}${amount}`;
  }

  function getPlayableDayOfWeek() {
    const value = Number(state.settings?.attendance?.playableDayOfWeek);
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : 6;
  }

  function getVisitorSessionFee() {
    const value = Number(state.settings?.fees?.visitorSessionFee);
    return Number.isFinite(value) && value >= 0 ? value : 1000;
  }

  function buildSessionList(startDate, endDate) {
    const dates = [];
    const cursor = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return dates;
    const playableDay = getPlayableDayOfWeek();
    const toDateKey = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    while (cursor.getDay() !== playableDay) {
      cursor.setDate(cursor.getDate() + 1);
    }

    while (cursor <= end) {
      dates.push(toDateKey(cursor));
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }

  function getNowYear() {
    return String(new Date().getFullYear());
  }

  function getNowMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function populateSelect(selectEl, options, selected) {
    selectEl.innerHTML = "";
    options.forEach((option) => {
      const opt = document.createElement("option");
      opt.value = option;
      opt.textContent = option;
      if (option === selected) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function getMonthsForYear(yearKey) {
    const safeYear = Number(yearKey);
    if (!Number.isInteger(safeYear) || safeYear < 1970) return [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const maxMonth = safeYear < currentYear ? 12 : safeYear === currentYear ? now.getMonth() + 1 : 0;
    if (maxMonth <= 0) return [];

    const months = [];
    for (let month = 1; month <= maxMonth; month += 1) {
      months.push(`${safeYear}-${String(month).padStart(2, "0")}`);
    }
    return months;
  }

  function syncMonthFilterForYear(yearKey, preferredMonth) {
    const monthsForYear = getMonthsForYear(yearKey);
    const selectedMonth = monthsForYear.includes(preferredMonth)
      ? preferredMonth
      : monthsForYear[monthsForYear.length - 1] || "";
    populateSelect(monthSelect, monthsForYear, selectedMonth);
    state.selectedMonth = selectedMonth || null;
  }

  function getSessionDatesForMonth(monthKey) {
    if (!monthKey) return [];
    return state.sessions.filter((dateKey) => dateKey.startsWith(`${monthKey}-`));
  }

  function buildTimeline() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const configuredStart = String(state.settings?.attendance?.startDate || "").slice(0, 10);
    const fallbackStart = `${new Date().getFullYear()}-01-01`;
    const startDate = /^\d{4}-\d{2}-\d{2}$/.test(configuredStart) ? configuredStart : fallbackStart;
    state.sessions = buildSessionList(startDate, todayStr);

    const startYear = Number(startDate.slice(0, 4));
    const currentYear = new Date().getFullYear();
    const yearStart = Number.isInteger(startYear) ? startYear : currentYear;
    const years = [];
    for (let year = yearStart; year <= currentYear; year += 1) {
      years.push(String(year));
    }

    state.years = years.length ? years : [getNowYear()];
    state.selectedYear = state.years[state.years.length - 1] || getNowYear();
    state.selectedMonth = getNowMonth();

    populateSelect(yearSelect, state.years, state.selectedYear);
    syncMonthFilterForYear(state.selectedYear, state.selectedMonth);
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
    if (totalOwed === 0) return { text: "CLEARED", className: "paid" };
    if (paidTotals === 0) return { text: "PENDING", className: "pending" };
    return { text: "INCOMPLETE", className: "incomplete" };
  }

  function renderTable(visitors) {
    body.innerHTML = "";
    const monthKey = monthSelect.value || state.selectedMonth;
    const sessionDates = getSessionDatesForMonth(monthKey);
    const sessionFee = getVisitorSessionFee();

    const rows = visitors.map((visitor) => {
      let expected = 0;
      let paid = 0;
      sessionDates.forEach((dateKey) => {
        if (visitor?.attendance?.[dateKey] === true) {
          expected += sessionFee;
        }
        paid += Number(visitor?.payments?.sessions?.[dateKey]?.paid) || 0;
      });
      const summary = window.paymentStatus.statusFromPaid(expected, paid);
      const playOwed = summary.remaining;
      const fines = computeFines(visitor);
      const totalOwed = playOwed + fines.fineOwed;
      const status = computeStatus(totalOwed, paid + fines.paidCount);
      return {
        visitor,
        playOwed,
        finesOwed: fines.fineOwed,
        totalOwed,
        status
      };
    });

    const statusRank = {
      CLEARED: 0,
      INCOMPLETE: 1,
      PENDING: 2
    };

    if (state.sortKey === "status") {
      const dir = state.sortDir === "asc" ? 1 : -1;
      rows.sort((a, b) => {
        const rankA = statusRank[a.status.text] ?? 0;
        const rankB = statusRank[b.status.text] ?? 0;
        if (rankA !== rankB) return (rankA > rankB ? 1 : -1) * dir;
        if (a.totalOwed !== b.totalOwed) return b.totalOwed - a.totalOwed;
        return String(a.visitor.name || "").localeCompare(String(b.visitor.name || ""));
      });
    }

    rows.forEach((rowData) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${rowData.visitor.name || ""}</td>
        <td data-label="Nickname">${rowData.visitor.nickname || "-"}</td>
        <td data-label="Play Fee Owed">${formatCurrency(rowData.playOwed)}</td>
        <td data-label="Fines Owed">${formatCurrency(rowData.finesOwed)}</td>
        <td data-label="Total Owed">${formatCurrency(rowData.totalOwed)}</td>
        <td data-label="Status"><span class="pill ${rowData.status.className}">${rowData.status.text}</span></td>
      `;
      body.appendChild(row);
    });
    countEl.textContent = `Showing ${rows.length} of ${state.visitors.length} visitors`;
    setSortIndicator();
  }

  function setSortIndicator() {
    document.querySelectorAll("th.sortable").forEach((th) => {
      const key = th.getAttribute("data-key");
      th.classList.toggle("active", !!state.sortKey && key === state.sortKey);
      th.setAttribute(
        "data-direction",
        !!state.sortKey && key === state.sortKey ? state.sortDir : ""
      );
    });
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
      window.apiFetch("/settings").catch(() => ({ data: defaultSettings })),
      window.apiFetch("/visitors")
    ])
      .then(([settingsRes, visitorsRes]) => {
        state.settings = settingsRes?.data || defaultSettings;
        state.visitors = Array.isArray(visitorsRes?.data) ? visitorsRes.data : [];
        buildTimeline();
        applyFilters();
      })
      .catch(console.error);
  }

  yearSelect.addEventListener("change", () => {
    state.selectedYear = yearSelect.value || state.selectedYear;
    syncMonthFilterForYear(state.selectedYear, monthSelect.value || state.selectedMonth);
    applyFilters();
  });
  monthSelect.addEventListener("change", () => {
    state.selectedMonth = monthSelect.value || state.selectedMonth;
    applyFilters();
  });
  searchInput.addEventListener("input", applyFilters);
  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-key");
      if (!key) return;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "desc";
      }
      applyFilters();
    });
  });

  loadData();
})();
