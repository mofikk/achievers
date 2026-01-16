(function () {
  const fromInput = document.getElementById("notes-from");
  const toInput = document.getElementById("notes-to");
  const searchInput = document.getElementById("notes-search-page");
  const textInput = document.getElementById("notes-text-page");
  const errorEl = document.getElementById("notes-error-page");
  const listEl = document.getElementById("notes-list-page");
  const rangeEl = document.getElementById("notes-range");
  const saveBtn = document.getElementById("notes-save-page");
  const clearBtn = document.getElementById("notes-clear-page");
  const prevBtn = document.getElementById("notes-prev");
  const nextBtn = document.getElementById("notes-next");

  if (
    !fromInput ||
    !toInput ||
    !searchInput ||
    !textInput ||
    !errorEl ||
    !listEl ||
    !rangeEl ||
    !saveBtn ||
    !clearBtn ||
    !prevBtn ||
    !nextBtn
  ) {
    return;
  }

  const state = {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1,
    editingId: null
  };

  function formatRelativeTime(timestamp) {
    const diffMs = Date.now() - new Date(timestamp).getTime();
    const seconds = Math.floor(diffMs / 1000);
    if (seconds < 60) return "Just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  function buildQuery() {
    const params = new URLSearchParams();
    params.set("limit", String(state.limit));
    params.set("page", String(state.page));
    if (fromInput.value) params.set("from", fromInput.value);
    if (toInput.value) params.set("to", toInput.value);
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

  function renderNotes(items) {
    listEl.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No notes yet.";
      listEl.appendChild(empty);
      return;
    }
    items.forEach((note) => {
      const card = document.createElement("div");
      card.className = "note-card";
      card.innerHTML = `
        <div class="note-meta">${formatRelativeTime(note.updatedAt || note.createdAt)}</div>
        <div class="note-text">${note.text || ""}</div>
        <div class="note-actions">
          <button class="ghost-btn" data-edit="${note.id}">Edit</button>
          <button class="danger-btn" data-delete="${note.id}">Delete</button>
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  function setPagination() {
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= state.totalPages;
  }

  function loadNotes() {
    const query = buildQuery();
    window
      .apiFetch(`/notes?${query}`)
      .then((data) => {
        const items = data.items || [];
        state.total = data.total || 0;
        state.totalPages = data.totalPages || 1;
        renderNotes(items);
        updateRange(items);
        setPagination();
        const countEl = document.getElementById("notes-count");
        if (countEl) countEl.textContent = String(state.total);
      })
      .catch(() => {
        renderNotes([]);
        rangeEl.textContent = "Showing 0 of 0";
        prevBtn.disabled = true;
        nextBtn.disabled = true;
      });
  }

  function resetEditor() {
    state.editingId = null;
    textInput.value = "";
    errorEl.textContent = "";
    saveBtn.textContent = "Save";
  }

  function resetAndLoad() {
    state.page = 1;
    loadNotes();
  }

  saveBtn.addEventListener("click", () => {
    const text = textInput.value.trim();
    if (!text) {
      errorEl.textContent = "Note text is required.";
      return;
    }
    errorEl.textContent = "";
    saveBtn.disabled = true;
    const request = state.editingId
      ? window.apiFetch(`/notes/${state.editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ text })
        })
      : window.apiFetch("/notes", {
          method: "POST",
          body: JSON.stringify({ text })
        });
    request
      .then(() => {
        resetEditor();
        loadNotes();
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to save note.";
      })
      .finally(() => {
        saveBtn.disabled = false;
      });
  });

  clearBtn.addEventListener("click", resetEditor);

  listEl.addEventListener("click", (event) => {
    const target = event.target;
    if (target.hasAttribute("data-edit")) {
      const id = target.getAttribute("data-edit");
      const card = target.closest(".note-card");
      if (!card) return;
      const textEl = card.querySelector(".note-text");
      state.editingId = id;
      textInput.value = textEl ? textEl.textContent : "";
      saveBtn.textContent = "Update";
      return;
    }
    if (target.hasAttribute("data-delete")) {
      const id = target.getAttribute("data-delete");
      if (!id) return;
      window
        .apiFetch(`/notes/${id}`, { method: "DELETE" })
        .then(loadNotes)
        .catch((err) => {
          errorEl.textContent = err.message || "Unable to delete note.";
        });
    }
  });

  fromInput.addEventListener("change", resetAndLoad);
  toInput.addEventListener("change", resetAndLoad);
  searchInput.addEventListener("input", resetAndLoad);

  prevBtn.addEventListener("click", () => {
    if (state.page <= 1) return;
    state.page -= 1;
    loadNotes();
  });

  nextBtn.addEventListener("click", () => {
    if (state.page >= state.totalPages) return;
    state.page += 1;
    loadNotes();
  });

  loadNotes();
})();
