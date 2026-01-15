(function () {
  const clubNameInput = document.getElementById("setting-club-name");
  const seasonInput = document.getElementById("setting-season");
  const currencyInput = document.getElementById("setting-currency");
  const newMemberFeeInput = document.getElementById("setting-fee-new");
  const renewalFeeInput = document.getElementById("setting-fee-renewal");
  const attendanceStartInput = document.getElementById("setting-attendance-start");
  const attendanceLockInput = document.getElementById("setting-attendance-lock");
  const yellowFineInput = document.getElementById("setting-fine-yellow");
  const redFineInput = document.getElementById("setting-fine-red");
  const scheduleBody = document.getElementById("monthly-schedule-body");
  const addScheduleBtn = document.getElementById("add-schedule-rule");
  const saveBtn = document.getElementById("settings-save");
  const resetBtn = document.getElementById("settings-reset");
  const errorEl = document.getElementById("settings-error");
  const seasonYearInput = document.getElementById("season-year");
  const resetAttendance = document.getElementById("reset-attendance");
  const resetMonthly = document.getElementById("reset-monthly");
  const resetYearly = document.getElementById("reset-yearly");
  const resetStats = document.getElementById("reset-stats");
  const resetDiscipline = document.getElementById("reset-discipline");
  const rolloverBtn = document.getElementById("season-rollover");
  const resetSeasonBtn = document.getElementById("season-reset");
  const seasonModal = document.getElementById("season-modal");
  const seasonModalTitle = document.getElementById("season-modal-title");
  const seasonModalText = document.getElementById("season-modal-text");
  const seasonConfirmInput = document.getElementById("season-confirm-input");
  const seasonCancelBtn = document.getElementById("season-cancel");
  const seasonConfirmBtn = document.getElementById("season-confirm");
  const importType = document.getElementById("import-type");
  const importCsv = document.getElementById("import-csv");
  const importBtn = document.getElementById("import-submit");
  const importError = document.getElementById("import-error");
  const importResult = document.getElementById("import-result");

  if (
    !clubNameInput ||
    !seasonInput ||
    !currencyInput ||
    !newMemberFeeInput ||
    !renewalFeeInput ||
    !attendanceStartInput ||
    !attendanceLockInput ||
    !saveBtn ||
    !resetBtn ||
    !errorEl ||
    !yellowFineInput ||
    !redFineInput ||
    !scheduleBody ||
    !addScheduleBtn ||
    !seasonYearInput ||
    !resetAttendance ||
    !resetMonthly ||
    !resetYearly ||
    !resetStats ||
    !resetDiscipline ||
    !rolloverBtn ||
    !resetSeasonBtn ||
    !seasonModal ||
    !seasonModalTitle ||
    !seasonModalText ||
    !seasonConfirmInput ||
    !seasonCancelBtn ||
    !seasonConfirmBtn ||
    !importType ||
    !importCsv ||
    !importBtn ||
    !importError ||
    !importResult
  ) {
    return;
  }

  let defaults = null;
  let monthlySchedule = [];
  let pendingAction = null;

  function getDefaultMonth() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${now.getFullYear()}-${month}`;
  }

  function normalizeMonth(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    const match = trimmed.match(/^(\d{4})-(\d{1,2})$/);
    if (!match) return "";
    const year = match[1];
    const month = match[2].padStart(2, "0");
    return `${year}-${month}`;
  }

  function buildScheduleRow(item) {
    const row = document.createElement("tr");
    const fromValue = normalizeMonth(item?.from) || getDefaultMonth();
    const amountValue = Number.isFinite(Number(item?.amount)) ? Number(item.amount) : 0;

    row.innerHTML = `
      <td>
        <input class="input schedule-input schedule-from" type="month" value="${fromValue}" />
      </td>
      <td>
        <input
          class="input schedule-input schedule-amount"
          type="number"
          min="0"
          step="100"
          value="${amountValue}"
        />
      </td>
      <td>
        <button class="ghost-btn schedule-remove" type="button">Remove</button>
      </td>
    `;

    return row;
  }

  function renderSchedule(schedule) {
    scheduleBody.innerHTML = "";
    const items = schedule && schedule.length ? schedule : [{ from: getDefaultMonth(), amount: 0 }];
    items.forEach((item) => {
      scheduleBody.appendChild(buildScheduleRow(item));
    });
  }

  function readScheduleFromTable() {
    const rows = Array.from(scheduleBody.querySelectorAll("tr"));
    if (!rows.length) {
      return { error: "Monthly schedule must contain at least one rule." };
    }

    const seen = new Set();
    const schedule = [];
    for (const row of rows) {
      const fromInput = row.querySelector(".schedule-from");
      const amountInput = row.querySelector(".schedule-amount");
      const from = normalizeMonth(fromInput?.value);
      const amount = Number(amountInput?.value);

      if (!from) {
        return { error: "Each schedule row needs a valid month." };
      }
      if (seen.has(from)) {
        return { error: "Monthly schedule cannot contain duplicate months." };
      }
      if (!Number.isFinite(amount) || amount < 0) {
        return { error: "Monthly schedule amounts must be non-negative numbers." };
      }

      seen.add(from);
      schedule.push({ from, amount });
    }

    return { schedule };
  }

  function setFormValues(settings) {
    clubNameInput.value = settings.clubName || "";
    seasonInput.value = String(settings.season || "");
    currencyInput.value = settings.currencySymbol || "";
    monthlySchedule = settings.fees?.monthlySchedule || [];
    renderSchedule(monthlySchedule);
    newMemberFeeInput.value = String(settings.fees?.newMemberYearly ?? 0);
    renewalFeeInput.value = String(settings.fees?.renewalYearly ?? 0);
    attendanceStartInput.value = settings.attendance?.startDate || "";
    attendanceLockInput.checked = Boolean(settings.attendance?.lockFuture);
    yellowFineInput.value = String(settings.discipline?.yellowFine ?? 0);
    redFineInput.value = String(settings.discipline?.redFine ?? 0);
    seasonYearInput.value = String((settings.season || new Date().getFullYear()) + 1);
  }

  function getFormPayload() {
    return {
      clubName: clubNameInput.value.trim(),
      season: Number(seasonInput.value),
      currencySymbol: currencyInput.value.trim(),
      fees: {
        monthlySchedule,
        newMemberYearly: Number(newMemberFeeInput.value),
        renewalYearly: Number(renewalFeeInput.value)
      },
      attendance: {
        startDate: attendanceStartInput.value,
        lockFuture: attendanceLockInput.checked
      },
      discipline: {
        yellowFine: Number(yellowFineInput.value),
        redFine: Number(redFineInput.value)
      }
    };
  }

  function loadSettings() {
    return window
      .apiFetch("/settings")
      .then((settings) => {
        defaults = settings;
        setFormValues(settings);
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to load settings.";
      });
  }

  function gatherResetFlags() {
    return {
      attendance: resetAttendance.checked,
      monthlyPayments: resetMonthly.checked,
      yearlyPayments: resetYearly.checked,
      stats: resetStats.checked,
      disciplinePaid: resetDiscipline.checked
    };
  }

  function openSeasonModal(title, message, action) {
    pendingAction = action;
    seasonModalTitle.textContent = title;
    seasonModalText.textContent = message;
    seasonConfirmInput.value = "";
    seasonConfirmBtn.disabled = true;
    seasonModal.classList.remove("hidden");
    seasonModal.setAttribute("aria-hidden", "false");
  }

  function closeSeasonModal() {
    seasonModal.classList.add("hidden");
    seasonModal.setAttribute("aria-hidden", "true");
    pendingAction = null;
  }

  saveBtn.addEventListener("click", () => {
    errorEl.textContent = "";
    const scheduleResult = readScheduleFromTable();
    if (scheduleResult.error) {
      errorEl.textContent = scheduleResult.error;
      return;
    }
    monthlySchedule = scheduleResult.schedule;
    const payload = getFormPayload();
    saveBtn.disabled = true;

    window
      .apiFetch("/settings", {
        method: "PATCH",
        body: JSON.stringify(payload)
      })
      .then((settings) => {
        defaults = settings;
        setFormValues(settings);
        window.toast("Settings saved", "success");
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to save settings.";
      })
      .finally(() => {
        saveBtn.disabled = false;
      });
  });

  resetBtn.addEventListener("click", () => {
    if (!defaults) return;
    if (!confirm("Reset settings to defaults?")) return;
    setFormValues(defaults);
  });

  seasonConfirmInput.addEventListener("input", () => {
    seasonConfirmBtn.disabled = seasonConfirmInput.value.trim() !== "ROLLOVER";
  });

  seasonCancelBtn.addEventListener("click", closeSeasonModal);
  seasonModal.addEventListener("click", (event) => {
    if (event.target === seasonModal) closeSeasonModal();
  });

  rolloverBtn.addEventListener("click", () => {
    if (!defaults) return;
    const newSeasonYear = Number(seasonYearInput.value);
    const reset = gatherResetFlags();
    const message = `This will roll over to season ${newSeasonYear} and reset selected data.`;
    openSeasonModal("Confirm Season Rollover", message, { type: "rollover", newSeasonYear, reset });
  });

  resetSeasonBtn.addEventListener("click", () => {
    const reset = gatherResetFlags();
    const message = "This will reset selected data for the current season.";
    openSeasonModal("Confirm Season Reset", message, { type: "reset", reset });
  });

  seasonConfirmBtn.addEventListener("click", () => {
    if (!pendingAction) return;
    seasonConfirmBtn.disabled = true;
    const endpoint =
      pendingAction.type === "rollover" ? "/admin/rollover" : "/admin/reset-season";
    const payload =
      pendingAction.type === "rollover"
        ? { newSeasonYear: pendingAction.newSeasonYear, reset: pendingAction.reset }
        : { reset: pendingAction.reset };

    window
      .apiFetch(endpoint, { method: "POST", body: JSON.stringify(payload) })
      .then((result) => {
        const backup = result.backup ? Object.values(result.backup).join(", ") : "";
        window.toast(`Season rollover complete. Backup saved: ${backup}`, "success");
        closeSeasonModal();
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to update season.";
        closeSeasonModal();
      })
      .finally(() => {
        seasonConfirmBtn.disabled = false;
      });
  });

  importBtn.addEventListener("click", () => {
    importError.textContent = "";
    importResult.textContent = "";
    const csv = importCsv.value.trim();
    if (!csv) {
      importError.textContent = "Paste CSV data to import.";
      return;
    }

    const type = importType.value;
    importBtn.disabled = true;
    window
      .apiFetch(`/import/${type}`, {
        method: "POST",
        body: JSON.stringify({ csv })
      })
      .then((result) => {
        if (type === "players") {
          importResult.textContent = `Created: ${result.created}, Skipped: ${result.skipped}`;
        } else {
          importResult.textContent = `Updated: ${result.updated}, Not found: ${result.notFound?.length || 0}`;
        }
        window.toast("Import complete", "success");
      })
      .catch((err) => {
        importError.textContent = err.message || "Unable to import data.";
      })
      .finally(() => {
        importBtn.disabled = false;
      });
  });

  addScheduleBtn.addEventListener("click", () => {
    errorEl.textContent = "";
    scheduleBody.appendChild(buildScheduleRow({ from: getDefaultMonth(), amount: 0 }));
  });

  scheduleBody.addEventListener("click", (event) => {
    const target = event.target;
    if (!target.classList.contains("schedule-remove")) return;

    const rows = scheduleBody.querySelectorAll("tr");
    if (rows.length <= 1) {
      errorEl.textContent = "At least one schedule rule is required.";
      return;
    }

    const row = target.closest("tr");
    if (row) row.remove();
  });

  loadSettings();
})();
