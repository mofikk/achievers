(function () {
  const links = document.querySelectorAll(".nav-link");
  const path = window.location.pathname.split("/").pop() || "index.html";

  links.forEach((link) => {
    const href = link.getAttribute("href");
    if (href === path) {
      link.classList.add("active");
    }
  });

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
