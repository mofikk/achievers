(function () {
  const sessionSelect = document.getElementById("visitor-session");
  const searchInput = document.getElementById("visitors-search");
  const countEl = document.getElementById("visitors-count");
  const body = document.getElementById("visitors-body");
  const addBtn = document.getElementById("add-visitor-btn");
  const modal = document.getElementById("visitor-modal");
  const modalTitle = document.getElementById("visitor-modal-title");
  const form = document.getElementById("visitor-form");
  const cancelBtn = document.getElementById("visitor-cancel");
  const saveBtn = document.getElementById("visitor-save");
  const errorEl = document.getElementById("visitor-error");

  const viewModal = document.getElementById("visitor-view-modal");
  const viewClose = document.getElementById("visitor-view-close");
  const viewName = document.getElementById("visitor-view-name");
  const viewNickname = document.getElementById("visitor-view-nickname");
  const viewNotes = document.getElementById("visitor-view-notes");
  const viewError = document.getElementById("visitor-view-error");
  const promoteBtn = document.getElementById("visitor-promote");
  const deleteBtn = document.getElementById("visitor-delete");

  const promoteModal = document.getElementById("visitor-promote-modal");
  const promoteCancel = document.getElementById("visitor-promote-cancel");
  const promoteConfirm = document.getElementById("visitor-promote-confirm");
  const promotePosition = document.getElementById("visitor-promote-position");

  if (
    !sessionSelect ||
    !searchInput ||
    !countEl ||
    !body ||
    !addBtn ||
    !modal ||
    !modalTitle ||
    !form ||
    !cancelBtn ||
    !saveBtn ||
    !errorEl ||
    !viewModal ||
    !viewClose ||
    !viewName ||
    !viewNickname ||
    !viewNotes ||
    !viewError ||
    !promoteBtn ||
    !deleteBtn ||
    !promoteModal ||
    !promoteCancel ||
    !promoteConfirm ||
    !promotePosition
  ) {
    return;
  }

  const defaultSettings = {
    attendance: { startDate: "2026-01-10" }
  };

  const state = {
    visitors: [],
    filtered: [],
    settings: defaultSettings,
    editingId: null,
    selectedId: null,
    sessions: []
  };

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

  function buildSessions() {
    const todayStr = new Date().toISOString().slice(0, 10);
    const startDate = state.settings.attendance.startDate;
    state.sessions = buildSaturdayList(startDate, todayStr);
    sessionSelect.innerHTML = "";
    state.sessions.forEach((date) => {
      const option = document.createElement("option");
      option.value = date;
      option.textContent = date;
      sessionSelect.appendChild(option);
    });
    if (!state.sessions.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No sessions yet";
      sessionSelect.appendChild(option);
    }
  }

  function getSessionStatus(visitor, sessionDate) {
    const paid = Number(visitor?.payments?.sessions?.[sessionDate]?.paid) || 0;
    const status = window.paymentStatus.statusFromPaid(1000, paid).status;
    return status === "PAID" ? "Paid" : status === "INCOMPLETE" ? "Incomplete" : "Pending";
  }

  function renderTable(list) {
    body.innerHTML = "";
    const sessionDate = sessionSelect.value;
    list.forEach((visitor) => {
      const statusText = getSessionStatus(visitor, sessionDate);
      const statusClass =
        statusText === "Paid" ? "paid" : statusText === "Incomplete" ? "incomplete" : "pending";
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${visitor.name || ""}</td>
        <td data-label="Nickname">${visitor.nickname || "-"}</td>
        <td data-label="Play Fee Status"><span class="pill ${statusClass}">${statusText}</span></td>
        <td data-label="Actions">
          <div class="actions">
            <button class="action-btn" data-view="${visitor.id}">View</button>
            <button class="ghost-btn" data-edit="${visitor.id}">Edit</button>
            <button class="ghost-btn" data-promote="${visitor.id}">Promote</button>
            <button class="danger-btn" data-delete="${visitor.id}">Delete</button>
          </div>
        </td>
      `;
      body.appendChild(row);
    });
    countEl.textContent = `Showing ${list.length} of ${state.visitors.length} visitors`;
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    state.filtered = state.visitors.filter((visitor) => {
      const name = String(visitor.name || "").toLowerCase();
      const nickname = String(visitor.nickname || "").toLowerCase();
      return !query || name.includes(query) || nickname.includes(query);
    });
    renderTable(state.filtered);
  }

  function openModal() {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function resetForm() {
    form.reset();
    errorEl.textContent = "";
    state.editingId = null;
    modalTitle.textContent = "Add Visitor";
  }

  function openView(visitor) {
    viewName.textContent = visitor.name || "";
    viewNickname.textContent = visitor.nickname || "-";
    viewNotes.textContent = visitor.notes || "-";
    viewError.textContent = "";
    state.selectedId = visitor.id;
    viewModal.classList.remove("hidden");
    viewModal.setAttribute("aria-hidden", "false");
  }

  function closeView() {
    state.selectedId = null;
    viewModal.classList.add("hidden");
    viewModal.setAttribute("aria-hidden", "true");
  }

  function openPromote() {
    promoteModal.classList.remove("hidden");
    promoteModal.setAttribute("aria-hidden", "false");
  }

  function closePromote() {
    promoteModal.classList.add("hidden");
    promoteModal.setAttribute("aria-hidden", "true");
  }

  function loadData() {
    Promise.all([
      window.apiFetch("/settings").catch(() => defaultSettings),
      window.apiFetch("/visitors")
    ])
      .then(([settings, visitors]) => {
        state.settings = settings || defaultSettings;
        state.visitors = visitors || [];
        buildSessions();
        applyFilters();
      })
      .catch(console.error);
  }

  addBtn.addEventListener("click", () => {
    resetForm();
    openModal();
  });

  cancelBtn.addEventListener("click", () => {
    closeModal();
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const nickname = String(data.get("nickname") || "").trim();
    const notes = String(data.get("notes") || "").trim();

    if (!name) {
      errorEl.textContent = "Name is required.";
      return;
    }

    saveBtn.disabled = true;
    const payload = { name, nickname, notes };
    const request = state.editingId
      ? window.apiFetch(`/visitors/${state.editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        })
      : window.apiFetch("/visitors", {
          method: "POST",
          body: JSON.stringify(payload)
        });

    request
      .then(() => {
        closeModal();
        resetForm();
        loadData();
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to save visitor.";
      })
      .finally(() => {
        saveBtn.disabled = false;
      });
  });

  body.addEventListener("click", (event) => {
    const target = event.target;
    if (target.hasAttribute("data-view")) {
      const id = target.getAttribute("data-view");
      const visitor = state.visitors.find((item) => item.id === id);
      if (visitor) openView(visitor);
      return;
    }
    if (target.hasAttribute("data-edit")) {
      const id = target.getAttribute("data-edit");
      const visitor = state.visitors.find((item) => item.id === id);
      if (!visitor) return;
      state.editingId = id;
      modalTitle.textContent = "Edit Visitor";
      form.elements.name.value = visitor.name || "";
      form.elements.nickname.value = visitor.nickname || "";
      form.elements.notes.value = visitor.notes || "";
      openModal();
      return;
    }
    if (target.hasAttribute("data-promote")) {
      const id = target.getAttribute("data-promote");
      state.selectedId = id;
      openPromote();
      return;
    }
    if (target.hasAttribute("data-delete")) {
      const id = target.getAttribute("data-delete");
      window
        .apiFetch(`/visitors/${id}`, { method: "DELETE" })
        .then(loadData)
        .catch((err) => {
          window.toast(err.message || "Unable to delete visitor.", "error");
        });
    }
  });

  viewClose.addEventListener("click", closeView);
  viewModal.addEventListener("click", (event) => {
    if (event.target === viewModal) closeView();
  });

  promoteBtn.addEventListener("click", () => {
    closeView();
    openPromote();
  });

  deleteBtn.addEventListener("click", () => {
    const id = state.selectedId;
    if (!id) return;
    window
      .apiFetch(`/visitors/${id}`, { method: "DELETE" })
      .then(() => {
        closeView();
        loadData();
      })
      .catch((err) => {
        viewError.textContent = err.message || "Unable to delete visitor.";
      });
  });

  promoteCancel.addEventListener("click", closePromote);
  promoteModal.addEventListener("click", (event) => {
    if (event.target === promoteModal) closePromote();
  });

  promoteConfirm.addEventListener("click", () => {
    const id = state.selectedId;
    if (!id) return;
    const payload = { position: promotePosition.value };
    promoteConfirm.disabled = true;
    window
      .apiFetch(`/visitors/${id}/promote`, {
        method: "POST",
        body: JSON.stringify(payload)
      })
      .then(() => {
        closePromote();
        loadData();
      })
      .catch((err) => {
        viewError.textContent = err.message || "Unable to promote visitor.";
      })
      .finally(() => {
        promoteConfirm.disabled = false;
      });
  });

  sessionSelect.addEventListener("change", applyFilters);
  searchInput.addEventListener("input", applyFilters);

  loadData();
})();
