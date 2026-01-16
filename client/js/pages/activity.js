(function () {
  const fromInput = document.getElementById("activity-from");
  const toInput = document.getElementById("activity-to");
  const typeSelect = document.getElementById("activity-type");
  const searchInput = document.getElementById("activity-search");
  const body = document.getElementById("activity-body");
  const rangeEl = document.getElementById("activity-range");
  const prevBtn = document.getElementById("activity-prev");
  const nextBtn = document.getElementById("activity-next");

  if (
    !fromInput ||
    !toInput ||
    !typeSelect ||
    !searchInput ||
    !body ||
    !rangeEl ||
    !prevBtn ||
    !nextBtn
  ) {
    return;
  }

  const state = {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1
  };

  function formatType(type) {
    if (!type) return "—";
    if (type === "member_joined") return "Member joined";
    if (type === "monthly_cleared") return "Monthly cleared";
    if (type === "monthly_updated") return "Monthly updated";
    if (type === "yearly_cleared") return "Yearly cleared";
    if (type === "yearly_updated") return "Yearly updated";
    if (type === "fines_cleared") return "Fines cleared";
    if (type === "visitor_promoted") return "Visitor promoted";
    return type;
  }

  function formatDate(timestamp) {
    const date = new Date(Number(timestamp));
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString();
  }

  function buildQuery() {
    const params = new URLSearchParams();
    params.set("limit", String(state.limit));
    params.set("page", String(state.page));
    if (fromInput.value) params.set("from", fromInput.value);
    if (toInput.value) params.set("to", toInput.value);
    if (typeSelect.value) params.set("type", typeSelect.value);
    if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
    return params.toString();
  }

  function updateRange(items) {
    if (state.total === 0) {
      rangeEl.textContent = "Showing 0 of 0";
      return;
    }
    const start = (state.page - 1) * state.limit + 1;
    const end = start + items.length - 1;
    rangeEl.textContent = `Showing ${start}–${end} of ${state.total}`;
  }

  function renderTable(items) {
    body.innerHTML = "";
    if (!items.length) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Date">—</td>
        <td data-label="Type">—</td>
        <td data-label="Message">No activity found.</td>
      `;
      body.appendChild(row);
      return;
    }

    items.forEach((entry) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td data-label="Date">${formatDate(entry.timestamp)}</td>
        <td data-label="Type">${formatType(entry.type)}</td>
        <td data-label="Message">${entry.message || ""}</td>
      `;
      body.appendChild(row);
    });
  }

  function setPagination() {
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= state.totalPages;
  }

  function loadActivity() {
    const query = buildQuery();
    window
      .apiFetch(`/activity?${query}`)
      .then((data) => {
        const items = data.items || [];
        state.total = data.total || 0;
        state.totalPages = data.totalPages || 1;
        renderTable(items);
        updateRange(items);
        setPagination();
      })
      .catch(() => {
        renderTable([]);
        rangeEl.textContent = "Showing 0 of 0";
        prevBtn.disabled = true;
        nextBtn.disabled = true;
      });
  }

  function resetAndLoad() {
    state.page = 1;
    loadActivity();
  }

  fromInput.addEventListener("change", resetAndLoad);
  toInput.addEventListener("change", resetAndLoad);
  typeSelect.addEventListener("change", resetAndLoad);
  searchInput.addEventListener("input", resetAndLoad);

  prevBtn.addEventListener("click", () => {
    if (state.page <= 1) return;
    state.page -= 1;
    loadActivity();
  });

  nextBtn.addEventListener("click", () => {
    if (state.page >= state.totalPages) return;
    state.page += 1;
    loadActivity();
  });

  loadActivity();
})();
