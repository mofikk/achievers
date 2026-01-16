(function () {
  const searchInput = document.getElementById("visitors-search");
  const countEl = document.getElementById("visitors-count");
  const body = document.getElementById("visitors-body");
  const modal = document.getElementById("visitor-stats-modal");
  const modalTitle = document.getElementById("visitor-stats-title");
  const yellowInput = document.getElementById("visitor-yellow");
  const redInput = document.getElementById("visitor-red");
  const yellowPaidInput = document.getElementById("visitor-yellow-paid");
  const redPaidInput = document.getElementById("visitor-red-paid");
  const errorEl = document.getElementById("visitor-stats-error");
  const cancelBtn = document.getElementById("visitor-stats-cancel");
  const saveBtn = document.getElementById("visitor-stats-save");

  if (
    !searchInput ||
    !countEl ||
    !body ||
    !modal ||
    !modalTitle ||
    !yellowInput ||
    !redInput ||
    !yellowPaidInput ||
    !redPaidInput ||
    !errorEl ||
    !cancelBtn ||
    !saveBtn
  ) {
    return;
  }

  const defaultSettings = {
    currencySymbol: "\u20a6",
    discipline: { yellowFine: 500, redFine: 1000 }
  };

  const state = {
    visitors: [],
    settings: defaultSettings,
    selectedId: null
  };

  function formatCurrency(amount) {
    return `${state.settings.currencySymbol}${amount}`;
  }

  function computeFine(visitor) {
    const yellow = Number(visitor?.stats?.yellow) || 0;
    const red = Number(visitor?.stats?.red) || 0;
    const yellowPaid = Number(visitor?.discipline?.yellowPaid) || 0;
    const redPaid = Number(visitor?.discipline?.redPaid) || 0;
    const owedYellow = Math.max(0, yellow - yellowPaid);
    const owedRed = Math.max(0, red - redPaid);
    const fineOwed =
      owedYellow * state.settings.discipline.yellowFine +
      owedRed * state.settings.discipline.redFine;
    return { fineOwed, owedYellow, owedRed, paidTotal: yellowPaid + redPaid };
  }

  function computeStatus(fineOwed, paidTotal, yellow, red) {
    const totalCards = yellow + red;
    if (totalCards === 0) return { text: "No cards", className: "neutral" };
    if (fineOwed === 0) return { text: "Cleared", className: "paid" };
    if (paidTotal === 0) return { text: "Pending", className: "pending" };
    return { text: "Incomplete", className: "incomplete" };
  }

  function renderTable(visitors) {
    body.innerHTML = "";
    visitors.forEach((visitor) => {
      const yellow = Number(visitor?.stats?.yellow) || 0;
      const red = Number(visitor?.stats?.red) || 0;
      const fine = computeFine(visitor);
      const status = computeStatus(fine.fineOwed, fine.paidTotal, yellow, red);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Name">${visitor.name || ""}</td>
        <td data-label="Nickname">${visitor.nickname || "-"}</td>
        <td data-label="Yellow">${yellow}</td>
        <td data-label="Red">${red}</td>
        <td data-label="Fine Owed">${formatCurrency(fine.fineOwed)}</td>
        <td data-label="Status"><span class="pill ${status.className}">${status.text}</span></td>
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
    modalTitle.textContent = `Update Cards: ${visitor.name || ""}`;
    yellowInput.value = String(visitor?.stats?.yellow || 0);
    redInput.value = String(visitor?.stats?.red || 0);
    yellowPaidInput.value = String(visitor?.discipline?.yellowPaid || 0);
    redPaidInput.value = String(visitor?.discipline?.redPaid || 0);
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
    const yellow = Number(yellowInput.value);
    const red = Number(redInput.value);
    const yellowPaid = Number(yellowPaidInput.value);
    const redPaid = Number(redPaidInput.value);
    if (
      !Number.isFinite(yellow) ||
      !Number.isFinite(red) ||
      yellow < 0 ||
      red < 0 ||
      !Number.isFinite(yellowPaid) ||
      !Number.isFinite(redPaid) ||
      yellowPaid < 0 ||
      redPaid < 0
    ) {
      errorEl.textContent = "Values must be non-negative.";
      return;
    }

    saveBtn.disabled = true;
    window
      .apiFetch(`/visitors/${state.selectedId}/stats`, {
        method: "PATCH",
        body: JSON.stringify({
          yellow,
          red,
          discipline: { yellowPaid, redPaid }
        })
      })
      .then(() => {
        closeModal();
        loadData();
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to save stats.";
      })
      .finally(() => {
        saveBtn.disabled = false;
      });
  });

  cancelBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  searchInput.addEventListener("input", applyFilters);

  loadData();
})();
