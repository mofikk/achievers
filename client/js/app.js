(function () {
  const links = document.querySelectorAll(".nav-link");
  const path = window.location.pathname.split("/").pop() || "index.html";

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (href === path) {
      link.classList.add("active");
    }
  });

  const menuBtn = document.getElementById("menu-btn");
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("nav-overlay");

  function setNavOpen(isOpen) {
    if (!menuBtn || !sidebar || !overlay) return;
    sidebar.classList.toggle("open", isOpen);
    overlay.classList.toggle("hidden", !isOpen);
    menuBtn.setAttribute("aria-expanded", String(isOpen));
    sidebar.setAttribute("aria-hidden", String(!isOpen));
    document.body.classList.toggle("nav-open", isOpen);
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

    links.forEach((link) => {
      link.addEventListener("click", () => {
        if (window.innerWidth < 900) setNavOpen(false);
      });
    });
  }

  window.apiFetch = async function apiFetch(path, options = {}) {
    const res = await fetch(`/api${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });

    if (!res.ok) {
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        throw new Error(data.error || "API request failed");
      }
      const message = await res.text();
      throw new Error(message || "API request failed");
    }

    return res.json();
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
})();
