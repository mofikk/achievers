(function () {
  let preloaderHidden = false;
  let pendingRequests = 0;
  let bootstrapFinished = false;
  let lastAccessToken = "";
  let partialDataMessages = new Set();
  let partialDataHideTimer = null;
  const preloaderMinVisibleUntil = Date.now() + 300;

  function ensurePreloader() {
    let preloader = document.getElementById("page-preloader");
    if (preloader) return preloader;

    preloader = document.createElement("div");
    preloader.id = "page-preloader";
    preloader.className = "visible";
    preloader.setAttribute("role", "status");
    preloader.setAttribute("aria-live", "polite");
    preloader.innerHTML = `
      <span class="preloader-spinner" aria-hidden="true"></span>
      <span class="preloader-text">Loading...</span>
    `;

    document.body.appendChild(preloader);
    return preloader;
  }

  function hidePreloader() {
    if (preloaderHidden) return;
    preloaderHidden = true;

    const preloader = document.getElementById("page-preloader");
    if (!preloader) return;

    preloader.classList.remove("visible");
    window.setTimeout(() => {
      if (preloader.parentNode) preloader.parentNode.removeChild(preloader);
    }, 220);
  }

  function tryHidePreloader() {
    if (preloaderHidden) return;
    if (!bootstrapFinished) return;
    if (pendingRequests > 0) return;

    const wait = preloaderMinVisibleUntil - Date.now();
    if (wait > 0) {
      window.setTimeout(tryHidePreloader, wait);
      return;
    }

    hidePreloader();
  }

  const menuBtn = document.getElementById("menu-btn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("nav-overlay");

  ensurePreloader();
  window.setTimeout(hidePreloader, 10000);

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

  function isPublicAuthPage() {
    const path = window.location.pathname || "";
    return ["/login.html", "/signup.html", "/forgot-password.html"].includes(path);
  }

  async function getSession() {
    const client = await window.getSupabaseClient();
    let session = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data } = await client.auth.getSession();
      session = data?.session || null;
      if (session) break;
      await new Promise((resolve) => window.setTimeout(resolve, 150));
    }
    if (!session) return null;

    const expiresAtMs = Number(session.expires_at || 0) * 1000;
    const isExpired = Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now() + 5000;
    if (!isExpired) return session;

    const { data: refreshed, error } = await client.auth.refreshSession();
    if (error) {
      console.error("Failed to refresh session:", error);
      return null;
    }
    return refreshed?.session || null;
  }

  async function getAccessToken() {
    const session = await getSession();
    const token = session?.access_token || "";
    if (token) lastAccessToken = token;
    return token || lastAccessToken || "";
  }

  function getCurrentPage() {
    const page = window.location.pathname.split("/").pop();
    return page || "index.html";
  }

  function applyNavPermissions(me) {
    const canViewReports = me?.role === "super_user";
    const reportsLink = document.querySelector('.nav-link[href="reports.html"]');
    if (reportsLink) {
      reportsLink.classList.toggle("hidden", !canViewReports);
    }
  }

  function guardReportsPage(me) {
    const onReportsPage = getCurrentPage() === "reports.html";
    const canViewReports = me?.role === "super_user";
    if (onReportsPage && !canViewReports) {
      if (window.toast) {
        window.toast("You do not have permission to access Reports.", "error");
      }
      window.location.href = "/index.html";
    }
  }

  function resolveDisplayName(session) {
    const user = session?.user;
    const metadata = user?.user_metadata || {};
    const fromMeta = metadata.full_name || metadata.name || metadata.display_name;
    if (fromMeta) return String(fromMeta);
    const email = String(user?.email || "").trim();
    if (email) return email.split("@")[0];
    return "User";
  }

  function injectTopbarActions(session) {
    const topbar = document.querySelector(".topbar");
    if (!topbar || document.getElementById("topbar-right")) return null;

    const wrapper = document.createElement("div");
    wrapper.id = "topbar-right";
    wrapper.className = "topbar-right";

    const notesBtn = document.createElement("button");
    notesBtn.type = "button";
    notesBtn.id = "notes-trigger";
    notesBtn.className = "ghost-btn topbar-notes-btn";
    notesBtn.innerHTML = `Notes <span class="notes-count hidden" id="notes-count">0</span>`;

    const userMenu = document.createElement("div");
    userMenu.className = "user-menu";
    userMenu.innerHTML = `
      <button type="button" id="user-menu-trigger" class="user-menu-trigger" aria-expanded="false" aria-haspopup="menu">
        <span class="user-avatar" aria-hidden="true">${resolveDisplayName(session).slice(0, 1).toUpperCase()}</span>
        <span class="user-name">${resolveDisplayName(session)}</span>
        <i class="fa-solid fa-chevron-down user-chevron" aria-hidden="true"></i>
      </button>
      <div id="user-menu-dropdown" class="user-menu-dropdown hidden" role="menu">
        <button type="button" id="logout-btn" class="dropdown-item" role="menuitem">Logout</button>
      </div>
    `;

    wrapper.appendChild(notesBtn);
    wrapper.appendChild(userMenu);
    topbar.appendChild(wrapper);

    const trigger = userMenu.querySelector("#user-menu-trigger");
    const dropdown = userMenu.querySelector("#user-menu-dropdown");
    const logoutBtn = userMenu.querySelector("#logout-btn");

    const closeMenu = () => {
      if (!trigger || !dropdown) return;
      trigger.setAttribute("aria-expanded", "false");
      dropdown.classList.add("hidden");
    };

    if (trigger && dropdown) {
      trigger.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = !dropdown.classList.contains("hidden");
        if (isOpen) {
          closeMenu();
        } else {
          trigger.setAttribute("aria-expanded", "true");
          dropdown.classList.remove("hidden");
        }
      });

      document.addEventListener("click", (event) => {
        if (!userMenu.contains(event.target)) closeMenu();
      });

      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        try {
          if (window.auth?.logout) {
            await window.auth.logout();
          }
        } catch (error) {
          console.error(error);
        } finally {
          window.location.href = "/login.html";
        }
      });
    }

    return { notesBtn };
  }

  function ensurePartialDataBanner() {
    let banner = document.getElementById("partial-data-banner");
    if (banner) return banner;

    banner = document.createElement("div");
    banner.id = "partial-data-banner";
    banner.className = "partial-data-banner hidden";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.innerHTML = `
      <span class="partial-data-dot" aria-hidden="true"></span>
      <span class="partial-data-text">Some data is temporarily unavailable. Showing partial results.</span>
      <button type="button" class="partial-data-dismiss" aria-label="Dismiss notice">Dismiss</button>
    `;
    document.body.appendChild(banner);
    const dismiss = banner.querySelector(".partial-data-dismiss");
    if (dismiss) {
      dismiss.addEventListener("click", () => {
        banner.classList.add("hidden");
      });
    }
    return banner;
  }

  function renderPartialDataBanner() {
    const banner = ensurePartialDataBanner();
    const textEl = banner.querySelector(".partial-data-text");
    const details = Array.from(partialDataMessages).slice(0, 3).join(" | ");
    if (textEl && details) {
      textEl.textContent = "Some data is temporarily unavailable. Showing partial results.";
      banner.title = details;
    }
    banner.classList.remove("hidden");
  }

  window.reportPartialData = function reportPartialData(message) {
    const safe = String(message || "").trim();
    if (safe) partialDataMessages.add(safe);
    renderPartialDataBanner();
    if (partialDataHideTimer) window.clearTimeout(partialDataHideTimer);
    partialDataHideTimer = window.setTimeout(() => {
      const banner = document.getElementById("partial-data-banner");
      if (banner) banner.classList.add("hidden");
    }, 8000);
  };

  window.clearPartialData = function clearPartialData() {
    partialDataMessages = new Set();
    if (partialDataHideTimer) {
      window.clearTimeout(partialDataHideTimer);
      partialDataHideTimer = null;
    }
    const banner = document.getElementById("partial-data-banner");
    if (banner) banner.classList.add("hidden");
  };

  window.apiFetch = async function apiFetch(path, options = {}) {
    pendingRequests += 1;
    const { silent = false, ...fetchOptions } = options;
    const request = async (token) =>
      fetch(`/api${path}`, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...fetchOptions
      });

    try {
      let token = await getAccessToken();
      let res = await request(token);

      if (res.status === 401) {
        const client = await window.getSupabaseClient();
        const { data: refreshed, error: refreshError } = await client.auth.refreshSession();
        if (!refreshError && refreshed?.session?.access_token) {
          token = refreshed.session.access_token;
          res = await request(token);
        } else {
          const { data } = await client.auth.getSession();
          const retryToken = data?.session?.access_token;
          if (retryToken) {
            res = await request(retryToken);
          }
        }
      }

      if (!res.ok) {
        let payload = null;
        try {
          payload = await res.json();
        } catch {
          payload = null;
        }

        const rawMessage =
          (payload && typeof payload.error === "string" && payload.error.trim()) ||
          (payload && typeof payload.message === "string" && payload.message.trim()) ||
          "";

        let message = rawMessage || "Request failed.";
        if (res.status === 401) {
          message = "Your session has expired. Please log in again.";
        } else if (res.status === 403) {
          message = "You do not have permission to perform this action.";
        } else if (res.status >= 500) {
          message = "Something went wrong on the server. Please try again.";
        }

        const error = new Error(message);
        error.status = res.status;
        error.payload = payload;
        if (!silent && window.toast) {
          window.toast(message, "error");
        }
        throw error;
      }

      return res.json();
    } finally {
      pendingRequests = Math.max(0, pendingRequests - 1);
      tryHidePreloader();
    }
  };

  async function bootstrapApp() {
    try {
      if (isPublicAuthPage()) return;

      const session = await getSession();

      if (!session) {
        window.location.href = "/login.html";
        return;
      }

      let me = null;
      document.addEventListener("sidebar:loaded", () => {
        initSidebarNav();
        applyNavPermissions(me);
      });

      // Hide by default until role is confirmed.
      applyNavPermissions(null);

      try {
        const meRes = await window.apiFetch("/me");
        me = meRes?.data || null;
      } catch (error) {
        console.error("Failed to load current user permissions:", error);
      }

      guardReportsPage(me);
      applyNavPermissions(me);

      const topbarActions = injectTopbarActions(session);
      initNotes(topbarActions?.notesBtn || null);
    } catch (error) {
      console.error(error);
      if (!isPublicAuthPage()) {
        window.location.href = "/login.html";
      }
    } finally {
      bootstrapFinished = true;
      tryHidePreloader();
    }
  }

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

  function isAttendanceDateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
  }

  function resolveAttendanceDateKeys(source, max = 12) {
    const dates = new Set();
    let safeSource = [];

    if (Array.isArray(source)) {
      safeSource = source;
    } else if (source && Array.isArray(source.data)) {
      safeSource = source.data;
    } else {
      safeSource = [];
    }

    safeSource.forEach((player) => {
      Object.keys(player?.attendance || {}).forEach((dateKey) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
          dates.add(dateKey);
        }
      });
    });

    const sorted = Array.from(dates).sort();

    if (!Number.isFinite(max) || max <= 0) return sorted;

    return sorted.slice(-max);
  }

  function getAttendanceDateKeys(players, max = 12) {
    return resolveAttendanceDateKeys(players, max);
  }

  function normalizeDateKeys(dateKeys) {
    if (Array.isArray(dateKeys) && dateKeys.every((value) => typeof value === "string")) {
      return dateKeys.filter((dateKey) => /^\d{4}-\d{2}-\d{2}$/.test(dateKey)).sort();
    }
    return resolveAttendanceDateKeys(dateKeys, 0);
  }

  function computeAttendanceStreak(player, dateKeys) {
    const resolvedDates = normalizeDateKeys(dateKeys);
    let count = 0;
    for (let i = resolvedDates.length - 1; i >= 0; i -= 1) {
      const date = resolvedDates[i];
      if (player?.attendance?.[date] === true) count += 1;
      else break;
    }
    return count;
  }

  function getPlayerAttendanceSummary(player, dateKeys) {
    const resolvedDates = normalizeDateKeys(dateKeys);
    const present = resolvedDates.reduce((count, date) => {
      return count + (player?.attendance?.[date] === true ? 1 : 0);
    }, 0);
    const total = resolvedDates.length;
    const attendancePercent = total > 0 ? Math.round((present / total) * 100) : 0;
    const currentStreak = computeAttendanceStreak(player, resolvedDates);
    return { present, total, attendancePercent, currentStreak };
  }

  window.attendanceMetrics = {
    getAttendanceDateKeys,
    computeAttendanceStreak,
    getPlayerAttendanceSummary
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

  window.confirmAction = function confirmAction(options = {}) {
    const {
      title = "Confirm action",
      message = "Are you sure you want to continue?",
      confirmText = "Confirm",
      cancelText = "Cancel",
      danger = false
    } = options;

    if (!document || !document.body) {
      return Promise.resolve(window.confirm(message));
    }

    let modal = document.getElementById("confirm-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.className = "modal hidden";
      modal.id = "confirm-modal";
      modal.setAttribute("aria-hidden", "true");
      modal.innerHTML = `
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div class="modal-header">
            <h3 id="confirm-title">Confirm action</h3>
          </div>
          <div class="modal-body">
            <p class="muted" id="confirm-message"></p>
          </div>
          <div class="modal-actions">
            <button class="ghost-btn" type="button" id="confirm-cancel">Cancel</button>
            <button class="danger-btn" type="button" id="confirm-accept">Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const titleEl = modal.querySelector("#confirm-title");
    const messageEl = modal.querySelector("#confirm-message");
    const cancelBtn = modal.querySelector("#confirm-cancel");
    const confirmBtn = modal.querySelector("#confirm-accept");

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (cancelBtn) cancelBtn.textContent = cancelText;
    if (confirmBtn) {
      confirmBtn.textContent = confirmText;
      confirmBtn.className = danger ? "danger-btn" : "action-btn";
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");

    return new Promise((resolve) => {
      const close = (confirmed) => {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
        modal.removeEventListener("click", onOverlayClick);
        document.removeEventListener("keydown", onKeyDown);
        resolve(confirmed);
      };

      const onConfirm = () => close(true);
      const onCancel = () => close(false);
      const onOverlayClick = (event) => {
        if (event.target === modal) onCancel();
      };
      const onKeyDown = (event) => {
        if (event.key === "Escape") onCancel();
      };

      if (confirmBtn) confirmBtn.addEventListener("click", onConfirm, { once: true });
      if (cancelBtn) cancelBtn.addEventListener("click", onCancel, { once: true });
      modal.addEventListener("click", onOverlayClick);
      document.addEventListener("keydown", onKeyDown);
    });
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

  function initNotes(triggerButton) {
    if (!triggerButton || document.getElementById("notes-modal")) return;

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
    let isLoadingNotes = false;

    function toNoteTimestamp(note) {
      return note?.updatedAt || note?.updated_at || note?.createdAt || note?.created_at;
    }

    function renderNotes(items, total) {
      listEl.innerHTML = "";
      countEl.textContent = String(total);
      countEl.classList.toggle("hidden", total <= 0);
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
          <div class="note-meta">${formatRelativeTime(toNoteTimestamp(note))}</div>
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
      if (isLoadingNotes) return;
      isLoadingNotes = true;

      const query = searchInput.value.trim();
      const qParam = query ? `&q=${encodeURIComponent(query)}` : "";
      window
        .apiFetch(`/notes?limit=20&page=1${qParam}`)
        .then((data) => {
          const items = data?.items || data?.data || [];
          renderNotes(items, data?.total || items.length);
        })
        .catch(() => {
          renderNotes([], 0);
        })
        .finally(() => {
          isLoadingNotes = false;
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

    triggerButton.addEventListener("click", openModal);
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
      const isEditing = Boolean(editingId);
      const request = isEditing
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
          window.toast(isEditing ? "Note updated" : "Note created", "success");
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
              errorEl.textContent = err.message || "Unable to delete note.";
            });
        });
      }
    });

    loadNotes();
  }

  window.addEventListener("DOMContentLoaded", bootstrapApp);
})();
