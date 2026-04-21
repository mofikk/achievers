(function () {
  if (typeof window.apiFetch === "function") return;

  window.apiFetch = async function(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    let url = `/api${path}`;

    if (method === "GET") {
      const sep = url.includes("?") ? "&" : "?";
      url += `${sep}t=${Date.now()}`;
    }

    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      ...options
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = { data: null, error: "Invalid server response" };
    }

    if (!res.ok) {
      throw new Error(data?.error || "API request failed");
    }

    return data;
  };
})();
