(function () {
  const monthSelect = document.getElementById("attendance-month");
  const dateSelect = document.getElementById("attendance-date");
  const searchInput = document.getElementById("attendance-search");
  const markPresentBtn = document.getElementById("mark-present");
  const markAbsentBtn = document.getElementById("mark-absent");
  const addPlayerBtn = document.getElementById("add-player-attendance");
  const saveBtn = document.getElementById("save-attendance");
  const summaryEl = document.getElementById("attendance-summary");
  const hintEl = document.getElementById("attendance-hint");
  const body = document.getElementById("attendance-body");
  const summaryRawInput = document.getElementById("session-summary-raw");
  const summaryTitle = document.getElementById("session-summary-title");
  const summaryReviewBtn = document.getElementById("review-session-summary");
  const summaryCommitBtn = document.getElementById("commit-session-summary");
  const summaryStatus = document.getElementById("session-summary-status");
  const summaryError = document.getElementById("session-summary-error");
  const summaryAttendanceBody = document.getElementById("session-summary-attendance-body");
  const summaryGoalsBody = document.getElementById("session-summary-goals-body");
  const summaryCardsBody = document.getElementById("session-summary-cards-body");
  const summaryVisitorsBody = document.getElementById("session-summary-visitors-body");
  const summaryWarningsBody = document.getElementById("session-summary-warnings-body");
  const summaryExisting = document.getElementById("session-summary-existing");

  if (
    !monthSelect ||
    !dateSelect ||
    !searchInput ||
    !markPresentBtn ||
    !markAbsentBtn ||
    !addPlayerBtn ||
    !saveBtn ||
    !summaryEl ||
    !hintEl ||
    !body ||
    !summaryRawInput ||
    !summaryTitle ||
    !summaryReviewBtn ||
    !summaryCommitBtn ||
    !summaryStatus ||
    !summaryError ||
    !summaryAttendanceBody ||
    !summaryGoalsBody ||
    !summaryCardsBody ||
    !summaryVisitorsBody ||
    !summaryWarningsBody ||
    !summaryExisting
  ) {
    return;
  }

  const defaultSettings = {
    attendance: { startDate: "2026-01-10", lockFuture: true }
  };
  const monthLabels = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  const currentYear = new Date().getFullYear();

  const state = {
    players: [],
    attendanceRecords: [],
    attendance: {},
    filteredIds: [],
    selectedDate: "",
    settings: defaultSettings,
    reviewedSummary: null,
    hasCommittedSummaryForDate: false
  };
  let isFuture = false;

  function formatDate(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function getSaturdays(year, monthIndex) {
    const dates = [];
    const date = new Date(year, monthIndex, 1);
    while (date.getMonth() === monthIndex) {
      if (date.getDay() === 6) {
        const dateStr = formatDate(year, monthIndex, date.getDate());
        if (dateStr >= state.settings.attendance.startDate) {
          dates.push(dateStr);
        }
      }
      date.setDate(date.getDate() + 1);
    }
    return dates;
  }

  function populateMonths() {
    monthSelect.innerHTML = "";
    monthLabels.forEach((label, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = label;
      if (index === new Date().getMonth()) option.selected = true;
      monthSelect.appendChild(option);
    });
  }

  function populateDates() {
    const monthIndex = Number(monthSelect.value);
    const saturdays = getSaturdays(currentYear, monthIndex);
    dateSelect.innerHTML = "";

    if (saturdays.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No Saturdays";
      dateSelect.appendChild(option);
      state.selectedDate = "";
      updateHint();
      renderTable();
      return;
    }

    saturdays.forEach((dateStr) => {
      const option = document.createElement("option");
      option.value = dateStr;
      option.textContent = dateStr;
      dateSelect.appendChild(option);
    });

    const todayKey = new Date().toISOString().slice(0, 10);
    const latestPassed = [...saturdays].reverse().find((dateStr) => dateStr <= todayKey);
    const defaultDate = latestPassed || saturdays[saturdays.length - 1];
    if (defaultDate) {
      dateSelect.value = defaultDate;
    }

    state.selectedDate = dateSelect.value;
    updateAttendanceFromDate();
  }

  function updateAttendanceFromDate() {
    const date = dateSelect.value;
    state.selectedDate = date;
    state.attendance = {};
    const byPlayer = new Map();
    state.attendanceRecords.forEach((record) => {
      const recordDate = String(record?.date || "");
      const playerId = String(record?.player_id || "");
      if (!playerId || recordDate !== date) return;
      const existing = byPlayer.get(playerId);
      const currentSort = String(record?.updated_at || record?.created_at || "");
      const existingSort = String(existing?.updated_at || existing?.created_at || "");
      if (!existing || currentSort >= existingSort) {
        byPlayer.set(playerId, record);
      }
    });

    state.players.forEach((player) => {
      const record = byPlayer.get(String(player.id));
      state.attendance[player.id] = record ? record.status === true : false;
    });
    isFuture = date ? isFutureDate(date) : false;
    syncSessionSummaryForSelectedDate();
    updateHint();
    renderTable();
  }

  function isFutureDate(dateStr) {
    if (!state.settings.attendance.lockFuture) return false;
    const selected = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return selected.getTime() > today.getTime();
  }

  function updateHint() {
    if (!state.selectedDate) {
      hintEl.textContent = "Select a Saturday to mark attendance.";
      saveBtn.disabled = true;
      markPresentBtn.disabled = true;
      markAbsentBtn.disabled = true;
      return;
    }
    if (isFuture) {
      hintEl.textContent =
        "This date is in the future. Attendance can only be recorded after the match.";
    } else {
      hintEl.textContent = "";
    }
    saveBtn.disabled = isFuture;
    markPresentBtn.disabled = isFuture;
    markAbsentBtn.disabled = isFuture;
  }

  function updateSummary() {
    let present = 0;
    let absent = 0;
    state.filteredIds.forEach((id) => {
      if (state.attendance[id]) present += 1;
      else absent += 1;
    });
    summaryEl.textContent = `Present: ${present} | Absent: ${absent}`;
  }

  function renderTable() {
    const search = searchInput.value.trim().toLowerCase();
    state.filteredIds = [];
    body.innerHTML = "";

    state.players.forEach((player) => {
      const name = String(player.name || "");
      const nickname = String(player.nickname || "");
      const haystack = `${name} ${nickname}`.toLowerCase();
      if (search && !haystack.includes(search)) return;

      state.filteredIds.push(player.id);

      const row = document.createElement("tr");
      row.className = "attendance-row";
      row.innerHTML = `
        <td>${name}</td>
        <td>${nickname || "-"}</td>
        <td>
          <input type="checkbox" class="attendance-toggle" data-id="${player.id}" ${
            state.attendance[player.id] ? "checked" : ""
          } ${isFuture ? "disabled" : ""} />
        </td>
      `;
      body.appendChild(row);
    });

    updateSummary();
  }

  function setSummaryStatus(message) {
    summaryStatus.textContent = message || "";
  }

  function clearSummaryError() {
    summaryError.textContent = "";
  }

  function setSummaryError(message) {
    summaryError.textContent = message || "";
  }

  function renderSessionSummaryTables(review) {
    summaryAttendanceBody.innerHTML = "";
    summaryGoalsBody.innerHTML = "";
    summaryCardsBody.innerHTML = "";
    summaryVisitorsBody.innerHTML = "";
    summaryWarningsBody.innerHTML = "";

    const attendanceRows = Array.isArray(review?.attendance) ? review.attendance : [];
    const goalsRows = Array.isArray(review?.goals) ? review.goals : [];
    const cardsRows = Array.isArray(review?.cards) ? review.cards : [];
    const visitorsRows = Array.isArray(review?.visitors_to_create) ? review.visitors_to_create : [];
    const warnings = Array.isArray(review?.warnings) ? review.warnings : [];

    if (!attendanceRows.length) {
      summaryAttendanceBody.innerHTML = '<tr><td colspan="3">No attendance rows parsed.</td></tr>';
    } else {
      attendanceRows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td data-label="Attendance (Resolved)">${row.resolved_name || "-"}</td>
          <td data-label="Type">${row.resolved_type || "-"}</td>
          <td data-label="Source">${row.source_name || "-"}</td>
        `;
        summaryAttendanceBody.appendChild(tr);
      });
    }

    if (!goalsRows.length) {
      summaryGoalsBody.innerHTML = '<tr><td colspan="3">No goals parsed.</td></tr>';
    } else {
      goalsRows.forEach((row) => {
        const status = row.status === "ok" ? "OK" : "NEEDS REVIEW";
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td data-label="Goals">${row.resolved_name || row.source_name || "-"}</td>
          <td data-label="Count">${Number(row.goals) || 0}</td>
          <td data-label="Status">${status}</td>
        `;
        summaryGoalsBody.appendChild(tr);
      });
    }

    if (!cardsRows.length) {
      summaryCardsBody.innerHTML = '<tr><td colspan="4">No cards parsed.</td></tr>';
    } else {
      cardsRows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td data-label="Cards">${row.resolved_name || row.source_name || "-"}</td>
          <td data-label="Type">${row.card_type || "-"}</td>
          <td data-label="Count">${Number(row.count) || 0}</td>
          <td data-label="Paid">${Number(row.paid_count) || 0}</td>
        `;
        summaryCardsBody.appendChild(tr);
      });
    }

    if (!visitorsRows.length) {
      summaryVisitorsBody.innerHTML = '<tr><td>No new visitors required.</td></tr>';
    } else {
      visitorsRows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td data-label="Visitors To Create">${row.source_name || "-"}</td>
        `;
        summaryVisitorsBody.appendChild(tr);
      });
    }

    if (!warnings.length) {
      summaryWarningsBody.innerHTML = '<tr><td>No warnings.</td></tr>';
    } else {
      warnings.forEach((warning) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${warning}</td>`;
        summaryWarningsBody.appendChild(tr);
      });
    }
  }

  function setSummaryCommitState(review) {
    const canCommit =
      Boolean(review?.can_commit) &&
      !isFuture &&
      Boolean(state.selectedDate) &&
      !state.hasCommittedSummaryForDate;
    summaryCommitBtn.disabled = !canCommit;
  }

  function setSummaryReviewLoading(isLoading) {
    summaryReviewBtn.disabled = isLoading;
    summaryReviewBtn.textContent = isLoading ? "Reviewing..." : "Review";
  }

  function setSummaryCommitLoading(isLoading) {
    summaryCommitBtn.disabled = isLoading;
    summaryCommitBtn.textContent = isLoading ? "Committing..." : "Accept & Commit";
  }

  function clearSessionSummaryTables() {
    renderSessionSummaryTables({
      attendance: [],
      goals: [],
      cards: [],
      visitors_to_create: [],
      warnings: []
    });
    state.reviewedSummary = null;
    setSummaryCommitState(null);
  }

  function updateSessionSummaryTitle() {
    const suffix = state.selectedDate ? ` for ${state.selectedDate}` : "";
    summaryTitle.textContent = `Saturday Session Summary${suffix}`;
  }

  function resetSessionSummaryDraftForDate() {
    summaryRawInput.value = "";
    clearSummaryError();
    setSummaryStatus("");
    clearSessionSummaryTables();
  }

  function loadExistingSessionSummary() {
    if (!state.selectedDate) {
      state.hasCommittedSummaryForDate = false;
      summaryRawInput.readOnly = false;
      summaryExisting.classList.add("hidden");
      summaryExisting.textContent = "";
      setSummaryCommitState(state.reviewedSummary);
      return;
    }
    window
      .apiFetch(`/attendance/session-summary?date=${encodeURIComponent(state.selectedDate)}`, { silent: true })
      .then((res) => {
        const row = res?.data || null;
        if (!row) {
          state.hasCommittedSummaryForDate = false;
          summaryRawInput.readOnly = false;
          summaryExisting.classList.add("hidden");
          summaryExisting.textContent = "";
          setSummaryCommitState(state.reviewedSummary);
          return;
        }
        state.hasCommittedSummaryForDate = true;
        summaryRawInput.value = String(row.raw_text || "");
        summaryRawInput.readOnly = true;
        const created = row.created_at ? new Date(row.created_at).toLocaleString() : "-";
        summaryExisting.textContent = `Committed summary exists for ${state.selectedDate} (saved ${created}).`;
        summaryExisting.classList.remove("hidden");
        if (row.review_json && typeof row.review_json === "object") {
          state.reviewedSummary = row.review_json;
          renderSessionSummaryTables(state.reviewedSummary);
        }
        setSummaryStatus("This date already has a committed summary. Commit is locked.");
        setSummaryCommitState(state.reviewedSummary);
      })
      .catch(() => {
        state.hasCommittedSummaryForDate = false;
        summaryRawInput.readOnly = false;
        summaryExisting.classList.add("hidden");
        summaryExisting.textContent = "";
        setSummaryCommitState(state.reviewedSummary);
      });
  }

  function syncSessionSummaryForSelectedDate() {
    updateSessionSummaryTitle();
    resetSessionSummaryDraftForDate();
    loadExistingSessionSummary();
  }

  function setAllVisible(value) {
    if (isFuture) return;
    state.filteredIds.forEach((id) => {
      state.attendance[id] = value;
    });
    body.querySelectorAll(".attendance-toggle").forEach((checkbox) => {
      checkbox.checked = value;
    });
    updateSummary();
  }

  function setSaving(isSaving) {
    saveBtn.disabled = isSaving || !state.selectedDate || isFuture;
    saveBtn.textContent = isSaving ? "Saving..." : "Save";
  }

  function setLoadingState() {
    body.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
  }

  async function loadPlayersAndAttendance() {
    setLoadingState();
    if (window.clearPartialData) window.clearPartialData();
    try {
      const attendanceRequest = window.apiFetch("/attendance", { silent: true }).catch((error) => {
        if (window.reportPartialData) {
          window.reportPartialData(error?.message || "Attendance records are temporarily unavailable.");
        }
        return { data: [] };
      });
      const [playersResponse, attendanceResponse] = await Promise.all([
        window.apiFetch("/players", { silent: true }).catch((error) => {
          if (window.reportPartialData) {
            window.reportPartialData(error?.message || "Players are temporarily unavailable.");
          }
          return { data: [] };
        }),
        attendanceRequest
      ]);

      state.players = Array.isArray(playersResponse?.data) ? playersResponse.data : [];
      state.attendanceRecords = Array.isArray(attendanceResponse?.data) ? attendanceResponse.data : [];
      sortPlayersByAttendance();
      populateMonths();
      populateDates();
      renderTable();
    } catch (error) {
      console.error(error);
      body.innerHTML = "";
      if (window.toast) window.toast(error.message || "Unable to load attendance data.", "error");
    }
  }

  function sortPlayersByAttendance() {
    const presentCountByPlayer = new Map();
    state.attendanceRecords.forEach((record) => {
      const playerId = String(record?.player_id || "");
      if (!playerId) return;
      if (record?.status !== true) return;
      presentCountByPlayer.set(playerId, (presentCountByPlayer.get(playerId) || 0) + 1);
    });

    state.players.sort((a, b) => {
      const aCount = presentCountByPlayer.get(String(a.id)) || 0;
      const bCount = presentCountByPlayer.get(String(b.id)) || 0;
      if (bCount !== aCount) return bCount - aCount;
      return String(a.name || "").localeCompare(String(b.name || ""));
    });
  }

  async function loadSettings() {
    try {
      const response = await window.apiFetch("/settings", { silent: true });
      state.settings = response?.data || defaultSettings;
    } catch (error) {
      if (window.reportPartialData) {
        window.reportPartialData(error?.message || "Settings are temporarily unavailable.");
      }
      state.settings = defaultSettings;
    }
  }

  monthSelect.addEventListener("change", populateDates);
  dateSelect.addEventListener("change", updateAttendanceFromDate);
  searchInput.addEventListener("input", renderTable);

  body.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.classList.contains("attendance-toggle")) return;
    if (isFuture) return;
    const id = target.getAttribute("data-id");
    state.attendance[id] = target.checked;
    updateSummary();
  });

  body.addEventListener("click", (event) => {
    if (isFuture) return;
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains("attendance-toggle")) return;

    const row = target.closest("tr");
    if (!row) return;
    const checkbox = row.querySelector(".attendance-toggle");
    if (!(checkbox instanceof HTMLInputElement) || checkbox.disabled) return;

    checkbox.checked = !checkbox.checked;
    const id = checkbox.getAttribute("data-id");
    if (!id) return;
    state.attendance[id] = checkbox.checked;
    updateSummary();
  });

  markPresentBtn.addEventListener("click", () => {
    setAllVisible(true);
  });

  markAbsentBtn.addEventListener("click", () => {
    setAllVisible(false);
  });

  addPlayerBtn.addEventListener("click", () => {
    window.location.href = "/players.html";
  });

  summaryReviewBtn.addEventListener("click", () => {
    clearSummaryError();
    const rawText = String(summaryRawInput.value || "").trim();
    if (!rawText) {
      setSummaryError("Paste weekly text before review.");
      return;
    }
    if (!state.selectedDate) {
      setSummaryError("Select a Saturday date first.");
      return;
    }
    if (isFuture) {
      setSummaryError("Cannot review a future date.");
      return;
    }
    if (state.hasCommittedSummaryForDate) {
      setSummaryError("A summary already exists for this date. Choose another date.");
      return;
    }
    setSummaryReviewLoading(true);
    setSummaryStatus("Reviewing parsed data...");
    window
      .apiFetch("/attendance/session-summary/review", {
        method: "POST",
        body: JSON.stringify({ raw_text: rawText })
      })
      .then((res) => {
        const review = res?.data || null;
        state.reviewedSummary = review;
        renderSessionSummaryTables(review);
        setSummaryCommitState(review);
        const warnings = Array.isArray(review?.warnings) ? review.warnings.length : 0;
        setSummaryStatus(
          review?.can_commit
            ? `Review complete. Ready to commit for ${state.selectedDate}.${warnings ? ` Warnings: ${warnings}` : ""}`
            : `Review complete with issues. Resolve warnings before commit.`
        );
      })
      .catch((error) => {
        setSummaryError(error?.message || "Review failed.");
        setSummaryStatus("");
        clearSessionSummaryTables();
      })
      .finally(() => {
        setSummaryReviewLoading(false);
      });
  });

  summaryCommitBtn.addEventListener("click", () => {
    clearSummaryError();
    if (!state.reviewedSummary) {
      setSummaryError("Run review first.");
      return;
    }
    if (!state.reviewedSummary.can_commit) {
      setSummaryError("Review still has unresolved issues.");
      return;
    }
    if (!state.selectedDate || isFuture) {
      setSummaryError("Selected date is invalid for commit.");
      return;
    }
    if (state.hasCommittedSummaryForDate) {
      setSummaryError("A summary already exists for this date.");
      return;
    }
    setSummaryCommitLoading(true);
    setSummaryStatus("Committing session summary...");
    window
      .apiFetch("/attendance/session-summary/commit", {
        method: "POST",
        body: JSON.stringify({
          session_date: state.selectedDate,
          raw_text: String(summaryRawInput.value || ""),
          review: state.reviewedSummary
        })
      })
      .then(() => {
        window.toast("Session summary committed successfully.", "success");
        setSummaryStatus(`Committed summary for ${state.selectedDate}.`);
        summaryRawInput.value = "";
        clearSessionSummaryTables();
        state.hasCommittedSummaryForDate = true;
        setSummaryCommitState(state.reviewedSummary);
        loadPlayersAndAttendance();
      })
      .catch((error) => {
        setSummaryError(error?.message || "Commit failed.");
        setSummaryStatus("");
      })
      .finally(() => {
        setSummaryCommitLoading(false);
      });
  });

  saveBtn.addEventListener("click", () => {
    if (!state.selectedDate || isFuture) return;
    setSaving(true);

    const updates = state.players.map((player) => ({
      id: player.id,
      status: !!state.attendance[player.id]
    }));

    Promise.all(
      updates.map((entry) =>
        window.apiFetch("/attendance", {
          method: "POST",
          body: JSON.stringify({
            player_id: entry.id,
            date: state.selectedDate,
            status: entry.status
          })
        })
      )
    )
      .then((responses) => {
        state.attendanceRecords = state.attendanceRecords.filter(
          (record) => String(record.date || "") !== state.selectedDate
        );
        responses.forEach((response) => {
          if (response?.data) state.attendanceRecords.push(response.data);
        });
        sortPlayersByAttendance();
        renderTable();
        window.toast("Attendance saved", "success");
      })
      .catch((err) => {
        console.error(err);
        window.toast(err.message || "Unable to save attendance.", "error");
      })
      .finally(() => {
        setSaving(false);
      });
  });

  loadSettings().finally(loadPlayersAndAttendance);
  clearSessionSummaryTables();
  updateSessionSummaryTitle();
})();
