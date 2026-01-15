(function () {
  const backBtn = document.getElementById("profile-back");
  const nameEl = document.getElementById("profile-name");
  const metaEl = document.getElementById("profile-meta");
  const editLink = document.getElementById("profile-edit");
  const paymentsLink = document.getElementById("profile-payments");
  const yearInput = document.getElementById("profile-year");
  const monthSelect = document.getElementById("profile-month");
  const yearlyEl = document.getElementById("profile-yearly");
  const monthlyEl = document.getElementById("profile-monthly");
  const attendanceList = document.getElementById("profile-attendance");
  const streakEl = document.getElementById("profile-streak");
  const goalsEl = document.getElementById("profile-goals");
  const assistsEl = document.getElementById("profile-assists");
  const yellowEl = document.getElementById("profile-yellow");
  const redEl = document.getElementById("profile-red");
  const cardsOwedEl = document.getElementById("profile-cards-owed");
  const fineOwedEl = document.getElementById("profile-fine-owed");
  const fineStatusEl = document.getElementById("profile-fine-status");

  if (
    !backBtn ||
    !nameEl ||
    !metaEl ||
    !editLink ||
    !paymentsLink ||
    !yearInput ||
    !monthSelect ||
    !yearlyEl ||
    !monthlyEl ||
    !attendanceList ||
    !streakEl ||
    !goalsEl ||
    !assistsEl ||
    !yellowEl ||
    !redEl ||
    !cardsOwedEl ||
    !fineOwedEl ||
    !fineStatusEl
  ) {
    return;
  }

  const defaultSettings = {
    season: new Date().getFullYear(),
    currencySymbol: "\u20a6",
    fees: { monthly: 3000, newMemberYearly: 5000, renewalYearly: 2500 },
    attendance: { startDate: "2026-01-10" },
    discipline: { yellowFine: 500, redFine: 1000 }
  };

  const state = {
    player: null,
    settings: defaultSettings,
    months: []
  };

  function formatCurrency(amount) {
    return `${state.settings.currencySymbol}${amount}`;
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

  function getLatestMonth(player) {
    const keys = [];
    Object.keys(player?.payments?.monthly || {}).forEach((key) => keys.push(key));
    Object.keys(player?.subscriptions?.months || {}).forEach((key) => keys.push(key));
    keys.sort();
    return keys[keys.length - 1] || "";
  }

  function renderPayments() {
    const player = state.player;
    if (!player) return;
    const seasonYear = String(state.settings.season);
    const memberSinceYear = getMemberSinceYear(player);
    const yearlyExpected =
      Number(seasonYear) === memberSinceYear
        ? state.settings.fees.newMemberYearly
        : state.settings.fees.renewalYearly;
    const yearlyPaid = Number(player?.payments?.yearly?.[seasonYear]?.paid) || 0;
    const yearlyStatus = yearlyPaid >= yearlyExpected ? "Cleared" : "Pending";

    const monthKey = monthSelect.value;
    const monthlyExpected = state.settings.fees.monthly;
    const monthlyPaid = Number(player?.payments?.monthly?.[monthKey]?.paid) || 0;
    const monthlyStatus = monthlyPaid >= monthlyExpected ? "Cleared" : "Pending";

    yearInput.value = seasonYear;
    yearlyEl.textContent = `${yearlyStatus} • ${formatCurrency(yearlyPaid)} / ${formatCurrency(
      yearlyExpected
    )}`;
    monthlyEl.textContent = `${monthlyStatus} • ${formatCurrency(monthlyPaid)} / ${formatCurrency(
      monthlyExpected
    )}`;
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

  function computeStreak(player, saturdays) {
    let count = 0;
    for (let i = saturdays.length - 1; i >= 0; i -= 1) {
      const date = saturdays[i];
      if (player?.attendance?.[date] === true) count += 1;
      else break;
    }
    return count;
  }

  function renderAttendance() {
    const player = state.player;
    if (!player) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    const saturdays = buildSaturdayList(state.settings.attendance.startDate, todayStr);
    const lastSix = saturdays.slice(-6);
    attendanceList.innerHTML = "";
    lastSix.forEach((date) => {
      const present = player?.attendance?.[date] === true;
      const item = document.createElement("li");
      item.textContent = `${date} • ${present ? "Present" : "Absent"}`;
      attendanceList.appendChild(item);
    });
    const streak = computeStreak(player, saturdays);
    streakEl.textContent = `Current streak: ${streak} weeks`;
  }

  function renderStats() {
    const stats = state.player?.stats || {};
    goalsEl.textContent = String(stats.goals || 0);
    assistsEl.textContent = String(stats.assists || 0);
    yellowEl.textContent = String(stats.yellow || 0);
    redEl.textContent = String(stats.red || 0);
  }

  function renderFines() {
    const stats = state.player?.stats || {};
    const discipline = state.player?.discipline || {};
    const yellow = Number(stats.yellow) || 0;
    const red = Number(stats.red) || 0;
    const yellowPaid = Number(discipline.yellowPaid) || 0;
    const redPaid = Number(discipline.redPaid) || 0;
    const owedYellow = Math.max(0, yellow - yellowPaid);
    const owedRed = Math.max(0, red - redPaid);
    const fineOwed =
      owedYellow * state.settings.discipline.yellowFine +
      owedRed * state.settings.discipline.redFine;
    const cardsTotal = yellow + red;
    const cardsPaidTotal = yellowPaid + redPaid;
    let status = "Pending";
    if (cardsTotal === 0) status = "No cards";
    else if (fineOwed === 0) status = "Cleared";
    else if (cardsPaidTotal === 0) status = "Pending";
    else status = "Incomplete";

    cardsOwedEl.textContent = `Y:${owedYellow} R:${owedRed}`;
    fineOwedEl.textContent = formatCurrency(fineOwed);
    fineStatusEl.textContent = status;
  }

  function renderProfile() {
    const player = state.player;
    if (!player) return;
    nameEl.textContent = player.name || "Player";
    metaEl.textContent = `${player.position || ""} • Member since ${
      player?.membership?.memberSinceYear || state.settings.season
    }`;
    editLink.href = `players.html?edit=${player.id}`;
    paymentsLink.href = "payments.html";

    const latestMonth = getLatestMonth(player);
    const monthOptions = latestMonth ? [latestMonth] : [];
    monthSelect.innerHTML = "";
    monthOptions.forEach((month) => {
      const option = document.createElement("option");
      option.value = month;
      option.textContent = month;
      monthSelect.appendChild(option);
    });
    if (!monthOptions.length) {
      const fallback = `${state.settings.season}-01`;
      const option = document.createElement("option");
      option.value = fallback;
      option.textContent = fallback;
      monthSelect.appendChild(option);
    }

    renderPayments();
    renderAttendance();
    renderStats();
    renderFines();
  }

  function loadProfile() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) {
      nameEl.textContent = "Player not found";
      return;
    }

    Promise.all([
      window.apiFetch("/settings").catch(() => defaultSettings),
      window.apiFetch("/players")
    ])
      .then(([settings, players]) => {
        state.settings = settings || defaultSettings;
        const player = players.find((item) => item.id === id);
        state.player = player || null;
        renderProfile();
      })
      .catch(console.error);
  }

  backBtn.addEventListener("click", () => {
    window.location.href = "players.html";
  });

  monthSelect.addEventListener("change", renderPayments);

  loadProfile();
})();
