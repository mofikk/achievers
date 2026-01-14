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
      const message = await res.text();
      throw new Error(message || "API request failed");
    }

    return res.json();
  };
})();
