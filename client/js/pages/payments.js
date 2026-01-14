(function () {
  const body = document.getElementById("payments-body");
  const modal = document.getElementById("payments-modal");
  const modalTitleName = document.getElementById("payments-player-name");
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

  if (
    !body ||
    !modal ||
    !modalTitleName ||
    !errorEl ||
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
    !monthlyStatus
  ) {
    return;
  }

  const DEFAULT_MONTHLY_EXPECTED = 3000;
  const DEFAULT_YEARLY_EXPECTED = 0;

  const state = {
    players: [],
    selectedId: null,
    yearKey: null,
    monthKey: null,
    years: [],
    months: []
  };

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
    return {
      expected: yearly?.expected ?? DEFAULT_YEARLY_EXPECTED,
      paid: yearly?.paid ?? 0
    };
  }

  function getMonthlyPayment(player, monthKey) {
    const monthly = player?.payments?.monthly?.[monthKey];
    return {
      expected: monthly?.expected ?? DEFAULT_MONTHLY_EXPECTED,
      paid: monthly?.paid ?? 0
    };
  }

  function renderBadge(status) {
    return `<span class="badge ${status}">${formatStatusLabel(status)}</span>`;
  }

  function renderTable(players) {
    body.innerHTML = "";
    players.forEach((player) => {
      const yearly = getYearlyPayment(player, state.yearKey);
      const monthly = getMonthlyPayment(player, state.monthKey);
      const yearlyStatusText = deriveStatus(yearly.expected, yearly.paid);
      const monthlyStatusText = deriveStatus(monthly.expected, monthly.paid);

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${player.name || ""}</td>
        <td>${player.nickname || "-"}</td>
        <td>${renderBadge(yearlyStatusText)}</td>
        <td>${renderBadge(monthlyStatusText)}</td>
        <td><button class="action-btn" data-id="${player.id}">View</button></td>
      `;
      body.appendChild(row);
    });
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

    populateSelect(yearlyYear, state.years, state.yearKey);
    populateSelect(monthlyYear, state.years, state.yearKey);

    const monthsForYear = getMonthsForYear(state.yearKey);
    const monthValue = monthsForYear.includes(state.monthKey)
      ? state.monthKey
      : monthsForYear[monthsForYear.length - 1];
    populateSelect(monthlyMonth, monthsForYear, monthValue);

    const yearly = getYearlyPayment(player, yearlyYear.value);
    const monthly = getMonthlyPayment(player, monthlyMonth.value);

    yearlyExpected.value = String(yearly.expected);
    yearlyPaid.value = String(yearly.paid);
    monthlyExpected.value = String(monthly.expected);
    monthlyPaid.value = String(monthly.paid);

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

  function loadPlayers() {
    return window
      .apiFetch("/players")
      .then((players) => {
        state.players = players;
        state.yearKey = getLatestKey(players, "yearly", getNowYear());
        state.monthKey = getLatestKey(players, "monthly", getNowMonth());
        buildAvailableKeys(players);
        renderTable(players);
      })
      .catch(console.error);
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
    const yearlyExpectedValue = Math.max(0, Number(yearlyExpected.value || 0));
    const yearlyPaidValue = Math.max(0, Number(yearlyPaid.value || 0));
    const monthlyExpectedValue = Math.max(0, Number(monthlyExpected.value || 0));
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

  loadPlayers();
})();
