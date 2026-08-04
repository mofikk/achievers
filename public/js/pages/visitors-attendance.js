(function () {
  const yearSelect = document.getElementById("visitor-year");
  const monthSelect = document.getElementById("visitor-month");
  const dateSelect = document.getElementById("visitor-date");
  const searchInput = document.getElementById("visitor-search");
  const markPresentBtn = document.getElementById("mark-present");
  const markAbsentBtn = document.getElementById("mark-absent");
  const saveBtn = document.getElementById("save-attendance");
  const summaryEl = document.getElementById("visitor-summary");
  const hintEl = document.getElementById("visitor-hint");
  const body = document.getElementById("visitor-body");

  if (
    !yearSelect ||
    !monthSelect ||
    !dateSelect ||
    !searchInput ||
    !markPresentBtn ||
    !markAbsentBtn ||
    !saveBtn ||
    !summaryEl ||
    !hintEl ||
    !body
  ) {
    return;
  }

  const defaultSettings = {
    attendance: { startDate: "2026-01-10", lockFuture: true, playableDayOfWeek: 6 }
  };

  const state = {
    visitors: [],
    settings: defaultSettings,
    sessions: [],
    filtered: [],
    years: [],
    selectedYear: null,
    selectedMonth: null
  };

  function getPlayableDayOfWeek() {
    const value = Number(state.settings?.attendance?.playableDayOfWeek);
    return Number.isInteger(value) && value >= 0 && value <= 6 ? value : 6;
  }

  function buildSaturdayList(startDate, endDate) {
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
      const dateStr = toDateKey(cursor);
      dates.push(dateStr);
      cursor.setDate(cursor.getDate() + 7);
    }
    return dates;
  }

  function getMonthsFromSessions(sessions) {
    const months = new Set();
    sessions.forEach((date) => months.add(date.slice(0, 7)));
    return Array.from(months).sort();
  }

  function getNowYear() {
    return String(new Date().getFullYear());
  }

  function getNowMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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

  function isFutureDate(dateStr) {
    const selected = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selected.getTime() > today.getTime();
  }

  function updateSummary() {
    const selectedDate = dateSelect.value;
    let present = 0;
    let absent = 0;
    state.filtered.forEach((visitor) => {
      const checked = visitor?.attendance?.[selectedDate] === true;
      if (checked) present += 1;
      else absent += 1;
    });
    summaryEl.textContent = `Present: ${present} | Absent: ${absent}`;
  }

  function renderTable() {
    body.innerHTML = "";
    const selectedDate = dateSelect.value;
    state.filtered.forEach((visitor) => {
      const checked = visitor?.attendance?.[selectedDate] === true;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${visitor.name || ""}</td>
        <td>${visitor.nickname || "-"}</td>
        <td>
          <input class="attendance-toggle" type="checkbox" data-id="${visitor.id}" ${
            checked ? "checked" : ""
          } />
        </td>
      `;
      body.appendChild(row);
    });
    updateSummary();
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    state.filtered = state.visitors.filter((visitor) => {
      const name = String(visitor.name || "").toLowerCase();
      const nickname = String(visitor.nickname || "").toLowerCase();
      return !query || name.includes(query) || nickname.includes(query);
    });
    renderTable();
  }

  function updateSessions() {
    const monthKey = monthSelect.value;
    const sessions = state.sessions.filter((date) => date.startsWith(monthKey));
    populateSelect(dateSelect, sessions, sessions[sessions.length - 1] || "");
  }

  function syncMonthFilterForYear(yearKey, preferredMonth) {
    const monthsForYear = getMonthsForYear(yearKey);
    const selectedMonth = monthsForYear.includes(preferredMonth)
      ? preferredMonth
      : monthsForYear[monthsForYear.length - 1] || "";
    populateSelect(monthSelect, monthsForYear, selectedMonth);
    state.selectedMonth = selectedMonth || null;
    updateSessions();
  }

  function toggleFutureLock() {
    const selectedDate = dateSelect.value;
    if (!selectedDate) return;
    const lockFuture = state.settings.attendance.lockFuture !== false;
    const future = lockFuture && isFutureDate(selectedDate);
    const toggles = body.querySelectorAll("input[type=\"checkbox\"]");
    toggles.forEach((input) => {
      input.disabled = future;
    });
    markPresentBtn.disabled = future;
    markAbsentBtn.disabled = future;
    saveBtn.disabled = future;
    hintEl.textContent = future
      ? "This date is in the future. Attendance can only be recorded after the match."
      : "";
  }

  function loadData() {
    Promise.all([
      window.apiFetch("/settings").catch(() => ({ data: defaultSettings })),
      window.apiFetch("/visitors")
    ])
      .then(([settingsRes, visitorsRes]) => {
        state.settings = settingsRes?.data || defaultSettings;
        state.visitors = Array.isArray(visitorsRes?.data) ? visitorsRes.data : [];
        const todayStr = new Date().toISOString().slice(0, 10);
        const configuredStart = String(state.settings?.attendance?.startDate || "").slice(0, 10);
        const fallbackStart = `${new Date().getFullYear()}-01-01`;
        const startDate = /^\d{4}-\d{2}-\d{2}$/.test(configuredStart) ? configuredStart : fallbackStart;
        state.sessions = buildSaturdayList(startDate, todayStr);
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
        applyFilters();
        toggleFutureLock();
      })
      .catch(console.error);
  }

  body.addEventListener("change", (event) => {
    const target = event.target;
    if (target.type !== "checkbox") return;
    const id = target.getAttribute("data-id");
    const visitor = state.visitors.find((item) => item.id === id);
    if (!visitor) return;
    if (!visitor.attendance) visitor.attendance = {};
    visitor.attendance[dateSelect.value] = target.checked;
    updateSummary();
  });

  markPresentBtn.addEventListener("click", () => {
    const toggles = body.querySelectorAll("input[type=\"checkbox\"]");
    toggles.forEach((toggle) => {
      if (!toggle.disabled) toggle.checked = true;
    });
    state.visitors.forEach((visitor) => {
      if (!visitor.attendance) visitor.attendance = {};
      visitor.attendance[dateSelect.value] = true;
    });
    updateSummary();
  });

  markAbsentBtn.addEventListener("click", () => {
    const toggles = body.querySelectorAll("input[type=\"checkbox\"]");
    toggles.forEach((toggle) => {
      if (!toggle.disabled) toggle.checked = false;
    });
    state.visitors.forEach((visitor) => {
      if (!visitor.attendance) visitor.attendance = {};
      visitor.attendance[dateSelect.value] = false;
    });
    updateSummary();
  });

  saveBtn.addEventListener("click", () => {
    const selectedDate = dateSelect.value;
    if (!selectedDate) return;
    const previousLabel = saveBtn.textContent;
    window.setActionButtonLoading?.(saveBtn, true, "Saving...", previousLabel || "Save");
    const updates = state.visitors.map((visitor) => ({
      id: visitor.id,
      present: visitor?.attendance?.[selectedDate] === true
    }));
    window
      .apiFetch(`/visitors/attendance/${selectedDate}`, {
        method: "PATCH",
        body: JSON.stringify({ updates })
      })
      .then(() => {
        window.toast("Attendance saved", "success");
      })
      .catch((err) => {
        window.toast(err.message || "Unable to save attendance.", "error");
      })
      .finally(() => {
        window.setActionButtonLoading?.(saveBtn, false, "Saving...", previousLabel || "Save");
      });
  });

  yearSelect.addEventListener("change", () => {
    state.selectedYear = yearSelect.value || state.selectedYear;
    syncMonthFilterForYear(state.selectedYear, monthSelect.value || state.selectedMonth);
    applyFilters();
    toggleFutureLock();
  });

  monthSelect.addEventListener("change", () => {
    updateSessions();
    state.selectedMonth = monthSelect.value || state.selectedMonth;
    applyFilters();
    toggleFutureLock();
  });

  dateSelect.addEventListener("change", () => {
    applyFilters();
    toggleFutureLock();
  });

  searchInput.addEventListener("input", applyFilters);

  loadData();
})();
