(function () {
  const body = document.getElementById("players-body");
  const addBtn = document.getElementById("add-player-btn");
  const addModal = document.getElementById("player-modal");
  const addForm = document.getElementById("player-form");
  const addCancelBtn = document.getElementById("cancel-player-btn");
  const addError = document.getElementById("player-error");
  const addSaveBtn = addForm.querySelector("button[type=\"submit\"]");
  const addMemberSince = addForm.querySelector("input[name=\"memberSinceYear\"]");
  const addEmail = addForm.querySelector("input[name=\"email\"]");
  const initialMonthKeyInput = addForm.querySelector("input[name=\"initialMonthKey\"]");
  const initialMonthlyPaidInput = addForm.querySelector("input[name=\"initialMonthlyPaid\"]");
  const initialYearKeyInput = addForm.querySelector("input[name=\"initialYearKey\"]");
  const initialYearlyPaidInput = addForm.querySelector("input[name=\"initialYearlyPaid\"]");
  const initialPaymentsGroup = document.getElementById("initial-payments-group");
  const searchInput = document.getElementById("players-search");
  const countEl = document.getElementById("players-count");

  const viewModal = document.getElementById("view-player-modal");
  const closeViewBtn = document.getElementById("close-view-btn");
  const deleteBtn = document.getElementById("delete-player-btn");
  const deleteModal = document.getElementById("delete-player-modal");
  const deleteCancelBtn = document.getElementById("delete-cancel");
  const deleteConfirmBtn = document.getElementById("delete-confirm");
  const deleteText = document.getElementById("delete-player-text");
  const viewError = document.getElementById("view-error");
  const viewName = document.getElementById("view-name");
  const viewNickname = document.getElementById("view-nickname");
  const viewPosition = document.getElementById("view-position");
  const viewYearly = document.getElementById("view-yearly");
  const viewMonthly = document.getElementById("view-monthly");
  const modalTitle = document.getElementById("player-modal-title");

  if (
    !body ||
    !addBtn ||
    !addModal ||
    !addForm ||
    !addCancelBtn ||
    !addError ||
    !addSaveBtn ||
    !addMemberSince ||
    !addEmail ||
    !initialMonthKeyInput ||
    !initialMonthlyPaidInput ||
    !initialYearKeyInput ||
    !initialYearlyPaidInput ||
    !initialPaymentsGroup ||
    !viewModal ||
    !closeViewBtn ||
    !deleteBtn ||
    !deleteModal ||
    !deleteCancelBtn ||
    !deleteConfirmBtn ||
    !deleteText ||
    !viewError ||
    !viewName ||
    !viewNickname ||
    !viewPosition ||
    !viewYearly ||
    !viewMonthly ||
    !searchInput ||
    !countEl ||
    !modalTitle
  ) {
    return;
  }

  const positionLabels = {
    FW: "Forward (FW)",
    CM: "Midfielder (CM)",
    CDM: "Midfielder (CDM)",
    CAM: "Midfielder (CAM)",
    LM: "Midfielder (LM)",
    RM: "Midfielder (RM)",
    CB: "Defender (CB)",
    RB: "Defender (RB)",
    LB: "Defender (LB)",
    LW: "Winger (LW)",
    RW: "Winger (RW)",
    GK: "Goalkeeper (GK)",
    DF: "Defender (DF)",
    MF: "Midfielder (MF)"
  };

  const state = {
    players: [],
    allPlayers: [],
    overviewPlayers: [],
    yearKey: null,
    monthKey: null,
    sortKey: null,
    sortDir: "asc"
  };
  const currentYear = new Date().getFullYear();
  const defaultSettings = {
    season: currentYear,
    currencySymbol: "\u20a6",
    fees: {
      monthlySchedule: [
        { from: `${currentYear}-01`, amount: 2000 }
      ],
      newMemberYearly: 5000,
      renewalYearly: 2500
    }
  };
  let settings = defaultSettings;
  let mode = "add";
  let editingId = null;

  function formatStatus(value, fallback) {
    return value ? value.toUpperCase() : fallback;
  }

  function formatStatusClass(status) {
    return status ? status.toLowerCase() : "pending";
  }

  function getCurrentMonthKey() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
  }

  function formatPosition(code) {
    if (!code) return "";
    return positionLabels[code] || code;
  }

  function statusRank(status) {
    const rank = {
      PAID: 0,
      INCOMPLETE: 1,
      PENDING: 2
    };
    return rank[String(status || "PENDING").toUpperCase()] ?? 99;
  }

  function sortPlayers(players) {
    if (!state.sortKey) {
      return [...players].sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });
    }

    const dir = state.sortDir === "asc" ? 1 : -1;
    return [...players].sort((a, b) => {
      if (state.sortKey === "name") {
        const nameA = String(a.name || "");
        const nameB = String(b.name || "");
        return nameA.localeCompare(nameB) * dir;
      }

      const valueA =
        state.sortKey === "yearlyStatus"
          ? statusRank(a.yearly?.status)
          : statusRank(a.monthly?.status);
      const valueB =
        state.sortKey === "yearlyStatus"
          ? statusRank(b.yearly?.status)
          : statusRank(b.monthly?.status);

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

  function renderPlayers(players) {
    body.innerHTML = "";

    const sorted = sortPlayers(players);

    sorted.forEach((player) => {
      const row = document.createElement("tr");
      const yearlyStatus = player.yearly?.status || "PENDING";
      const monthlyStatus = player.monthly?.status || "PENDING";
      row.innerHTML = `
        <td data-label="Name">${player.name || ""}</td>
        <td data-label="Nickname">${player.nickname || "-"}</td>
        <td data-label="Position">${formatPosition(player.position)}</td>
        <td data-label="Yearly">
          <span class="pill ${formatStatusClass(yearlyStatus)}">${formatStatus(yearlyStatus, "PENDING")}</span>
        </td>
        <td data-label="Monthly">
          <span class="pill ${formatStatusClass(monthlyStatus)}">${formatStatus(monthlyStatus, "PENDING")}</span>
        </td>
        <td data-label="Actions">
          <div class="actions">
            <button class="action-btn" data-id="${player.id}">View</button>
            <button class="ghost-btn" data-edit-id="${player.id}">Edit</button>
            <a class="ghost-btn" href="profile.html?id=${player.id}">View Profile</a>
          </div>
        </td>
      `;
      body.appendChild(row);
    });

    countEl.textContent = `Showing ${sorted.length} of ${state.overviewPlayers.length} players`;
    setSortIndicator();
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

  function toRecordSortValue(record) {
    return String(record.updated_at || record.created_at || record.date || "");
  }

  function buildPaymentLookup(payments) {
    const yearlyByPlayer = new Map();
    const monthlyByPlayer = new Map();

    (payments || []).forEach((record) => {
      const playerId = String(record.player_id || "");
      if (!playerId) return;
      const amount = Number(record.amount) || 0;
      const type = record.type;

      if (type === "yearly") {
        const key = toYearlyKey(record);
        if (!key) return;
        if (!yearlyByPlayer.has(playerId)) yearlyByPlayer.set(playerId, {});
        const store = yearlyByPlayer.get(playerId);
        const current = store[key];
        if (!current || toRecordSortValue(record) >= toRecordSortValue(current.__source || {})) {
          store[key] = { paid: amount, __source: record };
        }
      }

      if (type === "monthly") {
        const key = toMonthlyKey(record);
        if (!key) return;
        if (!monthlyByPlayer.has(playerId)) monthlyByPlayer.set(playerId, {});
        const store = monthlyByPlayer.get(playerId);
        const current = store[key];
        if (!current || toRecordSortValue(record) >= toRecordSortValue(current.__source || {})) {
          store[key] = { paid: amount, __source: record };
        }
      }
    });

    return { yearlyByPlayer, monthlyByPlayer };
  }

  function buildOverviewPlayers(players, payments) {
    const { yearlyByPlayer, monthlyByPlayer } = buildPaymentLookup(payments);
    const yearKey = state.yearKey;
    const monthKey = state.monthKey;

    return (players || []).map((player) => {
      const yearlyPaid =
        Number(yearlyByPlayer.get(String(player.id || ""))?.[yearKey]?.paid) || 0;
      const monthlyPaid =
        Number(monthlyByPlayer.get(String(player.id || ""))?.[monthKey]?.paid) || 0;
      const yearlyExpected = window.paymentStatus.getYearlyExpected(settings, player, yearKey);
      const monthlyExpected = window.paymentStatus.getMonthlyExpected(settings, monthKey);
      const yearly = window.paymentStatus.statusFromPaid(yearlyExpected, yearlyPaid);
      const monthly = window.paymentStatus.statusFromPaid(monthlyExpected, monthlyPaid);

      return {
        ...player,
        yearly: { status: yearly.status },
        monthly: { status: monthly.status }
      };
    });
  }

  function setLoadingState() {
    body.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';
  }

  async function loadPlayers() {
    setLoadingState();
    if (window.clearPartialData) window.clearPartialData();
    try {
      const settingsPromise = window.apiFetch("/settings", { silent: true }).catch((error) => {
        if (window.reportPartialData) {
          window.reportPartialData(error?.message || "Settings are temporarily unavailable.");
        }
        return { data: defaultSettings };
      });
      const paymentsPromise = window.apiFetch("/payments", { silent: true }).catch((error) => {
        if (window.reportPartialData) {
          window.reportPartialData(error?.message || "Payments are temporarily unavailable.");
        }
        return { data: [] };
      });
      const [settingsResponse, playersResponse, paymentsResponse] = await Promise.all([
        settingsPromise,
        window.apiFetch("/players"),
        paymentsPromise
      ]);

      settings = settingsResponse?.data || defaultSettings;
      state.yearKey = String(settings.season || currentYear);
      state.monthKey = getCurrentMonthKey();

      const players = Array.isArray(playersResponse?.data) ? playersResponse.data : [];
      const payments = Array.isArray(paymentsResponse?.data) ? paymentsResponse.data : [];
      state.players = players;
      state.allPlayers = players;
      state.overviewPlayers = buildOverviewPlayers(players, payments);
      renderPlayers(state.overviewPlayers);

      const params = new URLSearchParams(window.location.search);
      if (params.get("deleted") === "1") {
        window.toast("Player deleted", "success");
      }
      const editId = params.get("edit");
      if (editId) {
        const player = state.players.find((item) => item.id === editId);
        if (player) {
          setMode("edit");
          editingId = editId;
          addError.textContent = "";
          addForm.elements.name.value = player.name || "";
          addForm.elements.nickname.value = player.nickname || "";
          addForm.elements.position.value = player.position || "";
          addEmail.value = player.email || "";
          addMemberSince.value = String(
            player?.membership?.memberSinceYear || currentYear
          );
          openModal(addModal);
        }
      }
    } catch (error) {
      console.error(error);
      body.innerHTML = "";
      if (window.toast) window.toast(error.message || "Unable to load players.", "error");
    }
  }

  function openModal(modal) {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(modal) {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function resetAddForm() {
    addForm.reset();
    addError.textContent = "";
    addMemberSince.value = String(currentYear);
    initialMonthKeyInput.value = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    initialMonthlyPaidInput.value = "0";
    initialYearKeyInput.value = String(settings.season || currentYear);
    initialYearlyPaidInput.value = "0";
  }

  function toggleInitialPaymentsSection(show) {
    initialPaymentsGroup.hidden = !show;
    initialMonthKeyInput.disabled = !show;
    initialMonthlyPaidInput.disabled = !show;
    initialYearKeyInput.disabled = !show;
    initialYearlyPaidInput.disabled = !show;
    if (!show) {
      initialPaymentsGroup.open = false;
      initialMonthKeyInput.value = "";
      initialMonthlyPaidInput.value = "0";
      initialYearKeyInput.value = "";
      initialYearlyPaidInput.value = "0";
    }
  }

  function setMode(nextMode) {
    mode = nextMode;
    modalTitle.textContent = mode === "edit" ? "Edit Player" : "Add Player";
    toggleInitialPaymentsSection(mode === "add");
  }

  function resetViewModal() {
    viewError.textContent = "";
    deleteBtn.removeAttribute("data-id");
  }

  function openDeleteModal(player) {
    deleteConfirmBtn.setAttribute("data-id", player.id);
    const label = player.nickname ? `${player.name} (${player.nickname})` : player.name;
    deleteText.textContent =
      `This will permanently remove ${label} and their payments, attendance, and stats from this device.`;
    openModal(deleteModal);
  }

  function closeDeleteModal() {
    deleteConfirmBtn.removeAttribute("data-id");
    closeModal(deleteModal);
  }

  addBtn.addEventListener("click", () => {
    setMode("add");
    editingId = null;
    addEmail.value = "";
    resetAddForm();
    openModal(addModal);
  });

  addCancelBtn.addEventListener("click", () => {
    resetAddForm();
    closeModal(addModal);
  });

  addModal.addEventListener("click", (event) => {
    if (event.target === addModal) {
      resetAddForm();
      closeModal(addModal);
    }
  });

  viewModal.addEventListener("click", (event) => {
    if (event.target === viewModal) {
      resetViewModal();
      closeModal(viewModal);
    }
  });

  closeViewBtn.addEventListener("click", () => {
    resetViewModal();
    closeModal(viewModal);
  });

  body.addEventListener("click", (event) => {
    const target = event.target;
    if (!target.classList.contains("action-btn")) return;
    const playerId = target.getAttribute("data-id");
    const player = state.allPlayers.find((p) => p.id === playerId);
    const overviewPlayer = state.overviewPlayers.find((p) => p.id === playerId);
    if (!player || !overviewPlayer) return;

    viewName.textContent = player.name || "";
    viewNickname.textContent = player.nickname || "-";
    viewPosition.textContent = formatPosition(player.position);
    viewYearly.textContent = formatStatus(overviewPlayer.yearly?.status, "PENDING");
    viewMonthly.textContent = formatStatus(overviewPlayer.monthly?.status, "PENDING");
    deleteBtn.setAttribute("data-id", player.id);
    viewError.textContent = "";
    openModal(viewModal);
  });

  body.addEventListener("click", (event) => {
    const target = event.target;
    if (!target.hasAttribute("data-edit-id")) return;
    const playerId = target.getAttribute("data-edit-id");
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return;

    setMode("edit");
    editingId = playerId;
    addError.textContent = "";
    addForm.elements.name.value = player.name || "";
    addForm.elements.nickname.value = player.nickname || "";
    addEmail.value = player.email || "";
    addForm.elements.position.value = player.position || "";
    addMemberSince.value = String(
      player?.membership?.memberSinceYear || currentYear
    );
    openModal(addModal);
  });

  function setAddLoading(isLoading) {
    addSaveBtn.disabled = isLoading;
    addCancelBtn.disabled = isLoading;
    addSaveBtn.textContent = isLoading ? "Saving..." : "Save";
  }

  function setDeleteLoading(isLoading) {
    deleteBtn.disabled = isLoading;
    deleteBtn.textContent = isLoading ? "Deleting..." : "Delete Player";
    deleteConfirmBtn.disabled = isLoading;
    deleteCancelBtn.disabled = isLoading;
    deleteConfirmBtn.textContent = isLoading ? "Deleting..." : "Delete";
  }

  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addError.textContent = "";

    const formData = new FormData(addForm);
    const name = String(formData.get("name") || "").trim();
    const nickname = String(formData.get("nickname") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const memberSinceYearRaw = formData.get("memberSinceYear");
    const memberSinceYear = parseInt(String(memberSinceYearRaw || ""), 10);
    const position = String(formData.get("position") || "").trim();
    const initialMonthKey = String(formData.get("initialMonthKey") || "").trim();
    const initialMonthlyPaid = Number(formData.get("initialMonthlyPaid") || 0);
    const initialYearKey = String(formData.get("initialYearKey") || "").trim();
    const initialYearlyPaid = Number(formData.get("initialYearlyPaid") || 0);

    if (!name || !position) {
      addError.textContent = "Name and position are required.";
      return;
    }

    const payload = {
      name,
      full_name: name,
      nickname: nickname || null,
      email: email || null,
      member_since_year: memberSinceYear,
      position
    };

    if (!payload.member_since_year || Number.isNaN(payload.member_since_year)) {
      addError.textContent = "Member since year is required";
      return;
    }

    if (mode === "add") {
      payload.initialMonthlyPaid = Number.isFinite(initialMonthlyPaid) ? initialMonthlyPaid : 0;
      payload.initialMonthKey = initialMonthKey;
      payload.initialYearlyPaid = Number.isFinite(initialYearlyPaid) ? initialYearlyPaid : 0;
      payload.initialYearKey = initialYearKey;
    }

    console.log("PLAYER PAYLOAD:", payload);

    setAddLoading(true);
    const request =
      mode === "edit" && editingId
        ? window.apiFetch(`/players/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : window.apiFetch("/players", {
            method: "POST",
            body: JSON.stringify(payload)
          });

    request
      .then(() => {
        resetAddForm();
        closeModal(addModal);
        window.toast(mode === "edit" ? "Player updated" : "Player added", "success");
        return loadPlayers();
      })
      .catch((err) => {
        addError.textContent = err.message || "Unable to save player.";
      })
      .finally(() => {
        setAddLoading(false);
      });
  });

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      renderPlayers(state.overviewPlayers);
      return;
    }
    const filtered = state.overviewPlayers.filter((player) => {
      const name = String(player.name || "").toLowerCase();
      const nickname = String(player.nickname || "").toLowerCase();
      return name.includes(query) || nickname.includes(query);
    });
    renderPlayers(filtered);
  });

  document.querySelectorAll("th.sortable").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-key");
      if (!key) return;
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
      } else {
        state.sortKey = key;
        state.sortDir = key === "name" ? "asc" : "desc";
      }
      const query = searchInput.value.trim().toLowerCase();
      const targetList = !query
        ? state.overviewPlayers
        : state.overviewPlayers.filter((player) => {
            const name = String(player.name || "").toLowerCase();
            const nickname = String(player.nickname || "").toLowerCase();
            return name.includes(query) || nickname.includes(query);
          });
      renderPlayers(targetList);
    });
  });

  deleteBtn.addEventListener("click", () => {
    const playerId = deleteBtn.getAttribute("data-id");
    if (!playerId) return;
    const player = state.players.find((item) => item.id === playerId);
    if (!player) return;
    closeModal(viewModal);
    openDeleteModal(player);
  });

  deleteCancelBtn.addEventListener("click", closeDeleteModal);
  deleteModal.addEventListener("click", (event) => {
    if (event.target === deleteModal) closeDeleteModal();
  });

  deleteConfirmBtn.addEventListener("click", () => {
    const playerId = deleteConfirmBtn.getAttribute("data-id");
    if (!playerId) return;
    setDeleteLoading(true);
    window
      .apiFetch(`/players/${playerId}`, { method: "DELETE" })
      .then(() => {
        closeDeleteModal();
        resetViewModal();
        window.toast("Player deleted", "success");
        return loadPlayers();
      })
      .catch((err) => {
        closeDeleteModal();
        viewError.textContent = err.message || "Unable to delete player.";
      })
      .finally(() => {
        setDeleteLoading(false);
      });
  });

  loadPlayers();
})();
