(function () {
  const body = document.getElementById("players-body");
  if (!body) return;

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const yearKey = String(now.getFullYear());

  function formatStatus(value, fallback) {
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : fallback;
  }

  window
    .apiFetch("/players")
    .then((players) => {
      body.innerHTML = "";

      players.forEach((player) => {
        const yearly = player?.subscriptions?.year?.[yearKey];
        const monthly = player?.subscriptions?.months?.[monthKey];

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
    })
    .catch((err) => {
      console.error(err);
    });
})();
