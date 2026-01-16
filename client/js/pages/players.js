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
    monthKey: null
  };
  const currentYear = new Date().getFullYear();
  const defaultSettings = { season: currentYear };
  let settings = defaultSettings;
  let mode = "add";
  let editingId = null;

  function formatStatus(value, fallback) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : fallback;
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

  function renderPlayers(players) {
    body.innerHTML = "";

    players.forEach((player) => {
      const row = document.createElement("tr");
      const yearlyStatus = player.yearly?.status || "PENDING";
      const monthlyStatus = player.monthly?.status || "PENDING";
      row.innerHTML = `
        <td data-label="Name">${player.name || ""}</td>
        <td data-label="Nickname">${player.nickname || "-"}</td>
        <td data-label="Position">${formatPosition(player.position)}</td>
        <td data-label="Yearly">
          <span class="pill ${formatStatusClass(yearlyStatus)}">${formatStatus(yearlyStatus, "Pending")}</span>
        </td>
        <td data-label="Monthly">
          <span class="pill ${formatStatusClass(monthlyStatus)}">${formatStatus(monthlyStatus, "Pending")}</span>
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

    countEl.textContent = `Showing ${players.length} of ${state.overviewPlayers.length} players`;
  }

  function loadPlayers() {
    return window
      .apiFetch("/settings")
      .then((settingsData) => {
        settings = settingsData || defaultSettings;
        state.yearKey = String(settings.season || currentYear);
        state.monthKey = getCurrentMonthKey();
        return Promise.all([
          window.apiFetch(`/overview?yearKey=${state.yearKey}&monthKey=${state.monthKey}`),
          window.apiFetch("/players")
        ]);
      })
      .then(([overview, players]) => {
        state.overviewPlayers = overview.players || [];
        state.players = players;
        state.allPlayers = players;
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
      })
      .catch(console.error);
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
    initialYearKeyInput.value = String(settings.season || currentYear);
  }

  function setMode(nextMode) {
    mode = nextMode;
    modalTitle.textContent = mode === "edit" ? "Edit Player" : "Add Player";
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
    viewYearly.textContent = formatStatus(overviewPlayer.yearly?.status, "Pending");
    viewMonthly.textContent = formatStatus(overviewPlayer.monthly?.status, "Pending");
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
    const position = String(formData.get("position") || "").trim();
    const memberSinceYear = Number(formData.get("memberSinceYear"));
    const email = String(formData.get("email") || "").trim();
    const initialMonthKey = String(formData.get("initialMonthKey") || "").trim();
    const initialMonthlyPaid = Number(formData.get("initialMonthlyPaid") || 0);
    const initialYearKey = String(formData.get("initialYearKey") || "").trim();
    const initialYearlyPaid = Number(formData.get("initialYearlyPaid") || 0);

    if (!name || !position) {
      addError.textContent = "Name and position are required.";
      return;
    }

    if (
      !Number.isFinite(memberSinceYear) ||
      memberSinceYear < 2000 ||
      memberSinceYear > currentYear + 1
    ) {
      addError.textContent = "Member since year must be valid.";
      return;
    }

    const payload = { name, position, memberSinceYear, email };
    if (nickname) payload.nickname = nickname;
    if (mode === "add") {
      payload.initialPayments = {
        monthKey: initialMonthKey,
        monthlyPaid: Number.isFinite(initialMonthlyPaid) ? initialMonthlyPaid : 0,
        yearKey: initialYearKey,
        yearlyPaid: Number.isFinite(initialYearlyPaid) ? initialYearlyPaid : 0
      };
    }

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
