(function () {
  const summary = {
    performance: document.getElementById("highest-performance"),
    contribution: document.getElementById("highest-contribution"),
    attendance: document.getElementById("index-best-attendance"),
    goals: document.getElementById("top-goal-scorer"),
    goalsPerAppearance: document.getElementById("best-goals-appearance"),
    overall: document.getElementById("overall-club-leader")
  };
  const countEl = document.getElementById("player-index-count");
  const filterSheet = document.getElementById("index-filter-sheet");
  const filterOpenBtn = document.getElementById("index-filter-open");
  const filterCloseBtn = document.getElementById("index-filter-close");
  const filterApplyBtn = document.getElementById("index-filter-apply");
  const filterResetBtn = document.getElementById("index-reset-filters");
  const filterMobileResetBtn = document.getElementById("index-mobile-reset");
  const activeFiltersEl = document.getElementById("index-active-filters");
  const filters = {
    position: document.getElementById("index-position-filter"),
    performance: document.getElementById("index-performance-filter"),
    contribution: document.getElementById("index-contribution-filter"),
    attendance: document.getElementById("index-attendance-filter"),
    monthly: document.getElementById("index-monthly-filter"),
    yearly: document.getElementById("index-yearly-filter")
  };
  const bodies = {
    overall: document.getElementById("overall-ranking-body"),
    performance: document.getElementById("performance-ranking-body"),
    contribution: document.getElementById("contribution-ranking-body"),
    attendance: document.getElementById("attendance-ranking-body")
  };

  if (
    !summary.performance ||
    !summary.contribution ||
    !summary.attendance ||
    !summary.goals ||
    !summary.goalsPerAppearance ||
    !summary.overall ||
    !countEl ||
    !filterSheet ||
    !filterOpenBtn ||
    !filterCloseBtn ||
    !filterApplyBtn ||
    !filterResetBtn ||
    !filterMobileResetBtn ||
    !activeFiltersEl ||
    !filters.position ||
    !filters.performance ||
    !filters.contribution ||
    !filters.attendance ||
    !filters.monthly ||
    !filters.yearly ||
    !bodies.overall ||
    !bodies.performance ||
    !bodies.contribution ||
    !bodies.attendance
  ) {
    return;
  }

  const defaultSettings = {
    season: new Date().getFullYear(),
    attendance: { startDate: "2026-01-10" },
    discipline: { yellowFine: 500, redFine: 1000 }
  };
  const snapshotType = "player_index";
  const snapshotKey = "default";

  const state = {
    players: [],
    rows: [],
    settings: defaultSettings,
    appliedFilters: {
      position: "",
      performance: "0",
      contribution: "0",
      attendance: "0",
      monthly: "",
      yearly: ""
    },
    sheetSnapshot: null,
    currentRanks: {
      overall: {},
      performance: {},
      contribution: {},
      attendance: {}
    },
    previousRanks: {
      overall: {},
      performance: {},
      contribution: {},
      attendance: {}
    },
    rankings: {
      overall: [],
      performance: [],
      contribution: [],
      attendance: []
    },
    baselineSnapshot: null
  };

  function getCurrentMonthKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
  }

  function getAttendanceDates(players) {
    if (window.attendanceMetrics?.getAttendanceDateKeys) {
      return window.attendanceMetrics.getAttendanceDateKeys(players, 0);
    }
    const keys = new Set();
    (players || []).forEach((player) => {
      Object.keys(player?.attendance || {}).forEach((dateKey) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) keys.add(dateKey);
      });
    });
    return Array.from(keys).sort();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDecimal(value) {
    return (Number(value) || 0).toFixed(2);
  }

  function formatStatus(status) {
    const value = String(status || "PENDING");
    return value.charAt(0) + value.slice(1).toLowerCase();
  }

  function buildRankMap(ranking) {
    return (ranking || []).reduce((map, player, index) => {
      if (player?.id) map[player.id] = index + 1;
      return map;
    }, {});
  }

  function buildSnapshot(rankings) {
    return {
      createdAt: new Date().toISOString(),
      rankings: {
        overall: (rankings.overall || []).map((player) => player.id).filter(Boolean),
        performance: (rankings.performance || []).map((player) => player.id).filter(Boolean),
        contribution: (rankings.contribution || []).map((player) => player.id).filter(Boolean),
        attendance: (rankings.attendance || []).map((player) => player.id).filter(Boolean)
      }
    };
  }

  function getFallbackRanks() {
    return {
      overall: {},
      performance: {},
      contribution: {},
      attendance: {}
    };
  }

  function mapsFromSnapshot(snapshot) {
    const rankings = snapshot?.rankings || {};
    return {
      overall: buildRankMap((rankings.overall || []).map((id) => ({ id }))),
      performance: buildRankMap((rankings.performance || []).map((id) => ({ id }))),
      contribution: buildRankMap((rankings.contribution || []).map((id) => ({ id }))),
      attendance: buildRankMap((rankings.attendance || []).map((id) => ({ id })))
    };
  }

  function updateCurrentRanks() {
    state.currentRanks = {
      overall: buildRankMap(state.rankings.overall),
      performance: buildRankMap(state.rankings.performance),
      contribution: buildRankMap(state.rankings.contribution),
      attendance: buildRankMap(state.rankings.attendance)
    };
  }

  function applyBaselineSnapshot(snapshot) {
    state.baselineSnapshot = snapshot?.rankings ? snapshot : null;
    state.previousRanks = state.baselineSnapshot ? mapsFromSnapshot(state.baselineSnapshot) : getFallbackRanks();
  }

  function saveBaselineSnapshot(snapshot) {
    if (!snapshot?.rankings) return false;
    return window.apiFetch("/ranking-snapshots", {
      method: "POST",
      body: JSON.stringify({
        snapshot_type: snapshotType,
        ranking_key: snapshotKey,
        rankings: snapshot.rankings
      })
    });
  }

  function loadBaselineSnapshot() {
    const query = `type=${encodeURIComponent(snapshotType)}&key=${encodeURIComponent(snapshotKey)}`;
    return window
      .apiFetch(`/ranking-snapshots?${query}`, { silent: true })
      .then((res) => res?.data || null)
      .catch((error) => {
        if (window.reportPartialData) {
          window.reportPartialData(error?.message || "Ranking movement baseline is temporarily unavailable.");
        }
        return null;
      });
  }

  function syncBaselineSnapshot() {
    updateCurrentRanks();
    return loadBaselineSnapshot().then((snapshot) => {
      applyBaselineSnapshot(snapshot);
      if (snapshot?.rankings) return snapshot;
      return saveBaselineSnapshot(buildSnapshot(state.rankings))
        .then((res) => {
          const createdSnapshot = res?.data || null;
          applyBaselineSnapshot(createdSnapshot);
          return createdSnapshot;
        })
        .catch((error) => {
          console.warn("Unable to save initial player index ranking snapshot.", error);
          return null;
        });
    });
  }

  window.playerIndexSnapshots = {
    loadBaseline: loadBaselineSnapshot,
    setBaselineToCurrentRankings() {
      return saveBaselineSnapshot(buildSnapshot(state.rankings));
    }
  };

  function isMobileFilters() {
    return window.matchMedia("(max-width: 600px)").matches;
  }

  function getDefaultFilters() {
    return {
      position: "",
      performance: "0",
      contribution: "0",
      attendance: "0",
      monthly: "",
      yearly: ""
    };
  }

  function getFilterValues() {
    return {
      position: filters.position.value,
      performance: filters.performance.value,
      contribution: filters.contribution.value,
      attendance: filters.attendance.value,
      monthly: filters.monthly.value,
      yearly: filters.yearly.value
    };
  }

  function setFilterValues(values) {
    Object.keys(filters).forEach((key) => {
      filters[key].value = values[key] ?? getDefaultFilters()[key];
    });
  }

  function hasActiveFilters(values = state.appliedFilters) {
    const defaults = getDefaultFilters();
    return Object.keys(defaults).some((key) => String(values[key]) !== String(defaults[key]));
  }

  function getFilterLabel(key, value) {
    if (!value || value === "0") return "";
    const labels = {
      position: `Position: ${value}`,
      performance: `Performance: ${value}+`,
      contribution: `Contribution: ${value}+`,
      attendance: value === "100" ? "Attendance: 100%" : `Attendance: ${value}%+`,
      monthly: `Monthly: ${formatStatus(value)}`,
      yearly: `Yearly: ${formatStatus(value)}`
    };
    return labels[key] || "";
  }

  function renderActiveFilters() {
    if (!hasActiveFilters()) {
      activeFiltersEl.classList.add("hidden");
      activeFiltersEl.innerHTML = "";
      return;
    }
    const chips = Object.entries(state.appliedFilters)
      .map(([key, value]) => ({ key, label: getFilterLabel(key, value) }))
      .filter((item) => item.label)
      .map((item) => `
        <button class="filter-chip" type="button" data-filter-key="${escapeHtml(item.key)}">
          ${escapeHtml(item.label)} <span aria-hidden="true">&times;</span>
        </button>
      `)
      .join("");
    activeFiltersEl.innerHTML = `${chips}<button class="ghost-btn clear-filter-chip" type="button" data-clear-all="true">Clear All</button>`;
    activeFiltersEl.classList.remove("hidden");
  }

  function applyFilterValues(values) {
    state.appliedFilters = { ...getDefaultFilters(), ...values };
    setFilterValues(state.appliedFilters);
    renderTables();
  }

  function resetFilters() {
    applyFilterValues(getDefaultFilters());
  }

  function openFilterSheet() {
    state.sheetSnapshot = getFilterValues();
    setFilterValues(state.appliedFilters);
    filterSheet.classList.add("open");
    filterSheet.setAttribute("aria-hidden", "false");
  }

  function closeFilterSheet(restore = true) {
    if (restore && state.sheetSnapshot) setFilterValues(state.sheetSnapshot);
    filterSheet.classList.remove("open");
    filterSheet.setAttribute("aria-hidden", "true");
    state.sheetSnapshot = null;
  }

  function progressCell(score, label = "score") {
    const value = Math.max(0, Math.min(Number(score) || 0, 100));
    return `
      <div class="index-score-cell">
        <span>${value} / 100</span>
        <div class="analytics-progress" aria-label="${value} out of 100 ${escapeHtml(label)}">
          <span style="width: ${value}%"></span>
        </div>
      </div>
    `;
  }

  function getMovement(rankingKey, player) {
    const previousRank = state.previousRanks[rankingKey]?.[player.id];
    const currentRank = state.currentRanks[rankingKey]?.[player.id];
    if (!previousRank || !currentRank || previousRank === currentRank) {
      return { className: "same", symbol: "▬" };
    }
    return currentRank < previousRank
      ? { className: "up", symbol: "▲" }
      : { className: "down", symbol: "▼" };
  }

  function rankCell(rankingKey, player, index) {
    const movement = getMovement(rankingKey, player);
    return `
      <span class="rank-with-movement">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <span class="rank-movement ${movement.className}" aria-hidden="true">${movement.symbol}</span>
      </span>
    `;
  }

  function playerDetailRow(player, colspan) {
    const metrics = player.metrics;
    return `
      <tr class="player-index-detail-row hidden" data-detail-for="${escapeHtml(player.id)}">
        <td colspan="${colspan}">
          <div class="player-index-detail-grid">
            <div class="detail-item"><span>Performance Index</span><strong>${player.performanceIndex}</strong></div>
            <div class="detail-item"><span>Club Contribution Index</span><strong>${player.contributionIndex}</strong></div>
            <div class="detail-item"><span>Overall Club Ranking</span><strong>${player.overallIndex}</strong></div>
            <div class="detail-item"><span>Goals</span><strong>${metrics.goals}</strong></div>
            <div class="detail-item"><span>Goals per Appearance</span><strong>${formatDecimal(metrics.goalsPerAppearance)}</strong></div>
            <div class="detail-item"><span>Attendance Percentage</span><strong>${metrics.attendancePercentage}%</strong></div>
            <div class="detail-item"><span>Monthly Payment Status</span><strong>${formatStatus(metrics.monthlyPaymentStatus)}</strong></div>
            <div class="detail-item"><span>Yearly Payment Status</span><strong>${formatStatus(metrics.yearlyPaymentStatus)}</strong></div>
            <div class="detail-item"><span>Yellow Cards</span><strong>${metrics.yellowCards}</strong></div>
            <div class="detail-item"><span>Red Cards</span><strong>${metrics.redCards}</strong></div>
            <div class="detail-item"><span>Paid Yellow Card Fines</span><strong>${metrics.paidYellowCardFines}</strong></div>
            <div class="detail-item"><span>Paid Red Card Fines</span><strong>${metrics.paidRedCardFines}</strong></div>
            <div class="detail-item"><span>Discipline Adjustment</span><strong>${formatDecimal(metrics.disciplineAdjustment)}</strong></div>
          </div>
        </td>
      </tr>
    `;
  }

  function detailButton(player) {
    return `<button class="ghost-btn player-index-detail-toggle" type="button" data-id="${escapeHtml(player.id)}">Details</button>`;
  }

  function emptyRow(colspan) {
    return `<tr><td colspan="${colspan}" class="empty-state">No players match the selected filters.</td></tr>`;
  }

  function renderRanking(body, rows, columns, rowBuilder, options = {}) {
    body.innerHTML = "";
    if (!rows.length) {
      body.innerHTML = emptyRow(columns);
      return;
    }
    body.innerHTML = rows
      .map((player, index) => {
        return rowBuilder(player, index) + (options.withDetails ? playerDetailRow(player, columns) : "");
      })
      .join("");
  }

  function passesFilters(player) {
    const metrics = player.metrics;
    const position = state.appliedFilters.position;
    const minPerformance = Number(state.appliedFilters.performance) || 0;
    const minContribution = Number(state.appliedFilters.contribution) || 0;
    const minAttendance = Number(state.appliedFilters.attendance) || 0;
    const monthly = state.appliedFilters.monthly;
    const yearly = state.appliedFilters.yearly;

    return (
      (!position || player.position === position) &&
      player.performanceIndex >= minPerformance &&
      player.contributionIndex >= minContribution &&
      metrics.attendancePercentage >= minAttendance &&
      (!monthly || metrics.monthlyPaymentStatus === monthly) &&
      (!yearly || metrics.yearlyPaymentStatus === yearly)
    );
  }

  function renderSummary() {
    const bestPerformance = state.rankings.performance[0];
    const bestContribution = state.rankings.contribution[0];
    const bestAttendance = state.rankings.attendance[0];
    const topGoals = [...state.rows].sort((a, b) => {
      if (b.metrics.goals !== a.metrics.goals) return b.metrics.goals - a.metrics.goals;
      return String(a.name || "").localeCompare(String(b.name || ""));
    })[0];
    const bestGpa = [...state.rows].sort((a, b) => {
      if (b.metrics.goalsPerAppearance !== a.metrics.goalsPerAppearance) {
        return b.metrics.goalsPerAppearance - a.metrics.goalsPerAppearance;
      }
      return String(a.name || "").localeCompare(String(b.name || ""));
    })[0];
    const overall = state.rankings.overall[0];

    summary.performance.textContent = bestPerformance
      ? `${bestPerformance.performanceIndex}`
      : "0";
    summary.contribution.textContent = bestContribution
      ? `${bestContribution.contributionIndex}`
      : "0";
    summary.attendance.textContent = bestAttendance
      ? `${bestAttendance.metrics.attendancePercentage}%`
      : "0%";
    summary.goals.textContent = topGoals ? `${topGoals.metrics.goals}` : "0";
    summary.goalsPerAppearance.textContent = bestGpa
      ? formatDecimal(bestGpa.metrics.goalsPerAppearance)
      : "0.00";
    summary.overall.textContent = overall ? `${overall.overallIndex}` : "0";
  }

  function renderTables() {
    const filteredRows = state.rows.filter(passesFilters);
    const rankFrom = (ranking) => ranking.filter((player) => filteredRows.includes(player));
    const rankings = {
      overall: rankFrom(state.rankings.overall),
      performance: rankFrom(state.rankings.performance),
      contribution: rankFrom(state.rankings.contribution),
      attendance: rankFrom(state.rankings.attendance)
    };

    countEl.textContent = `Showing ${filteredRows.length} of ${state.rows.length} players`;
    renderActiveFilters();

    renderRanking(bodies.overall, rankings.overall, 7, (player, index) => `
      <tr>
        <td data-label="Rank">${rankCell("overall", player, index)}</td>
        <td data-label="Player">${escapeHtml(player.name || "Player")}</td>
        <td data-label="Position">${escapeHtml(player.position || "-")}</td>
        <td data-label="Overall Score">${progressCell(player.overallIndex, "overall")}</td>
        <td data-label="Performance Index">${progressCell(player.performanceIndex, "performance")}</td>
        <td data-label="Club Contribution Index">${progressCell(player.contributionIndex, "contribution")}</td>
        <td data-label="Details">${detailButton(player)}</td>
      </tr>
    `, { withDetails: true });

    renderRanking(bodies.performance, rankings.performance, 6, (player, index) => `
      <tr>
        <td data-label="Rank">${rankCell("performance", player, index)}</td>
        <td data-label="Player">${escapeHtml(player.name || "Player")}</td>
        <td data-label="Goals">${player.metrics.goals}</td>
        <td data-label="Goals per Appearance">${formatDecimal(player.metrics.goalsPerAppearance)}</td>
        <td data-label="Attendance">${player.metrics.attendancePercentage}%</td>
        <td data-label="Performance Index">${progressCell(player.performanceIndex, "performance")}</td>
      </tr>
    `);

    renderRanking(bodies.contribution, rankings.contribution, 6, (player, index) => `
      <tr>
        <td data-label="Rank">${rankCell("contribution", player, index)}</td>
        <td data-label="Player">${escapeHtml(player.name || "Player")}</td>
        <td data-label="Attendance">${player.metrics.attendancePercentage}%</td>
        <td data-label="Monthly Payment Status">${formatStatus(player.metrics.monthlyPaymentStatus)}</td>
        <td data-label="Yearly Payment Status">${formatStatus(player.metrics.yearlyPaymentStatus)}</td>
        <td data-label="Contribution Score">${progressCell(player.contributionIndex, "contribution")}</td>
      </tr>
    `);

    renderRanking(bodies.attendance, rankings.attendance, 5, (player, index) => `
      <tr>
        <td data-label="Rank">${rankCell("attendance", player, index)}</td>
        <td data-label="Player">${escapeHtml(player.name || "Player")}</td>
        <td data-label="Attendance Percentage">${player.metrics.attendancePercentage}%</td>
        <td data-label="Present">${player.metrics.appearances}</td>
        <td data-label="Total Sessions">${player.metrics.totalMatches}</td>
      </tr>
    `);
  }

  function populatePositionFilter() {
    const positions = Array.from(
      new Set(state.rows.map((player) => player.position).filter(Boolean))
    ).sort();
    filters.position.innerHTML = [
      '<option value="">All positions</option>',
      ...positions.map((position) => `<option value="${escapeHtml(position)}">${escapeHtml(position)}</option>`)
    ].join("");
  }

  function buildRankings(players) {
    const attendanceDates = getAttendanceDates(players);
    const yearKey = String(state.settings.season || new Date().getFullYear());
    const monthKey = getCurrentMonthKey();
    const indexes = window.playerIndexes.buildPlayerIndexes(players, state.settings, attendanceDates, {
      yearKey,
      monthKey
    });
    state.rows = indexes.players;
    state.rankings = {
      overall: indexes.rankings.overall,
      performance: indexes.rankings.performance,
      contribution: indexes.rankings.contribution,
      attendance: [...indexes.players].sort((a, b) => {
        if (b.metrics.attendancePercentage !== a.metrics.attendancePercentage) {
          return b.metrics.attendancePercentage - a.metrics.attendancePercentage;
        }
        if (b.metrics.appearances !== a.metrics.appearances) {
          return b.metrics.appearances - a.metrics.appearances;
        }
        return String(a.name || "").localeCompare(String(b.name || ""));
      })
    };
  }

  function loadPage() {
    if (window.clearPartialData) window.clearPartialData();
    Promise.all([
      window.apiFetch("/settings", { silent: true }).catch((error) => {
        if (window.reportPartialData) {
          window.reportPartialData(error?.message || "Settings are temporarily unavailable.");
        }
        return { data: defaultSettings };
      }),
      window.apiFetch("/players", { silent: true }).catch((error) => {
        if (window.reportPartialData) {
          window.reportPartialData(error?.message || "Players are temporarily unavailable.");
        }
        return { data: [] };
      })
    ])
      .then(([settingsRes, playersRes]) => {
        state.settings = settingsRes?.data || defaultSettings;
        state.players = playersRes?.data || [];
        if (!window.playerIndexes?.buildPlayerIndexes) {
          throw new Error("Player index calculations are unavailable.");
        }
        buildRankings(state.players);
        return syncBaselineSnapshot().then(() => {
          populatePositionFilter();
          renderSummary();
          renderTables();
        });
      })
      .catch(console.error);
  }

  Object.values(filters).forEach((filter) => {
    filter.addEventListener("change", () => {
      if (isMobileFilters() && filterSheet.classList.contains("open")) return;
      applyFilterValues(getFilterValues());
    });
  });

  filterOpenBtn.addEventListener("click", openFilterSheet);
  filterCloseBtn.addEventListener("click", () => closeFilterSheet(true));
  filterApplyBtn.addEventListener("click", () => {
    applyFilterValues(getFilterValues());
    closeFilterSheet(false);
  });
  filterResetBtn.addEventListener("click", resetFilters);
  filterMobileResetBtn.addEventListener("click", () => {
    setFilterValues(getDefaultFilters());
  });

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest(".player-index-detail-toggle");
    if (!toggle) return;
    const rows = Array.from(toggle.closest("tbody")?.querySelectorAll(".player-index-detail-row") || []);
    const detailRow = rows.find((row) => row.dataset.detailFor === toggle.dataset.id);
    if (!detailRow) return;
    const shouldOpen = detailRow.classList.contains("hidden");

    document.querySelectorAll(".player-index-detail-row").forEach((row) => {
      row.classList.add("hidden");
    });
    document.querySelectorAll(".player-index-detail-toggle").forEach((button) => {
      button.textContent = "Details";
    });

    if (shouldOpen) {
      detailRow.classList.remove("hidden");
      toggle.textContent = "Hide";
    }
  });

  activeFiltersEl.addEventListener("click", (event) => {
    const clearAll = event.target.closest("[data-clear-all]");
    if (clearAll) {
      resetFilters();
      return;
    }
    const chip = event.target.closest("[data-filter-key]");
    if (!chip) return;
    const nextFilters = { ...state.appliedFilters, [chip.dataset.filterKey]: getDefaultFilters()[chip.dataset.filterKey] };
    applyFilterValues(nextFilters);
  });

  window.addEventListener("resize", () => {
    if (!isMobileFilters() && filterSheet.classList.contains("open")) {
      closeFilterSheet(false);
      setFilterValues(state.appliedFilters);
    }
  });

  loadPage();
})();
