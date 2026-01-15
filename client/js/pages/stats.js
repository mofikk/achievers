(function () {
  const body = document.getElementById("stats-body");
  const searchInput = document.getElementById("stats-search");
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

  const FINE_YELLOW = 500;
  const FINE_RED = 1000;

  const state = {
    players: [],
    allPlayers: [],
    editingId: null,
    sortKey: "goals",
    sortDir: "desc"
  };

  function safeNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
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
    const owedYellow = Math.max(0, stats.yellow - discipline.yellowPaid);
    const owedRed = Math.max(0, stats.red - discipline.redPaid);
    const fineOwed = owedYellow * FINE_YELLOW + owedRed * FINE_RED;
    const totalPaid = discipline.yellowPaid + discipline.redPaid;
    const status =
      fineOwed === 0 ? "paid" : totalPaid === 0 ? "pending" : "incomplete";
    return { owedYellow, owedRed, fineOwed, status };
  }

  function sortPlayers(players) {
    return [...players].sort((a, b) => {
      const statsA = getStats(a);
      const statsB = getStats(b);
      const primary = statsB[state.sortKey] - statsA[state.sortKey];
      const secondary = statsB.assists - statsA.assists;
      const dir = state.sortDir === "asc" ? -1 : 1;
      if (primary !== 0) return primary * dir;
      if (state.sortKey !== "assists" && secondary !== 0) return secondary * dir;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  function renderTable() {
    const search = searchInput.value.trim().toLowerCase();
    const filtered = state.allPlayers.filter((player) => {
      const name = String(player.name || "").toLowerCase();
      const nickname = String(player.nickname || "").toLowerCase();
      return !search || name.includes(search) || nickname.includes(search);
    });

    const sorted = sortPlayers(filtered);
    body.innerHTML = "";
    sorted.forEach((player) => {
      const stats = getStats(player);
      const fines = getFineSummary(player);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${player.name || ""}</td>
        <td>${player.nickname || "-"}</td>
        <td>${stats.goals}</td>
        <td>${stats.assists}</td>
        <td>${stats.yellow}</td>
        <td>${stats.red}</td>
        <td>Y:${fines.owedYellow} R:${fines.owedRed}</td>
        <td>\u20a6${fines.fineOwed}</td>
        <td><span class="badge ${fines.status}">${fines.status}</span></td>
        <td><button class="action-btn" data-id="${player.id}">Edit</button></td>
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
    saveBtn.disabled = isSaving;
    cancelBtn.disabled = isSaving;
    saveBtn.textContent = isSaving ? "Saving..." : "Save";
  }

  function loadPlayers() {
    return window
      .apiFetch("/players")
      .then((players) => {
        state.players = players;
        state.allPlayers = players;
        renderTable();
        setSortIndicator();
      })
      .catch(console.error);
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

  loadPlayers();
})();
