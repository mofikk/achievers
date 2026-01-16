(function () {
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
    attendance: { startDate: "2026-01-10", lockFuture: true }
  };

  const state = {
    visitors: [],
    settings: defaultSettings,
    sessions: [],
    filtered: []
  };

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

  function getMonthsFromSessions(sessions) {
    const months = new Set();
    sessions.forEach((date) => months.add(date.slice(0, 7)));
    return Array.from(months).sort();
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
    populateSelect(dateSelect, sessions, sessions[0] || "");
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
      window.apiFetch("/settings").catch(() => defaultSettings),
      window.apiFetch("/visitors")
    ])
      .then(([settings, visitors]) => {
        state.settings = settings || defaultSettings;
        state.visitors = visitors || [];
        const todayStr = new Date().toISOString().slice(0, 10);
        state.sessions = buildSaturdayList(state.settings.attendance.startDate, todayStr);
        const months = getMonthsFromSessions(state.sessions);
        populateSelect(monthSelect, months, months[months.length - 1] || "");
        updateSessions();
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
    saveBtn.disabled = true;
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
        saveBtn.disabled = false;
      });
  });

  monthSelect.addEventListener("change", () => {
    updateSessions();
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
