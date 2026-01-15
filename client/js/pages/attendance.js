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

  const MIN_DATE = "2026-01-10";
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
    selectedDate: ""
  };

  function formatDate(year, monthIndex, day) {
    return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function getSaturdays(year, monthIndex) {
    const dates = [];
    const date = new Date(year, monthIndex, 1);
    while (date.getMonth() === monthIndex) {
      if (date.getDay() === 6) {
        const dateStr = formatDate(year, monthIndex, date.getDate());
        if (dateStr >= MIN_DATE) {
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
    updateHint();
    renderTable();
  }

  function updateHint() {
    if (!state.selectedDate) {
      hintEl.textContent = "Select a Saturday to mark attendance.";
      saveBtn.disabled = true;
      return;
    }
    hintEl.textContent = "";
    saveBtn.disabled = false;
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
          } />
        </td>
      `;
      body.appendChild(row);
    });

    updateSummary();
  }

  function setAllVisible(value) {
    state.filteredIds.forEach((id) => {
      state.attendance[id] = value;
    });
    body.querySelectorAll(".attendance-toggle").forEach((checkbox) => {
      checkbox.checked = value;
    });
    updateSummary();
  }

  function setSaving(isSaving) {
    saveBtn.disabled = isSaving || !state.selectedDate;
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

  monthSelect.addEventListener("change", populateDates);
  dateSelect.addEventListener("change", updateAttendanceFromDate);
  searchInput.addEventListener("input", renderTable);

  body.addEventListener("change", (event) => {
    const target = event.target;
    if (!target.classList.contains("attendance-toggle")) return;
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
    if (!state.selectedDate) return;
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

  loadPlayers();
})();
