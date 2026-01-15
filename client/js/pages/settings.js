(function () {
  const clubNameInput = document.getElementById("setting-club-name");
  const seasonInput = document.getElementById("setting-season");
  const currencyInput = document.getElementById("setting-currency");
  const monthlyFeeInput = document.getElementById("setting-fee-monthly");
  const newMemberFeeInput = document.getElementById("setting-fee-new");
  const renewalFeeInput = document.getElementById("setting-fee-renewal");
  const attendanceStartInput = document.getElementById("setting-attendance-start");
  const attendanceLockInput = document.getElementById("setting-attendance-lock");
  const yellowFineInput = document.getElementById("setting-fine-yellow");
  const redFineInput = document.getElementById("setting-fine-red");
  const saveBtn = document.getElementById("settings-save");
  const resetBtn = document.getElementById("settings-reset");
  const errorEl = document.getElementById("settings-error");

  if (
    !clubNameInput ||
    !seasonInput ||
    !currencyInput ||
    !monthlyFeeInput ||
    !newMemberFeeInput ||
    !renewalFeeInput ||
    !attendanceStartInput ||
    !attendanceLockInput ||
    !saveBtn ||
    !resetBtn ||
    !errorEl ||
    !yellowFineInput ||
    !redFineInput
  ) {
    return;
  }

  let defaults = null;

  function setFormValues(settings) {
    clubNameInput.value = settings.clubName || "";
    seasonInput.value = String(settings.season || "");
    currencyInput.value = settings.currencySymbol || "";
    monthlyFeeInput.value = String(settings.fees?.monthly ?? 0);
    newMemberFeeInput.value = String(settings.fees?.newMemberYearly ?? 0);
    renewalFeeInput.value = String(settings.fees?.renewalYearly ?? 0);
    attendanceStartInput.value = settings.attendance?.startDate || "";
    attendanceLockInput.checked = Boolean(settings.attendance?.lockFuture);
    yellowFineInput.value = String(settings.discipline?.yellowFine ?? 0);
    redFineInput.value = String(settings.discipline?.redFine ?? 0);
  }

  function getFormPayload() {
    return {
      clubName: clubNameInput.value.trim(),
      season: Number(seasonInput.value),
      currencySymbol: currencyInput.value.trim(),
      fees: {
        monthly: Number(monthlyFeeInput.value),
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

  saveBtn.addEventListener("click", () => {
    errorEl.textContent = "";
    const payload = getFormPayload();
    saveBtn.disabled = true;

    window
      .apiFetch("/settings", {
        method: "PATCH",
        body: JSON.stringify(payload)
      })
      .then((settings) => {
        defaults = settings;
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

  loadSettings();
})();
