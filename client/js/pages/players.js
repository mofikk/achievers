(function () {
  const body = document.getElementById("players-body");
  const addBtn = document.getElementById("add-player-btn");
  const modal = document.getElementById("player-modal");
  const form = document.getElementById("player-form");
  const cancelBtn = document.getElementById("cancel-player-btn");
  const errorEl = document.getElementById("player-error");

  if (!body || !addBtn || !modal || !form || !cancelBtn || !errorEl) return;

  const now = new Date();
  const yearKey = String(now.getFullYear());
  const monthKey = `${yearKey}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  function formatStatus(value, fallback) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : fallback;
  }

  function renderPlayers(players) {
    body.innerHTML = "";

    players.forEach((player) => {
      const yearly = player?.subscriptions?.year?.[yearKey] || null;
      const monthly = player?.subscriptions?.months?.[monthKey] || null;

      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${player.name}</td>
        <td>${player.position}</td>
        <td>${formatStatus(yearly, "Pending")}</td>
        <td>${formatStatus(monthly, "Pending")}</td>
        <td><button class="action-btn" data-name="${player.name}">View</button></td>
      `;
      body.appendChild(row);
    });

    body.querySelectorAll(".action-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        alert(`View player: ${btn.dataset.name}`);
      });
    });
  }

  function loadPlayers() {
    return window.apiFetch("/players").then(renderPlayers).catch(console.error);
  }

  function openModal() {
    errorEl.textContent = "";
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }

  addBtn.addEventListener("click", openModal);
  cancelBtn.addEventListener("click", () => {
    form.reset();
    closeModal();
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      form.reset();
      closeModal();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    errorEl.textContent = "";

    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const position = String(formData.get("position") || "").trim();
    const jerseyRaw = String(formData.get("jerseyNumber") || "").trim();

    if (!name || !position) {
      errorEl.textContent = "Name and position are required.";
      return;
    }

    const jerseyNumber = jerseyRaw ? Number(jerseyRaw) : null;
    const payload = {
      name,
      position,
      jerseyNumber: Number.isFinite(jerseyNumber) ? jerseyNumber : null
    };

    window
      .apiFetch("/players", {
        method: "POST",
        body: JSON.stringify(payload)
      })
      .then(() => {
        form.reset();
        closeModal();
        return loadPlayers();
      })
      .catch((err) => {
        errorEl.textContent = err.message || "Unable to save player.";
      });
  });

  loadPlayers();
})();
