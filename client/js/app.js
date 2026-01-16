(function () {
  const menuBtn = document.getElementById("menu-btn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("nav-overlay");

  function setNavOpen(isOpen) {
    if (!menuBtn || !sidebar || !overlay) return;
    sidebar.classList.toggle("open", isOpen);
    overlay.classList.toggle("hidden", !isOpen);
    menuBtn.setAttribute("aria-expanded", String(isOpen));
    menuBtn.classList.toggle("is-open", isOpen);
    sidebar.setAttribute("aria-hidden", String(!isOpen));
    document.body.classList.toggle("nav-open", isOpen);
  }

  function initSidebarNav() {
    const links = document.querySelectorAll(".nav-link");
    const path = window.location.pathname.split("/").pop() || "index.html";

    links.forEach((link) => {
      const href = link.getAttribute("href");
      if (href === path) {
        link.classList.add("active");
      }
      link.addEventListener("click", () => {
        if (window.innerWidth < 900) setNavOpen(false);
      });
    });

    const activeLink = document.querySelector(".nav-link.active");
    if (activeLink) {
      const parentDropdown = activeLink.closest("details.nav-dropdown");
      if (parentDropdown) parentDropdown.open = true;
    }

    document.querySelectorAll(".nav-group-toggle").forEach((toggle) => {
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
      });
    });
  }

  if (menuBtn && sidebar && overlay) {
    menuBtn.addEventListener("click", () => {
      const isOpen = sidebar.classList.contains("open");
      setNavOpen(!isOpen);
    });

    overlay.addEventListener("click", () => setNavOpen(false));

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setNavOpen(false);
    });
  }

  window.apiFetch = async function apiFetch(path, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    let requestPath = path;
    if (method === "GET") {
      const cacheBuster = `t=${Date.now()}`;
      requestPath = path.includes("?") ? `${path}&${cacheBuster}` : `${path}?${cacheBuster}`;
    }

    const res = await fetch(`/api${requestPath}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });

    if (!res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        throw new Error(data.error || "API request failed");
      }
      const message = await res.text();
      throw new Error(message || "API request failed");
    }

    return res.json();
  };

  function getMemberSinceYear(settings, player) {
    const stored = Number(player?.membership?.memberSinceYear);
    if (Number.isFinite(stored) && stored > 0) return stored;
    const years = Object.keys(player?.subscriptions?.year || {})
      .map((year) => Number(year))
      .filter((year) => Number.isFinite(year));
    if (years.length) {
      years.sort((a, b) => a - b);
      return years[0];
    }
    return Number(settings?.season) || new Date().getFullYear();
  }

  window.paymentStatus = {
    getMonthlyExpected(settings, monthKey) {
      const schedule = settings?.fees?.monthlySchedule || [];
      if (!schedule.length) return 0;
      const sorted = [...schedule].sort((a, b) => String(a.from).localeCompare(String(b.from)));
      let candidate = Number(sorted[0]?.amount) || 0;
      sorted.forEach((item) => {
        if (item && item.from && item.from <= monthKey) {
          const amount = Number(item.amount);
          if (Number.isFinite(amount)) candidate = amount;
        }
      });
      return candidate;
    },
    getYearlyExpected(settings, player, yearKey) {
      const memberSinceYear = getMemberSinceYear(settings, player);
      const expected =
        Number(yearKey) === memberSinceYear
          ? Number(settings?.fees?.newMemberYearly)
          : Number(settings?.fees?.renewalYearly);
      return Number.isFinite(expected) ? expected : 0;
    },
    statusFromPaid(expected, paid) {
      const expectedNum = Number(expected) || 0;
      const paidNum = Number(paid) || 0;
      if (expectedNum > 0) {
        if (paidNum >= expectedNum) return { status: "PAID", remaining: 0 };
        if (paidNum === 0) return { status: "PENDING", remaining: expectedNum };
        return { status: "INCOMPLETE", remaining: Math.max(expectedNum - paidNum, 0) };
      }
      if (paidNum > 0) return { status: "INCOMPLETE", remaining: 0 };
      return { status: "PENDING", remaining: 0 };
    }
  };

  window.toast = function toast(message, type = "success") {
    let container = document.querySelector(".toast-container");
    if (!container) {
      container = document.createElement("div");
      container.className = "toast-container";
      document.body.appendChild(container);
    }

    const toastEl = document.createElement("div");
    toastEl.className = `toast toast-${type}`;
    toastEl.textContent = message;
    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.classList.add("toast-hide");
    }, 2000);

    setTimeout(() => {
      toastEl.remove();
    }, 2600);
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

  function initNotes() {
    if (document.getElementById("notes-fab")) return;
    const fab = document.createElement("button");
    fab.className = "notes-fab";
    fab.id = "notes-fab";
    fab.type = "button";
    fab.innerHTML = `Notes <span class="notes-count" id="notes-count">0</span>`;
    document.body.appendChild(fab);

    const modal = document.createElement("div");
    modal.className = "modal hidden";
    modal.id = "notes-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
      <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="notes-title">
        <div class="modal-header">
          <h3 id="notes-title">Notes</h3>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <label class="form-field">
              <span>Search</span>
              <input class="input" id="notes-search" type="search" placeholder="Search notes..." />
            </label>
            <label class="form-field">
              <span>New note</span>
              <textarea class="input" id="notes-text" rows="3" placeholder="Write a note..."></textarea>
            </label>
          </div>
          <div class="form-error" id="notes-error" role="alert"></div>
          <div class="notes-list" id="notes-list"></div>
        </div>
        <div class="modal-actions">
          <button class="ghost-btn" type="button" id="notes-close">Close</button>
          <button class="action-btn" type="button" id="notes-save">Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const countEl = document.getElementById("notes-count");
    const searchInput = document.getElementById("notes-search");
    const textInput = document.getElementById("notes-text");
    const listEl = document.getElementById("notes-list");
    const errorEl = document.getElementById("notes-error");
    const closeBtn = document.getElementById("notes-close");
    const saveBtn = document.getElementById("notes-save");

    let editingId = null;

    function renderNotes(items, total) {
      listEl.innerHTML = "";
      countEl.textContent = String(total);
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

    function loadNotes() {
      const query = searchInput.value.trim();
      const qParam = query ? `&q=${encodeURIComponent(query)}` : "";
      window
        .apiFetch(`/notes?limit=20&page=1${qParam}`)
        .then((data) => {
          renderNotes(data.items || [], data.total || 0);
        })
        .catch(() => {
          renderNotes([], 0);
        });
    }

    function resetEditor() {
      editingId = null;
      textInput.value = "";
      saveBtn.textContent = "Save";
      errorEl.textContent = "";
    }

    function openModal() {
      modal.classList.remove("hidden");
      modal.setAttribute("aria-hidden", "false");
      loadNotes();
    }

    function closeModal() {
      modal.classList.add("hidden");
      modal.setAttribute("aria-hidden", "true");
      resetEditor();
    }

    fab.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });

    saveBtn.addEventListener("click", () => {
      const text = textInput.value.trim();
      if (!text) {
        errorEl.textContent = "Note text is required.";
        return;
      }
      errorEl.textContent = "";
      saveBtn.disabled = true;
      const request = editingId
        ? window.apiFetch(`/notes/${editingId}`, {
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

    searchInput.addEventListener("input", loadNotes);

    listEl.addEventListener("click", (event) => {
      const target = event.target;
      if (target.hasAttribute("data-edit")) {
        const id = target.getAttribute("data-edit");
        const card = target.closest(".note-card");
        if (!card) return;
        const textEl = card.querySelector(".note-text");
        editingId = id;
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

    loadNotes();
  }

  document.addEventListener("sidebar:loaded", () => {
    initSidebarNav();
  });

  initNotes();
})();
