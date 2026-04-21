async function loadSidebar() {
  const slot = document.getElementById("sidebar-slot");
  if (!slot) return;

  const res = await fetch("partials/sidebar.html", { cache: "no-store" });
  if (!res.ok) {
    console.error("Failed to load sidebar partial:", res.status);
    return;
  }

  slot.innerHTML = await res.text();
  document.dispatchEvent(new Event("sidebar:loaded"));
}

document.addEventListener("DOMContentLoaded", loadSidebar);
