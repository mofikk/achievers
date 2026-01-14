(function () {
  const body = document.getElementById("players-body");
  const addBtn = document.getElementById("add-player-btn");
  const addModal = document.getElementById("player-modal");
  const addForm = document.getElementById("player-form");
  const addCancelBtn = document.getElementById("cancel-player-btn");
  const addError = document.getElementById("player-error");
  const addSaveBtn = addForm.querySelector("button[type=\"submit\"]");
  const addMemberSince = addForm.querySelector("input[name=\"memberSinceYear\"]");

  const viewModal = document.getElementById("view-player-modal");
  const closeViewBtn = document.getElementById("close-view-btn");
  const deleteBtn = document.getElementById("delete-player-btn");
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
    !viewModal ||
    !closeViewBtn ||
    !deleteBtn ||
    !viewError ||
    !viewName ||
    !viewNickname ||
    !viewPosition ||
    !viewYearly ||
    !viewMonthly ||
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
    yearKey: null,
    monthKey: null
  };
  const currentYear = new Date().getFullYear();
  let mode = "add";
  let editingId = null;

  function formatStatus(value, fallback) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : fallback;
  }

  function formatPosition(code) {
    if (!code) return "";
    return positionLabels[code] || code;
  }

  function getLatestKey(players, field) {
    const keys = [];
    players.forEach((player) => {
      const bucket = player?.subscriptions?.[field] || {};
      Object.keys(bucket).forEach((key) => keys.push(key));
    });
    keys.sort();
    return keys[keys.length - 1] || null;
  }

  function computeKeys(players) {
    state.yearKey = getLatestKey(players, "year");
    state.monthKey = getLatestKey(players, "months");
  }

  function getStatus(player) {
    const yearly = state.yearKey ? player?.subscriptions?.year?.[state.yearKey] : null;
    const monthly = state.monthKey ? player?.subscriptions?.months?.[state.monthKey] : null;
    return {
      yearly: formatStatus(yearly, "Pending"),
      monthly: formatStatus(monthly, "Pending")
    };
  }

  function renderPlayers(players) {
    body.innerHTML = "";

    players.forEach((player) => {
      const status = getStatus(player);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${player.name || ""}</td>
        <td>${player.nickname || "-"}</td>
        <td>${formatPosition(player.position)}</td>
        <td>${status.yearly}</td>
        <td>${status.monthly}</td>
        <td>
          <button class="action-btn" data-id="${player.id}">View</button>
          <button class="ghost-btn" data-edit-id="${player.id}">Edit</button>
        </td>
      `;
      body.appendChild(row);
    });
  }

  function loadPlayers() {
    return window
      .apiFetch("/players")
      .then((players) => {
        state.players = players;
        computeKeys(players);
        renderPlayers(players);
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
  }

  function setMode(nextMode) {
    mode = nextMode;
    modalTitle.textContent = mode === "edit" ? "Edit Player" : "Add Player";
  }

  function resetViewModal() {
    viewError.textContent = "";
    deleteBtn.removeAttribute("data-id");
  }

  addBtn.addEventListener("click", () => {
    setMode("add");
    editingId = null;
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
    const player = state.players.find((p) => p.id === playerId);
    if (!player) return;

    const status = getStatus(player);
    viewName.textContent = player.name || "";
    viewNickname.textContent = player.nickname || "-";
    viewPosition.textContent = formatPosition(player.position);
    viewYearly.textContent = status.yearly;
    viewMonthly.textContent = status.monthly;
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
  }

  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addError.textContent = "";

    const formData = new FormData(addForm);
    const name = String(formData.get("name") || "").trim();
    const nickname = String(formData.get("nickname") || "").trim();
    const position = String(formData.get("position") || "").trim();
    const memberSinceYear = Number(formData.get("memberSinceYear"));

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

    const payload = { name, position, memberSinceYear };
    if (nickname) payload.nickname = nickname;

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

  deleteBtn.addEventListener("click", () => {
    const playerId = deleteBtn.getAttribute("data-id");
    if (!playerId) return;
    if (!confirm("Delete this player?")) return;

    setDeleteLoading(true);
    window
      .apiFetch(`/players/${playerId}`, { method: "DELETE" })
      .then(() => {
        resetViewModal();
        closeModal(viewModal);
        window.toast("Player deleted", "success");
        return loadPlayers();
      })
      .catch((err) => {
        viewError.textContent = err.message || "Unable to delete player.";
      })
      .finally(() => {
        setDeleteLoading(false);
      });
  });

  loadPlayers();
})();
