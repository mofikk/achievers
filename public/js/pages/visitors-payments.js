(function () {
  const yearFilter = document.getElementById("visitor-payments-year");
  const monthFilter = document.getElementById("visitor-payments-month");
  const searchInput = document.getElementById("visitors-search");
  const countEl = document.getElementById("visitors-count");
  const body = document.getElementById("visitors-body");
  const modal = document.getElementById("visitor-payment-modal");
  const modalTitle = document.getElementById("visitor-payment-title");
  const modalSessionSelect = document.getElementById("visitor-payment-session");
  const paidInput = document.getElementById("visitor-paid");
  const errorEl = document.getElementById("visitor-payment-error");
  const cancelBtn = document.getElementById("visitor-payment-cancel");
  const saveBtn = document.getElementById("visitor-payment-save");

  if (
    !yearFilter ||
    !monthFilter ||
    !searchInput ||
    !countEl ||
    !body ||
    !modal ||
    !modalTitle ||
    !modalSessionSelect ||
    !paidInput ||
    !errorEl ||
    !cancelBtn ||
    !saveBtn
  ) {
    return;
  }

  const defaultSettings = {
    season: new Date().getFullYear(),
    attendance: { startDate: "2026-01-10" }
  };

  const state = {
    visitors: [],
    settings: defaultSettings,
    sessions: [],
    years: [],
    months: [],
    selectedYear: null,
    selectedMonth: null,
    selectedId: null
  };

  function getNowYear() {
    return String(new Date().getFullYear());
  }

  function getNowMonthKey() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
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
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setDate(cursor.getDate() + 7);
    }

    return dates;
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
    return state.months.filter((key) => key.startsWith(`${yearKey}-`));
  }

  function syncMonthFilterForYear(yearKey, preferredMonth) {
    const monthsForYear = getMonthsForYear(yearKey);
    const selectedMonth = monthsForYear.includes(preferredMonth)
      ? preferredMonth
      : monthsForYear[monthsForYear.length - 1] || "";

    populateSelect(monthFilter, monthsForYear, selectedMonth);
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

    state.sessions = buildSaturdayList(startDate, todayStr);

    const yearSet = new Set();
    const monthSet = new Set();
    state.sessions.forEach((dateKey) => {
      yearSet.add(dateKey.slice(0, 4));
      monthSet.add(dateKey.slice(0, 7));
    });

    if (!yearSet.size) yearSet.add(getNowYear());
    if (!monthSet.size) monthSet.add(getNowMonthKey());

    state.years = Array.from(yearSet).sort();
    state.months = Array.from(monthSet).sort();

    const latestYear = state.years[state.years.length - 1] || getNowYear();
    const latestMonth =
      state.months.filter((key) => key.startsWith(`${latestYear}-`)).slice(-1)[0] ||
      getNowMonthKey();

    state.selectedYear = latestYear;
    state.selectedMonth = latestMonth;

    populateSelect(yearFilter, state.years, latestYear);
    syncMonthFilterForYear(latestYear, latestMonth);
  }

  function renderTable(visitors) {
    body.innerHTML = "";

    const monthKey = monthFilter.value || state.selectedMonth;
    const sessionDates = getSessionDatesForMonth(monthKey);

    visitors.forEach((visitor) => {
      let expected = 0;
      let paid = 0;
      sessionDates.forEach((dateKey) => {
        if (visitor?.attendance?.[dateKey] === true) {
          expected += 1000;
        }
        paid += Number(visitor?.payments?.sessions?.[dateKey]?.paid) || 0;
      });

      const summary = window.paymentStatus.statusFromPaid(expected, paid);
      const remaining = summary.remaining;
      const statusText =
        summary.status === "PAID"
          ? "PAID"
          : summary.status === "INCOMPLETE"
            ? "INCOMPLETE"
            : "PENDING";
      const statusClass =
        statusText === "PAID" ? "paid" : statusText === "INCOMPLETE" ? "incomplete" : "pending";

      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${visitor.name || ""}</td>
        <td data-label="Nickname">${visitor.nickname || "-"}</td>
        <td data-label="Expected">₦${expected}</td>
        <td data-label="Paid">₦${paid}</td>
        <td data-label="Remaining">₦${remaining}</td>
        <td data-label="Status"><span class="pill ${statusClass}">${statusText}</span></td>
        <td data-label="Actions">
          <div class="actions">
            <button class="action-btn" data-id="${visitor.id}">Edit</button>
          </div>
        </td>
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

  function syncModalSessionOptions(visitor) {
    const monthKey = monthFilter.value || state.selectedMonth;
    const sessionDates = getSessionDatesForMonth(monthKey);

    populateSelect(modalSessionSelect, sessionDates, sessionDates[sessionDates.length - 1] || "");

    if (!sessionDates.length) {
      modalSessionSelect.disabled = true;
      paidInput.value = "0";
      saveBtn.disabled = true;
      errorEl.textContent = "No session dates available for the selected month.";
      return;
    }

    modalSessionSelect.disabled = false;
    saveBtn.disabled = false;
    errorEl.textContent = "";
    const selectedDate = modalSessionSelect.value;
    paidInput.value = String(visitor?.payments?.sessions?.[selectedDate]?.paid || 0);
  }

  function openModal(visitor) {
    state.selectedId = visitor.id;
    modalTitle.textContent = `Update Payment: ${visitor.name || ""}`;
    syncModalSessionOptions(visitor);
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    state.selectedId = null;
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

  body.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("action-btn")) return;
    const id = target.getAttribute("data-id");
    const visitor = state.visitors.find((item) => item.id === id);
    if (visitor) openModal(visitor);
  });

  modalSessionSelect.addEventListener("change", () => {
    const visitor = state.visitors.find((item) => item.id === state.selectedId);
    if (!visitor) return;
    const selectedDate = modalSessionSelect.value;
    paidInput.value = String(visitor?.payments?.sessions?.[selectedDate]?.paid || 0);
  });

  saveBtn.addEventListener("click", () => {
    if (!state.selectedId) return;

    const sessionDate = modalSessionSelect.value;
    if (!sessionDate) {
      errorEl.textContent = "Select a session date.";
      return;
    }

    const paid = Number(paidInput.value);
    if (!Number.isFinite(paid) || paid < 0) {
      errorEl.textContent = "Paid amount must be non-negative.";
      return;
    }

    saveBtn.disabled = true;
    window
      .apiFetch(`/visitors/${state.selectedId}/payments`, {
        method: "PATCH",
        body: JSON.stringify({ sessionDate, paid })
      })
      .then(() => {
        closeModal();
        loadData();
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to save payment.";
      })
      .finally(() => {
        saveBtn.disabled = false;
      });
  });

  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  yearFilter.addEventListener("change", () => {
    state.selectedYear = yearFilter.value || state.selectedYear;
    syncMonthFilterForYear(state.selectedYear, monthFilter.value || state.selectedMonth);
    applyFilters();
  });

  monthFilter.addEventListener("change", () => {
    state.selectedMonth = monthFilter.value || state.selectedMonth;
    applyFilters();
  });

  searchInput.addEventListener("input", applyFilters);

  loadData();
})();
