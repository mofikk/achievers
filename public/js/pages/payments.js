(function () {
  const body = document.getElementById("payments-body");
  const modal = document.getElementById("payments-modal");
  const modalTitleName = document.getElementById("payments-player-name");
  const memberSinceLabel = document.getElementById("member-since-label");
  const errorEl = document.getElementById("payments-error");
  const closeBtn = document.getElementById("payments-close");
  const saveBtn = document.getElementById("payments-save");

  const yearlyYear = document.getElementById("yearly-year");
  const yearlyExpected = document.getElementById("yearly-expected");
  const yearlyPaid = document.getElementById("yearly-paid");
  const yearlyRemaining = document.getElementById("yearly-remaining");
  const yearlyStatus = document.getElementById("yearly-status");

  const monthlyYear = document.getElementById("monthly-year");
  const monthlyMonth = document.getElementById("monthly-month");
  const monthlyExpected = document.getElementById("monthly-expected");
  const monthlyPaid = document.getElementById("monthly-paid");
  const monthlyRemaining = document.getElementById("monthly-remaining");
  const monthlyStatus = document.getElementById("monthly-status");
  const yearFilter = document.getElementById("payments-year");
  const monthFilter = document.getElementById("payments-month");
  const searchInput = document.getElementById("payments-search");
  const countEl = document.getElementById("payments-count");
  const yearlyExpectedLabel = document.getElementById("yearly-expected-label");
  const yearlyPaidLabel = document.getElementById("yearly-paid-label");
  const yearlyRemainingLabel = document.getElementById("yearly-remaining-label");
  const monthlyExpectedLabel = document.getElementById("monthly-expected-label");
  const monthlyPaidLabel = document.getElementById("monthly-paid-label");
  const monthlyRemainingLabel = document.getElementById("monthly-remaining-label");
  const addPlayerBtn = document.getElementById("add-player-payments");

  if (
    !body ||
    !modal ||
    !modalTitleName ||
    !errorEl ||
    !memberSinceLabel ||
    !closeBtn ||
    !saveBtn ||
    !yearlyYear ||
    !yearlyExpected ||
    !yearlyPaid ||
    !yearlyRemaining ||
    !yearlyStatus ||
    !monthlyYear ||
    !monthlyMonth ||
    !monthlyExpected ||
    !monthlyPaid ||
    !monthlyRemaining ||
    !monthlyStatus ||
    !yearFilter ||
    !monthFilter ||
    !searchInput ||
    !countEl ||
    !yearlyExpectedLabel ||
    !yearlyPaidLabel ||
    !yearlyRemainingLabel ||
    !monthlyExpectedLabel ||
    !monthlyPaidLabel ||
    !monthlyRemainingLabel ||
    !addPlayerBtn
  ) {
    return;
  }

  const defaultSettings = {
    currencySymbol: "\u20a6",
    fees: {
      monthlySchedule: [
        { from: "2026-01", amount: 2000 },
        { from: "2026-02", amount: 3000 }
      ],
      newMemberYearly: 5000,
      renewalYearly: 2500
    }
  };

  const state = {
    players: [],
    allPlayers: [],
    paymentRecords: [],
    selectedId: null,
    yearKey: null,
    monthKey: null,
    years: [],
    months: [],
    settings: defaultSettings,
    sortKey: null,
    sortDir: "asc"
  };

  function getMonthlyExpected(monthKey) {
    return window.paymentStatus.getMonthlyExpected(state.settings, monthKey);
  }

  function getNowYear() {
    return String(new Date().getFullYear());
  }

  function getNowMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function deriveLatestYear(players) {
    const years = [];
    players.forEach((player) => {
      Object.keys(player?.payments?.yearly || {}).forEach((key) => {
        if (/^\d{4}$/.test(String(key))) years.push(String(key));
      });
      Object.keys(player?.payments?.monthly || {}).forEach((key) => {
        const safeKey = String(key).slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(safeKey)) {
          years.push(safeKey.slice(0, 4));
        }
      });
    });
    years.sort();
    return years[years.length - 1] || getNowYear();
  }

  function deriveLatestMonthForYear(players, yearKey) {
    const months = getMonthsForYear(yearKey);
    return months[months.length - 1] || "";
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

    return Number(getNowYear());
  }

  function updateMemberSinceLabel(player, selectedYear) {
    const memberSinceYear =
      Number(player?.membership?.memberSinceYear) || Number(getNowYear());
    const label =
      Number(selectedYear) === memberSinceYear ? "New member year" : "Renewal";
    memberSinceLabel.textContent = `Member since: ${memberSinceYear} (${label})`;
  }

  function deriveStatus(expected, paid) {
    const status = window.paymentStatus.statusFromPaid(expected, paid).status;
    return status === "PAID" ? "paid" : status === "INCOMPLETE" ? "incomplete" : "pending";
  }

  function formatStatusLabel(status) {
    return status.toUpperCase();
  }

  function getYearlyPayment(player, yearKey) {
    const yearly = player?.payments?.yearly?.[yearKey];
    const expected = window.paymentStatus.getYearlyExpected(state.settings, player, yearKey);
    return {
      expected,
      paid: Number.isFinite(Number(yearly?.paid)) ? Number(yearly.paid) : 0
    };
  }

  function getMonthlyPayment(player, monthKey) {
    const monthly = player?.payments?.monthly?.[monthKey];
    return {
      expected: getMonthlyExpected(monthKey),
      paid: Number.isFinite(Number(monthly?.paid)) ? Number(monthly.paid) : 0
    };
  }

  function renderBadge(status) {
    return `<span class="badge ${status}">${formatStatusLabel(status)}</span>`;
  }

  function statusRank(status) {
    const rank = {
      paid: 0,
      incomplete: 1,
      pending: 2
    };
    return rank[status] ?? 99;
  }

  function sortPlayersByStatus(players) {
    if (!state.sortKey) return [...players];

    const dir = state.sortDir === "asc" ? 1 : -1;
    return [...players].sort((a, b) => {
      const yearlyA = getYearlyPayment(a, yearFilter.value || state.yearKey);
      const monthlyA = getMonthlyPayment(a, monthFilter.value || state.monthKey);
      const yearlyB = getYearlyPayment(b, yearFilter.value || state.yearKey);
      const monthlyB = getMonthlyPayment(b, monthFilter.value || state.monthKey);

      const yearlyStatusA = deriveStatus(yearlyA.expected, yearlyA.paid);
      const monthlyStatusA = deriveStatus(monthlyA.expected, monthlyA.paid);
      const yearlyStatusB = deriveStatus(yearlyB.expected, yearlyB.paid);
      const monthlyStatusB = deriveStatus(monthlyB.expected, monthlyB.paid);

      const valueA =
        state.sortKey === "yearlyStatus"
          ? statusRank(yearlyStatusA)
          : statusRank(monthlyStatusA);
      const valueB =
        state.sortKey === "yearlyStatus"
          ? statusRank(yearlyStatusB)
          : statusRank(monthlyStatusB);

      if (valueA !== valueB) return (valueA > valueB ? 1 : -1) * dir;

      return String(a.name || "").localeCompare(String(b.name || ""));
    });
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

  function renderTable(players) {
    const sortedPlayers = sortPlayersByStatus(players);
    body.innerHTML = "";
    sortedPlayers.forEach((player) => {
      const yearly = getYearlyPayment(player, yearFilter.value || state.yearKey);
      const monthly = getMonthlyPayment(player, monthFilter.value || state.monthKey);
      const yearlyStatusText = deriveStatus(yearly.expected, yearly.paid);
      const monthlyStatusText = deriveStatus(monthly.expected, monthly.paid);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${player.name || ""}</td>
        <td data-label="Nickname">${player.nickname || "-"}</td>
        <td data-label="Yearly">${renderBadge(yearlyStatusText)}</td>
        <td data-label="Monthly">${renderBadge(monthlyStatusText)}</td>
        <td data-label="Actions">
          <div class="actions">
            <button class="action-btn" data-id="${player.id}">View</button>
          </div>
        </td>
      `;
      body.appendChild(row);
    });

    countEl.textContent = `Showing ${sortedPlayers.length} of ${state.allPlayers.length} players`;
    setSortIndicator();
  }

  function buildAvailableKeys(players) {
    const yearSet = new Set([getNowYear()]);
    const monthSet = new Set([getNowMonth()]);
    players.forEach((player) => {
      Object.keys(player?.payments?.yearly || {}).forEach((key) => yearSet.add(key));
      Object.keys(player?.subscriptions?.year || {}).forEach((key) => yearSet.add(key));
      Object.keys(player?.payments?.monthly || {}).forEach((key) => monthSet.add(key));
      Object.keys(player?.subscriptions?.months || {}).forEach((key) => monthSet.add(key));
    });

    state.years = Array.from(yearSet).sort();
    state.months = Array.from(monthSet).sort();
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
    populateSelect(monthFilter, monthsForYear, selectedMonth);
    state.monthKey = selectedMonth || null;
  }

  function updateYearlyPreview() {
    const expected = Math.max(0, Number(yearlyExpected.value || 0));
    const paid = Math.max(0, Number(yearlyPaid.value || 0));
    const remaining = Math.max(0, expected - paid);
    const status = deriveStatus(expected, paid);
    yearlyRemaining.value = String(remaining);
    yearlyStatus.textContent = formatStatusLabel(status);
    yearlyStatus.className = `badge ${status}`;
  }

  function updateMonthlyPreview() {
    const expected = Math.max(0, Number(monthlyExpected.value || 0));
    const paid = Math.max(0, Number(monthlyPaid.value || 0));
    const remaining = Math.max(0, expected - paid);
    const status = deriveStatus(expected, paid);
    monthlyRemaining.value = String(remaining);
    monthlyStatus.textContent = formatStatusLabel(status);
    monthlyStatus.className = `badge ${status}`;
  }

  function fillModal(player) {
    modalTitleName.textContent = player.name || "";
    errorEl.textContent = "";

    const yearValue = yearFilter.value || state.yearKey;
    const monthValue = monthFilter.value || state.monthKey;

    populateSelect(yearlyYear, state.years, yearValue);
    populateSelect(monthlyYear, state.years, yearValue);

    const monthsForYear = getMonthsForYear(yearValue);
    const preferredMonth = monthsForYear.includes(monthValue)
      ? monthValue
      : monthsForYear[monthsForYear.length - 1];
    populateSelect(monthlyMonth, monthsForYear, preferredMonth);

    const yearly = getYearlyPayment(player, yearlyYear.value);
    const monthly = getMonthlyPayment(player, monthlyMonth.value);

    yearlyExpected.value = String(yearly.expected);
    yearlyPaid.value = String(yearly.paid);
    monthlyExpected.value = String(monthly.expected);
    monthlyPaid.value = String(monthly.paid);

    updateMemberSinceLabel(player, yearlyYear.value);
    updateYearlyPreview();
    updateMonthlyPreview();
  }

  function openModal() {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    state.selectedId = null;
  }

  function setSaveLoading(isLoading) {
    window.setActionButtonLoading?.(saveBtn, isLoading, "Saving...", "Save");
    closeBtn.disabled = isLoading;
  }

  function buildFilters(players) {
    const yearSet = new Set([getNowYear()]);
    const monthSet = new Set();
    players.forEach((player) => {
      Object.keys(player?.payments?.yearly || {}).forEach((key) => {
        if (/^\d{4}$/.test(String(key))) yearSet.add(String(key));
      });
      Object.keys(player?.payments?.monthly || {}).forEach((key) => {
        const safeKey = String(key).slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(safeKey)) {
          monthSet.add(safeKey);
          yearSet.add(safeKey.slice(0, 4));
        }
      });
    });
    state.years = Array.from(yearSet).sort();
    state.months = Array.from(monthSet).sort();
  }

  function getRecordSortValue(record) {
    return String(record.updated_at || record.created_at || record.date || "");
  }

  function toMonthlyKey(record) {
    if (record.month_key) return String(record.month_key);
    if (record.month) return String(record.month);
    if (record.date) return String(record.date).slice(0, 7);
    return "";
  }

  function toYearlyKey(record) {
    if (record.year_key) return String(record.year_key);
    if (record.year) return String(record.year);
    if (record.date) return String(record.date).slice(0, 4);
    return "";
  }

  function hydratePlayersWithPayments(players, records) {
    const yearlyMap = new Map();
    const monthlyMap = new Map();

    (records || []).forEach((record) => {
      const playerId = String(record.player_id || "");
      if (!playerId) return;
      const amount = Number(record.amount) || 0;
      if (record.type === "yearly") {
        const key = toYearlyKey(record);
        if (!key) return;
        const idKey = `${playerId}:${key}`;
        const current = yearlyMap.get(idKey);
        if (!current || getRecordSortValue(record) >= getRecordSortValue(current.__source || {})) {
          yearlyMap.set(idKey, { paid: amount, __source: record });
        }
      }
      if (record.type === "monthly") {
        const key = toMonthlyKey(record);
        if (!key) return;
        const idKey = `${playerId}:${key}`;
        const current = monthlyMap.get(idKey);
        if (!current || getRecordSortValue(record) >= getRecordSortValue(current.__source || {})) {
          monthlyMap.set(idKey, { paid: amount, __source: record });
        }
      }
    });

    return (players || []).map((player) => {
      const id = String(player.id || "");
      const yearly = {};
      const monthly = {};

      yearlyMap.forEach((value, key) => {
        if (!key.startsWith(`${id}:`)) return;
        const yearKey = key.slice(id.length + 1);
        yearly[yearKey] = { paid: Number(value.paid) || 0 };
      });

      monthlyMap.forEach((value, key) => {
        if (!key.startsWith(`${id}:`)) return;
        const monthKey = key.slice(id.length + 1);
        monthly[monthKey] = { paid: Number(value.paid) || 0 };
      });

      return {
        ...player,
        payments: {
          yearly,
          monthly
        }
      };
    });
  }

  function setLoadingState() {
    body.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
  }

  async function loadPlayers() {
    setLoadingState();
    if (window.clearPartialData) window.clearPartialData();
    try {
      const paymentsRequest = window.apiFetch("/payments", { silent: true }).catch((error) => {
        if (window.reportPartialData) {
          window.reportPartialData(error?.message || "Payments are temporarily unavailable.");
        }
        return { data: [] };
      });
      const [playersResponse, paymentsResponse] = await Promise.all([
        window.apiFetch("/players", { silent: true }).catch((error) => {
          if (window.reportPartialData) {
            window.reportPartialData(error?.message || "Players are temporarily unavailable.");
          }
          return { data: [] };
        }),
        paymentsRequest
      ]);

      const players = Array.isArray(playersResponse?.data) ? playersResponse.data : [];
      const paymentRecords = Array.isArray(paymentsResponse?.data) ? paymentsResponse.data : [];
      const hydrated = hydratePlayersWithPayments(players, paymentRecords);
      state.paymentRecords = paymentRecords;
      state.players = hydrated;
      state.allPlayers = hydrated;
      state.yearKey = deriveLatestYear(hydrated);
      state.monthKey = deriveLatestMonthForYear(hydrated, state.yearKey);
      buildFilters(hydrated);
      populateSelect(yearFilter, state.years, state.yearKey);
      syncMonthFilterForYear(state.yearKey, state.monthKey);
      renderTable(hydrated);
    } catch (error) {
      console.error(error);
      body.innerHTML = "";
      if (window.toast) window.toast(error.message || "Unable to load payments.", "error");
    }
  }

  function setCurrencyLabels() {
    const symbol = state.settings.currencySymbol || "";
    const suffix = symbol ? ` (${symbol})` : "";
    yearlyExpectedLabel.textContent = `Expected${suffix}`;
    yearlyPaidLabel.textContent = `Paid${suffix}`;
    yearlyRemainingLabel.textContent = `Remaining${suffix}`;
    monthlyExpectedLabel.textContent = `Expected${suffix}`;
    monthlyPaidLabel.textContent = `Paid${suffix}`;
    monthlyRemainingLabel.textContent = `Remaining${suffix}`;
  }

  async function loadSettings() {
    try {
      const response = await window.apiFetch("/settings", { silent: true });
      state.settings = response?.data || defaultSettings;
      setCurrencyLabels();
    } catch (error) {
      if (window.reportPartialData) {
        window.reportPartialData(error?.message || "Settings are temporarily unavailable.");
      }
      state.settings = defaultSettings;
      setCurrencyLabels();
    }
  }

  body.addEventListener("click", (event) => {
    const target = event.target;
    if (!target.classList.contains("action-btn")) return;
    const playerId = target.getAttribute("data-id");
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return;
    state.selectedId = playerId;
    fillModal(player);
    openModal();
  });

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-key");
      if (!key) return;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "asc";
      }
      renderTable(state.allPlayers);
    });
  });

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      renderTable(state.allPlayers);
      return;
    }
    const filtered = state.allPlayers.filter((player) => {
      const name = String(player.name || "").toLowerCase();
      const nickname = String(player.nickname || "").toLowerCase();
      return name.includes(query) || nickname.includes(query);
    });
    renderTable(filtered);
  });

  yearFilter.addEventListener("change", () => {
    syncMonthFilterForYear(yearFilter.value, monthFilter.value);
    renderTable(state.allPlayers);
  });

  monthFilter.addEventListener("change", () => {
    renderTable(state.allPlayers);
  });

  addPlayerBtn.addEventListener("click", () => {
    window.location.href = "/players.html";
  });

  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  yearlyYear.addEventListener("change", () => {
    const player = state.players.find((p) => p.id === state.selectedId);
    if (!player) return;
    const yearly = getYearlyPayment(player, yearlyYear.value);
    yearlyExpected.value = String(yearly.expected);
    yearlyPaid.value = String(yearly.paid);
    updateMemberSinceLabel(player, yearlyYear.value);
    updateYearlyPreview();
  });

  monthlyYear.addEventListener("change", () => {
    const player = state.players.find((p) => p.id === state.selectedId);
    if (!player) return;
    const monthsForYear = getMonthsForYear(monthlyYear.value);
    populateSelect(monthlyMonth, monthsForYear, monthsForYear[monthsForYear.length - 1]);
    const monthly = getMonthlyPayment(player, monthlyMonth.value);
    monthlyExpected.value = String(monthly.expected);
    monthlyPaid.value = String(monthly.paid);
    updateMonthlyPreview();
  });

  monthlyMonth.addEventListener("change", () => {
    const player = state.players.find((p) => p.id === state.selectedId);
    if (!player) return;
    const monthly = getMonthlyPayment(player, monthlyMonth.value);
    monthlyExpected.value = String(monthly.expected);
    monthlyPaid.value = String(monthly.paid);
    updateMonthlyPreview();
  });

  yearlyExpected.addEventListener("input", updateYearlyPreview);
  yearlyPaid.addEventListener("input", updateYearlyPreview);
  monthlyExpected.addEventListener("input", updateMonthlyPreview);
  monthlyPaid.addEventListener("input", updateMonthlyPreview);

  saveBtn.addEventListener("click", () => {
    const player = state.players.find((p) => p.id === state.selectedId);
    if (!player) return;

    const yearKey = yearlyYear.value;
    const monthKey = monthlyMonth.value;
    const yearlyExpectedValue = getYearlyPayment(player, yearKey).expected;
    const yearlyPaidValue = Math.max(0, Number(yearlyPaid.value || 0));
    const monthlyExpectedValue = getMonthlyExpected(monthKey);
    const monthlyPaidValue = Math.max(0, Number(monthlyPaid.value || 0));

    errorEl.textContent = "";
    setSaveLoading(true);

    Promise.all([
      window.apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          player_id: player.id,
          amount: yearlyPaidValue,
          type: "yearly",
          year_key: yearKey,
          date: `${yearKey}-01-01`
        })
      }),
      window.apiFetch("/payments", {
        method: "POST",
        body: JSON.stringify({
          player_id: player.id,
          amount: monthlyPaidValue,
          type: "monthly",
          month_key: monthKey,
          date: `${monthKey}-01`
        })
      })
    ])
      .then(() => {
        closeModal();
        return loadPlayers();
      })
      .catch((err) => {
        console.error(err);
        errorEl.textContent = err.message || "Unable to save payments.";
      })
      .finally(() => {
        setSaveLoading(false);
      });
  });

  loadSettings().finally(loadPlayers);
})();
