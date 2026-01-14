(function () {
  const totalEl = document.getElementById("total-players");
  const paidEl = document.getElementById("paid-month");
  const pendingEl = document.getElementById("pending-month");

  if (!totalEl) return;

  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  window
    .apiFetch("/players")
    .then((players) => {
      totalEl.textContent = players.length;

      let paid = 0;
      let pending = 0;

      players.forEach((player) => {
        const status = player?.subscriptions?.months?.[monthKey];
        if (status === "paid") {
          paid += 1;
        } else {
          pending += 1;
        }
      });

      paidEl.textContent = paid;
      pendingEl.textContent = pending;
    })
    .catch((err) => {
      console.error(err);
    });
})();
