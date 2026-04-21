(function () {
  const fromInput = document.getElementById("notes-from");
  const toInput = document.getElementById("notes-to");
  const searchInput = document.getElementById("notes-search-page");
  const textInput = document.getElementById("notes-text-page");
  const tagInput = document.getElementById("notes-tag-page");
  const pinnedInput = document.getElementById("notes-pinned-page");
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
    !tagInput ||
    !pinnedInput ||
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
    editingId: null,
    allNotes: []
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

  function toNoteTimestamp(note) {
    return note?.updatedAt || note?.updated_at || note?.createdAt || note?.created_at || "";
  }

  function formatDateOnly(dateValue) {
    if (!dateValue) return "";
    return String(dateValue).slice(0, 10);
  }

  function filterByDateRange(notes) {
    const from = fromInput.value || "";
    const to = toInput.value || "";
    return notes.filter((note) => {
      const noteDate = formatDateOnly(toNoteTimestamp(note));
      if (from && noteDate < from) return false;
      if (to && noteDate > to) return false;
      return true;
    });
  }

  function getVisibleNotes(notes) {
    const sorted = [...notes].sort((a, b) =>
      Number(Boolean(b?.pinned)) - Number(Boolean(a?.pinned)) ||
      String(toNoteTimestamp(b)).localeCompare(String(toNoteTimestamp(a)))
    );
    const start = (state.page - 1) * state.limit;
    const end = start + state.limit;
    return sorted.slice(start, end);
  }

  function updateRange(items) {
    if (state.total === 0) {
      rangeEl.textContent = "Showing 0-0 of 0";
      return;
    }
    const start = (state.page - 1) * state.limit + 1;
    const end = start + items.length - 1;
    rangeEl.textContent = `Showing ${start}-${end} of ${state.total}`;
  }

  function renderNotes(items) {
    listEl.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "No notes yet. Add one to keep reminders here.";
      listEl.appendChild(empty);
      return;
    }
    items.forEach((note) => {
      const card = document.createElement("div");
      card.className = "note-card";
      const noteTag = String(note.tag || "").trim();
      const metaBits = [
        formatRelativeTime(toNoteTimestamp(note)),
        note.pinned ? "Pinned" : "",
        noteTag ? `#${noteTag}` : ""
      ].filter(Boolean);
      card.innerHTML = `
        <div class="note-meta">${metaBits.join(" • ")}</div>
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

  function setLoadingState() {
    listEl.innerHTML = '<div class="muted">Loading...</div>';
    rangeEl.textContent = "Loading...";
  }

  function syncCount(total) {
    const countEl = document.getElementById("notes-count");
    if (!countEl) return;
    countEl.textContent = String(total);
    countEl.classList.toggle("hidden", total <= 0);
  }

  function renderFromState() {
    const filtered = filterByDateRange(state.allNotes);
    state.total = filtered.length;
    state.totalPages = Math.max(1, Math.ceil(state.total / state.limit));
    if (state.page > state.totalPages) state.page = state.totalPages;
    const items = getVisibleNotes(filtered);
    renderNotes(items);
    updateRange(items);
    setPagination();
    syncCount(state.total);
  }

  function loadNotes() {
    const query = searchInput.value.trim();
    const path = query ? `/notes?q=${encodeURIComponent(query)}` : "/notes";
    setLoadingState();
    window
      .apiFetch(path)
      .then((response) => {
        state.allNotes = Array.isArray(response?.data) ? response.data : [];
        renderFromState();
      })
      .catch((error) => {
        console.error(error);
        state.allNotes = [];
        renderFromState();
        if (window.toast) window.toast(error.message || "Unable to load notes.", "error");
      });
  }

  function resetEditor() {
    state.editingId = null;
    textInput.value = "";
    tagInput.value = "";
    pinnedInput.checked = false;
    errorEl.textContent = "";
    saveBtn.textContent = "Save";
  }

  function resetAndLoad() {
    state.page = 1;
    loadNotes();
  }

  saveBtn.addEventListener("click", () => {
    const text = textInput.value.trim();
    const tag = tagInput.value.trim();
    const pinned = pinnedInput.checked;
    if (!text) {
      errorEl.textContent = "Note text is required.";
      return;
    }
    errorEl.textContent = "";
    saveBtn.disabled = true;
    const isEditing = Boolean(state.editingId);
    const request = isEditing
      ? window.apiFetch(`/notes/${state.editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ text, tag, pinned })
        })
      : window.apiFetch("/notes", {
          method: "POST",
          body: JSON.stringify({ text, tag, pinned })
        });
    request
      .then(() => {
        resetEditor();
        loadNotes();
        window.toast("Note saved", "success");
      })
      .catch((err) => {
        console.error(err);
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
      const note = state.allNotes.find((item) => String(item.id) === String(id));
      tagInput.value = String(note?.tag || "");
      pinnedInput.checked = note?.pinned === true;
      saveBtn.textContent = "Update";
      return;
    }
    if (target.hasAttribute("data-delete")) {
      const id = target.getAttribute("data-delete");
      if (!id) return;
      const confirmAction = window.confirmAction;
      const confirmPromise = confirmAction
        ? confirmAction({
            title: "Delete note",
            message: "This note will be permanently removed.",
            confirmText: "Delete",
            cancelText: "Cancel",
            danger: true
          })
        : Promise.resolve(window.confirm("Delete this note?"));
      confirmPromise.then((confirmed) => {
        if (!confirmed) return;
        window
          .apiFetch(`/notes/${id}`, { method: "DELETE" })
          .then(() => {
            loadNotes();
            window.toast("Note deleted", "success");
          })
          .catch((err) => {
            console.error(err);
            errorEl.textContent = err.message || "Unable to delete note.";
          });
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
