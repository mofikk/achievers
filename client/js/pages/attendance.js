(function () {
  const monthSelect = document.getElementById("attendance-month");
  const dateSelect = document.getElementById("attendance-date");
  const searchInput = document.getElementById("attendance-search");
  const markPresentBtn = document.getElementById("mark-present");
  const markAbsentBtn = document.getElementById("mark-absent");
  const saveBtn = document.getElementById("save-attendance");
  const summaryEl = document.getElementById("attendance-summary");
  const hintEl = document.getElementById("attendance-hint");
  const body = document.getElementById("attendance-body");

  if (
    !monthSelect ||
    !dateSelect ||
    !searchInput ||
    !markPresentBtn ||
    !markAbsentBtn ||
    !saveBtn ||
    !summaryEl ||
    !hintEl ||
    !body
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
    attendance: {},
    filteredIds: [],
    selectedDate: "",
    settings: defaultSettings
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

    state.selectedDate = dateSelect.value;
    updateAttendanceFromDate();
  }

  function updateAttendanceFromDate() {
    const date = dateSelect.value;
    state.selectedDate = date;
    state.attendance = {};
    state.players.forEach((player) => {
      state.attendance[player.id] = player?.attendance?.[date] === true;
    });
    isFuture = date ? isFutureDate(date) : false;
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

  function loadPlayers() {
    return window
      .apiFetch("/players")
      .then((players) => {
        state.players = players;
        populateMonths();
        populateDates();
        renderTable();
      })
      .catch(console.error);
  }

  function loadSettings() {
    return window
      .apiFetch("/settings")
      .then((settings) => {
        state.settings = settings;
      })
      .catch(() => {
        state.settings = defaultSettings;
      });
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

  markPresentBtn.addEventListener("click", () => {
    setAllVisible(true);
  });

  markAbsentBtn.addEventListener("click", () => {
    setAllVisible(false);
  });

  saveBtn.addEventListener("click", () => {
    if (!state.selectedDate || isFuture) return;
    setSaving(true);

    const updates = state.players.map((player) => ({
      id: player.id,
      present: !!state.attendance[player.id]
    }));

    window
      .apiFetch(`/attendance/${state.selectedDate}`, {
        method: "PATCH",
        body: JSON.stringify({ updates })
      })
      .then(() => {
        window.toast("Attendance saved", "success");
        state.players.forEach((player) => {
          if (!player.attendance) player.attendance = {};
          player.attendance[state.selectedDate] = !!state.attendance[player.id];
        });
      })
      .catch((err) => {
        window.toast(err.message || "Unable to save attendance.", "error");
      })
      .finally(() => {
        setSaving(false);
      });
  });

  loadSettings().finally(loadPlayers);
})();
