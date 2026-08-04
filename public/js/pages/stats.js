(function () {
  const body = document.getElementById("stats-body");
  const searchInput = document.getElementById("stats-search");
  const mobileSort = document.getElementById("stats-mobile-sort");
  const modal = document.getElementById("stats-modal");
  const modalName = document.getElementById("stats-player-name");
  const errorEl = document.getElementById("stats-error");
  const cancelBtn = document.getElementById("stats-cancel");
  const saveBtn = document.getElementById("stats-save");
  const countEl = document.getElementById("stats-count");

  const goalsInput = document.getElementById("stats-goals");
  const assistsInput = document.getElementById("stats-assists");
  const yellowInput = document.getElementById("stats-yellow");
  const redInput = document.getElementById("stats-red");
  const yellowPaidInput = document.getElementById("stats-yellow-paid");
  const redPaidInput = document.getElementById("stats-red-paid");

  if (
    !body ||
    !searchInput ||
    !modal ||
    !modalName ||
    !errorEl ||
    !cancelBtn ||
    !saveBtn ||
    !countEl ||
    !goalsInput ||
    !assistsInput ||
    !yellowInput ||
    !redInput ||
    !yellowPaidInput ||
    !redPaidInput
  ) {
    return;
  }

  const defaultSettings = {
    discipline: { yellowFine: 500, redFine: 1000 }
  };

  const state = {
    players: [],
    allPlayers: [],
    editingId: null,
    sortKey: "goals",
    sortDir: "desc",
    settings: defaultSettings,
    currentRanks: {},
    previousRanks: {}
  };
  const weeklySnapshotKey = "achievers-stats-weekly-rankings-v1";

  function safeNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getWeekKey(date = new Date()) {
    const weekDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = weekDate.getUTCDay() || 7;
    weekDate.setUTCDate(weekDate.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((weekDate - yearStart) / 86400000) + 1) / 7);
    return `${weekDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  function safeReadSnapshots() {
    try {
      const parsed = JSON.parse(localStorage.getItem(weeklySnapshotKey) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function safeWriteSnapshots(payload) {
    try {
      localStorage.setItem(weeklySnapshotKey, JSON.stringify(payload));
    } catch (error) {
      console.warn("Unable to save weekly stats snapshot.", error);
    }
  }

  function buildRankMap(players) {
    return (players || []).reduce((map, player, index) => {
      if (player?.id) map[player.id] = index + 1;
      return map;
    }, {});
  }

  function getRankingKey() {
    const useMobileSort = window.innerWidth <= 600 && mobileSort;
    if (useMobileSort) return `mobile-${getMobileSortKey()}-desc`;
    return `${state.sortKey}-${state.sortDir}`;
  }

  function updateWeeklySnapshot(sortedPlayers) {
    const store = safeReadSnapshots();
    const snapshots = store.snapshots && typeof store.snapshots === "object" ? store.snapshots : {};
    const currentWeek = getWeekKey();
    const rankingKey = getRankingKey();
    const previousWeek = Object.keys(snapshots)
      .filter((weekKey) => weekKey < currentWeek && snapshots[weekKey]?.[rankingKey])
      .sort()
      .pop();

    state.currentRanks = buildRankMap(sortedPlayers);
    state.previousRanks = previousWeek
      ? buildRankMap((snapshots[previousWeek][rankingKey] || []).map((id) => ({ id })))
      : {};

    if (!snapshots[currentWeek]) snapshots[currentWeek] = {};
    if (!snapshots[currentWeek][rankingKey]) {
      snapshots[currentWeek][rankingKey] = sortedPlayers.map((player) => player.id).filter(Boolean);
      const weeksToKeep = Object.keys(snapshots).sort().slice(-12);
      const pruned = weeksToKeep.reduce((next, weekKey) => {
        next[weekKey] = snapshots[weekKey];
        return next;
      }, {});
      safeWriteSnapshots({ version: 1, snapshots: pruned });
    }
  }

  function getMovement(player) {
    const previousRank = state.previousRanks[player.id];
    const currentRank = state.currentRanks[player.id];
    if (!previousRank || !currentRank || previousRank === currentRank) {
      return { className: "same", symbol: "▬" };
    }
    return currentRank < previousRank
      ? { className: "up", symbol: "▲" }
      : { className: "down", symbol: "▼" };
  }

  function nameWithMovement(player) {
    const rank = String(state.currentRanks[player.id] || 0).padStart(2, "0");
    const movement = getMovement(player);
    return `
      <span class="stats-name-rank">
        <span class="rank-with-movement">
          <span>${rank}</span>
          <span class="rank-movement ${movement.className}" aria-hidden="true">${movement.symbol}</span>
        </span>
        <span>${escapeHtml(player.name || "")}</span>
      </span>
    `;
  }

  function getStats(player) {
    return {
      goals: safeNumber(player?.stats?.goals),
      assists: safeNumber(player?.stats?.assists),
      yellow: safeNumber(player?.stats?.yellow),
      red: safeNumber(player?.stats?.red)
    };
  }

  function getDiscipline(player) {
    return {
      yellowPaid: safeNumber(player?.discipline?.yellowPaid),
      redPaid: safeNumber(player?.discipline?.redPaid)
    };
  }

  function getFineSummary(player) {
    const stats = getStats(player);
    const discipline = getDiscipline(player);
    const yellowFine = state.settings.discipline.yellowFine;
    const redFine = state.settings.discipline.redFine;
    const owedYellow = Math.max(0, stats.yellow - discipline.yellowPaid);
    const owedRed = Math.max(0, stats.red - discipline.redPaid);
    const fineOwed = owedYellow * yellowFine + owedRed * redFine;
    const cardsTotal = stats.yellow + stats.red;
    const cardsPaidTotal = discipline.yellowPaid + discipline.redPaid;
    let status = "pending";
    let statusLabel = "PENDING";
    if (cardsTotal === 0) {
      status = "neutral";
      statusLabel = "NO_CARDS";
    } else if (fineOwed === 0) {
      status = "paid";
      statusLabel = "CLEARED";
    } else if (cardsPaidTotal === 0) {
      status = "pending";
      statusLabel = "PENDING";
    } else {
      status = "incomplete";
      statusLabel = "INCOMPLETE";
    }
    return { owedYellow, owedRed, fineOwed, status, statusLabel };
  }

  function getFineStatusRank(player) {
    const label = getFineSummary(player).statusLabel;
    const rank = {
      PENDING: 0,
      INCOMPLETE: 1,
      CLEARED: 2,
      NO_CARDS: 3
    };
    return rank[label] ?? 99;
  }

  function getSortValue(player, key) {
    const stats = getStats(player);
    if (key === "fineStatus") return getFineStatusRank(player);
    return stats[key] ?? 0;
  }

  function sortPlayers(players) {
    return [...players].sort((a, b) => {
      const dir = state.sortDir === "asc" ? 1 : -1;
      const valueA = getSortValue(a, state.sortKey);
      const valueB = getSortValue(b, state.sortKey);
      if (valueA !== valueB) {
        return (valueA > valueB ? 1 : -1) * dir;
      }
      if (state.sortKey !== "assists" && state.sortKey !== "fineStatus") {
        const assistsA = getStats(a).assists;
        const assistsB = getStats(b).assists;
        if (assistsA !== assistsB) {
          return (assistsA > assistsB ? 1 : -1) * dir;
        }
      }
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function getMobileSortKey() {
    return mobileSort?.value || "goals";
  }

  function getMobileSortValue(player, key) {
    const stats = getStats(player);
    if (key === "ga") return stats.goals + stats.assists;
    if (key === "cards") return stats.yellow + stats.red;
    return stats[key] ?? 0;
  }

  function renderTable() {
    const search = searchInput.value.trim().toLowerCase();
    const useMobileSort = window.innerWidth <= 600 && mobileSort;
    const fullSorted = useMobileSort
      ? [...state.allPlayers].sort((a, b) => {
          const key = getMobileSortKey();
          const primary = getMobileSortValue(b, key) - getMobileSortValue(a, key);
          if (primary !== 0) return primary;
          return String(a.name || "").localeCompare(String(b.name || ""));
        })
      : sortPlayers(state.allPlayers);
    updateWeeklySnapshot(fullSorted);
    const sorted = fullSorted.filter((player) => {
      const name = String(player.name || "").toLowerCase();
      const nickname = String(player.nickname || "").toLowerCase();
      return !search || name.includes(search) || nickname.includes(search);
    });
    body.innerHTML = "";
    sorted.forEach((player) => {
      const stats = getStats(player);
      const fines = getFineSummary(player);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${nameWithMovement(player)}</td>
        <td data-label="Nickname">${escapeHtml(player.nickname || "-")}</td>
        <td data-label="Goals">${stats.goals}</td>
        <td data-label="Assists">${stats.assists}</td>
        <td data-label="Yellow">${stats.yellow}</td>
        <td data-label="Red">${stats.red}</td>
        <td data-label="Cards Owed">Y:${fines.owedYellow} R:${fines.owedRed}</td>
        <td data-label="Fine Owed">\u20a6${fines.fineOwed}</td>
        <td data-label="Fine Status"><span class="badge ${fines.status}">${fines.statusLabel}</span></td>
        <td data-label="Actions">
          <div class="actions">
            <button class="action-btn" data-id="${player.id}">Edit</button>
          </div>
        </td>
      `;
      body.appendChild(row);
    });

    countEl.textContent = `Showing ${sorted.length} of ${state.allPlayers.length} players`;
  }

  function setSortIndicator() {
    document.querySelectorAll("th.sortable").forEach((th) => {
      const key = th.getAttribute("data-key");
      th.classList.toggle("active", key === state.sortKey);
      th.setAttribute(
        "data-direction",
        key === state.sortKey ? state.sortDir : ""
      );
    });
  }

  function openModal(player) {
    modalName.textContent = player.name || "";
    errorEl.textContent = "";
    const stats = getStats(player);
    const discipline = getDiscipline(player);
    goalsInput.value = String(stats.goals);
    assistsInput.value = String(stats.assists);
    yellowInput.value = String(stats.yellow);
    redInput.value = String(stats.red);
    yellowPaidInput.value = String(discipline.yellowPaid);
    redPaidInput.value = String(discipline.redPaid);
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    state.editingId = null;
  }

  function setSaving(isSaving) {
    window.setActionButtonLoading?.(saveBtn, isSaving, "Saving...", "Save");
    cancelBtn.disabled = isSaving;
  }

  function loadPlayers() {
    return window
      .apiFetch("/players")
      .then((res) => {
        const players = res?.data || [];
        state.players = players;
        state.allPlayers = players;
        renderTable();
        setSortIndicator();
      })
      .catch(console.error);
  }

  function loadSettings() {
    return window
      .apiFetch("/settings")
      .then((res) => {
        state.settings = res?.data || defaultSettings;
      })
      .catch(() => {
        state.settings = defaultSettings;
      });
  }

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-key");
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = "desc";
      }
      renderTable();
      setSortIndicator();
    });
  });

  searchInput.addEventListener("input", renderTable);
  if (mobileSort) {
    mobileSort.addEventListener("change", renderTable);
  }
  window.addEventListener("resize", renderTable);

  body.addEventListener("click", (event) => {
    const target = event.target;
    if (!target.classList.contains("action-btn")) return;
    const id = target.getAttribute("data-id");
    const player = state.players.find((item) => item.id === id);
    if (!player) return;
    state.editingId = id;
    openModal(player);
  });

  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  saveBtn.addEventListener("click", () => {
    const player = state.players.find((item) => item.id === state.editingId);
    if (!player) return;

    const payload = {
      goals: safeNumber(goalsInput.value),
      assists: safeNumber(assistsInput.value),
      yellow: safeNumber(yellowInput.value),
      red: safeNumber(redInput.value),
      discipline: {
        yellowPaid: safeNumber(yellowPaidInput.value),
        redPaid: safeNumber(redPaidInput.value)
      }
    };

    setSaving(true);
    window
      .apiFetch(`/players/${player.id}/stats`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      })
      .then(() => {
        closeModal();
        return loadPlayers();
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to save stats.";
      })
      .finally(() => {
        setSaving(false);
      });
  });

  loadSettings().finally(loadPlayers);
})();
