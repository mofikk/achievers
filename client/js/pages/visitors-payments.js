(function () {
  const sessionSelect = document.getElementById("visitor-session");
  const searchInput = document.getElementById("visitors-search");
  const countEl = document.getElementById("visitors-count");
  const body = document.getElementById("visitors-body");
  const modal = document.getElementById("visitor-payment-modal");
  const modalTitle = document.getElementById("visitor-payment-title");
  const paidInput = document.getElementById("visitor-paid");
  const errorEl = document.getElementById("visitor-payment-error");
  const cancelBtn = document.getElementById("visitor-payment-cancel");
  const saveBtn = document.getElementById("visitor-payment-save");

  if (
    !sessionSelect ||
    !searchInput ||
    !countEl ||
    !body ||
    !modal ||
    !modalTitle ||
    !paidInput ||
    !errorEl ||
    !cancelBtn ||
    !saveBtn
  ) {
    return;
  }

  const defaultSettings = { attendance: { startDate: "2026-01-10" } };
  const state = {
    visitors: [],
    settings: defaultSettings,
    sessions: [],
    selectedId: null
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

  function renderTable(visitors) {
    body.innerHTML = "";
    const sessionDate = sessionSelect.value;
    visitors.forEach((visitor) => {
      const paid = Number(visitor?.payments?.sessions?.[sessionDate]?.paid) || 0;
      const summary = window.paymentStatus.statusFromPaid(1000, paid);
      const remaining = summary.remaining;
      const statusText =
        summary.status === "PAID"
          ? "Paid"
          : summary.status === "INCOMPLETE"
            ? "Incomplete"
            : "Pending";
      const statusClass =
        statusText === "Paid" ? "paid" : statusText === "Incomplete" ? "incomplete" : "pending";
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${visitor.name || ""}</td>
        <td data-label="Nickname">${visitor.nickname || "-"}</td>
        <td data-label="Paid">₦${paid}</td>
        <td data-label="Remaining">₦${remaining}</td>
        <td data-label="Status"><span class="pill ${statusClass}">${statusText}</span></td>
        <td data-label="Actions">
          <div class="actions">
            <button class="action-btn" data-id="${visitor.id}">Edit</button>
          </div>
        </td>
      `;
      body.appendChild(row);
    });
    countEl.textContent = `Showing ${visitors.length} of ${state.visitors.length} visitors`;
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    const filtered = state.visitors.filter((visitor) => {
      const name = String(visitor.name || "").toLowerCase();
      const nickname = String(visitor.nickname || "").toLowerCase();
      return !query || name.includes(query) || nickname.includes(query);
    });
    renderTable(filtered);
  }

  function openModal(visitor) {
    state.selectedId = visitor.id;
    modalTitle.textContent = `Update Payment: ${visitor.name || ""}`;
    paidInput.value = String(
      visitor?.payments?.sessions?.[sessionSelect.value]?.paid || 0
    );
    errorEl.textContent = "";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    state.selectedId = null;
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

  body.addEventListener("click", (event) => {
    const target = event.target;
    if (!target.classList.contains("action-btn")) return;
    const id = target.getAttribute("data-id");
    const visitor = state.visitors.find((item) => item.id === id);
    if (visitor) openModal(visitor);
  });

  saveBtn.addEventListener("click", () => {
    if (!state.selectedId) return;
    const paid = Number(paidInput.value);
    if (!Number.isFinite(paid) || paid < 0) {
      errorEl.textContent = "Paid amount must be non-negative.";
      return;
    }
    saveBtn.disabled = true;
    window
      .apiFetch(`/visitors/${state.selectedId}/payments`, {
        method: "PATCH",
        body: JSON.stringify({ sessionDate: sessionSelect.value, paid })
      })
      .then(() => {
        closeModal();
        loadData();
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to save payment.";
      })
      .finally(() => {
        saveBtn.disabled = false;
      });
  });

  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  sessionSelect.addEventListener("change", applyFilters);
  searchInput.addEventListener("input", applyFilters);

  loadData();
})();
