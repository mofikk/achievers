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
    !monthlyRemainingLabel
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
    selectedId: null,
    yearKey: null,
    monthKey: null,
    years: [],
    months: [],
    settings: defaultSettings
  };

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

  function getNowYear() {
    return String(new Date().getFullYear());
  }

  function getNowMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }

  function getLatestKey(players, field, fallback) {
    const keys = [];
    players.forEach((player) => {
      const payments = player?.payments?.[field] || {};
      const subscriptions = field === "yearly"
        ? player?.subscriptions?.year || {}
        : player?.subscriptions?.months || {};
      Object.keys(payments).forEach((key) => keys.push(key));
      Object.keys(subscriptions).forEach((key) => keys.push(key));
    });
    keys.sort();
    return keys[keys.length - 1] || fallback;
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
    const memberSinceYear = getMemberSinceYear(player);
    const label =
      Number(selectedYear) === memberSinceYear ? "New member year" : "Renewal";
    memberSinceLabel.textContent = `Member since: ${memberSinceYear} (${label})`;
  }

  function deriveStatus(expected, paid) {
    const expectedNum = Number(expected);
    const paidNum = Number(paid);
    if (expectedNum <= 0) {
      return paidNum > 0 ? "incomplete" : "pending";
    }
    if (paidNum >= expectedNum) return "paid";
    if (paidNum > 0) return "incomplete";
    return "pending";
  }

  function formatStatusLabel(status) {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  function getYearlyPayment(player, yearKey) {
    const yearly = player?.payments?.yearly?.[yearKey];
    const memberSinceYear = getMemberSinceYear(player);
    const expected =
      Number(yearKey) === memberSinceYear
        ? state.settings.fees.newMemberYearly
        : state.settings.fees.renewalYearly;
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

  function renderTable(players) {
    body.innerHTML = "";
    players.forEach((player) => {
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

    countEl.textContent = `Showing ${players.length} of ${state.allPlayers.length} players`;
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
    const months = state.months.filter((key) => key.startsWith(`${yearKey}-`));
    if (months.length) return months;
    return [`${yearKey}-01`];
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

  function buildFilters(players) {
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

  function loadPlayers() {
    return window
      .apiFetch("/players")
      .then((players) => {
        state.players = players;
        state.allPlayers = players;
        state.yearKey = getLatestKey(players, "yearly", getNowYear());
        state.monthKey = getLatestKey(players, "monthly", getNowMonth());
        buildFilters(players);
        populateSelect(yearFilter, state.years, state.yearKey);
        populateSelect(monthFilter, state.months, state.monthKey);
        renderTable(players);
      })
      .catch(console.error);
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

  function loadSettings() {
    return window
      .apiFetch("/settings")
      .then((settings) => {
        state.settings = settings;
        setCurrencyLabels();
      })
      .catch(() => {
        state.settings = defaultSettings;
        setCurrencyLabels();
      });
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
    renderTable(state.allPlayers);
  });

  monthFilter.addEventListener("change", () => {
    renderTable(state.allPlayers);
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

    window
      .apiFetch(`/players/${player.id}/payments`, {
        method: "PATCH",
        body: JSON.stringify({
          yearKey,
          monthKey,
          yearly: { expected: yearlyExpectedValue, paid: yearlyPaidValue },
          monthly: { expected: monthlyExpectedValue, paid: monthlyPaidValue }
        })
      })
      .then(() => {
        closeModal();
        return loadPlayers();
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to save payments.";
      });
  });

  loadSettings().finally(loadPlayers);
})();
