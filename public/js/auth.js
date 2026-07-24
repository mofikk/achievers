(function () {
  const THEME_STORAGE_KEY = "achievers-theme-preference";
  const THEME_OPTIONS = ["system", "dark", "light"];

  function getSystemTheme() {
    if (!window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function getThemePreference() {
    const saved = String(window.localStorage.getItem(THEME_STORAGE_KEY) || "system");
    return saved === "dark" || saved === "light" ? saved : "system";
  }

  function applyTheme(preference) {
    const resolved = preference === "system" ? getSystemTheme() : preference;
    document.body.classList.toggle("theme-dark", resolved === "dark");
    document.body.classList.toggle("theme-light", resolved === "light");
    document.body.dataset.theme = resolved;
    document.body.dataset.themePreference = preference;
  }

  function cycleThemePreference(currentPreference) {
    const index = THEME_OPTIONS.indexOf(currentPreference);
    const nextIndex = index === -1 ? 0 : (index + 1) % THEME_OPTIONS.length;
    return THEME_OPTIONS[nextIndex];
  }

  function saveThemePreference(preference) {
    if (preference === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  }

  function updateThemeToggle(button) {
    if (!button) return;
    const preference = document.body.dataset.themePreference || "system";
    const applied = document.body.dataset.theme || "light";
    const icon =
      preference === "system" ? "fa-circle-half-stroke" : applied === "dark" ? "fa-moon" : "fa-sun";
    const label = preference === "system" ? "Auto" : applied === "dark" ? "Dark" : "Light";
    button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
    button.setAttribute("aria-label", `Theme: ${label}. Click to switch theme mode.`);
    button.title = `Theme: ${label}`;
  }

  function injectAuthThemeToggle() {
    if (!document.body || document.getElementById("auth-theme-toggle")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.id = "auth-theme-toggle";
    button.className = "ghost-btn auth-theme-toggle";
    updateThemeToggle(button);
    button.addEventListener("click", () => {
      const currentPreference = document.body.dataset.themePreference || "system";
      const nextPreference = cycleThemePreference(currentPreference);
      saveThemePreference(nextPreference);
      applyTheme(nextPreference);
      updateThemeToggle(button);
    });
    document.body.appendChild(button);
  }

  function isAuthPage() {
    const path = window.location.pathname || "";
    return ["/login.html", "/forgot-password.html"].includes(path);
  }

  applyTheme(getThemePreference());

  if (window.matchMedia) {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      if ((document.body.dataset.themePreference || "system") !== "system") return;
      applyTheme("system");
    };
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncTheme);
    } else if (typeof mediaQuery.addListener === "function") {
      mediaQuery.addListener(syncTheme);
    }
  }

  function toFriendlyAuthError(error, mode) {
    const fallbackByMode = {
      login: "We couldn't log you in. Check your details, and if you just signed up, verify your email first.",
      reset: "We couldn't send the reset link. Please try again."
    };
    const fallback = fallbackByMode[mode] || "Something went wrong. Please try again.";
    const rawMessage = String(error?.message || "").toLowerCase();
    const code = String(error?.code || "").toLowerCase();
    const status = Number(error?.status || 0);

    if (!rawMessage && !code && !status) return fallback;

    if (
      rawMessage.includes("email not confirmed") ||
      rawMessage.includes("not confirmed") ||
      rawMessage.includes("confirm your email") ||
      code === "email_not_confirmed" ||
      code === "user_not_confirmed"
    ) {
      return "Your account is not verified yet. Please check your email and confirm your account.";
    }

    if (rawMessage.includes("invalid login credentials") || code === "invalid_credentials") {
      return "Login failed. Check your email and password. If you just signed up, verify your email first.";
    }

    if (
      code === "user_already_registered" ||
      rawMessage.includes("user already registered") ||
      rawMessage.includes("already registered") ||
      rawMessage.includes("already exists")
    ) {
      return "This email is already registered. Try logging in instead.";
    }

    if (rawMessage.includes("password should be at least")) {
      return "Password is too short. Use at least 6 characters.";
    }

    if (rawMessage.includes("invalid email")) {
      return "Please enter a valid email address.";
    }

    if (rawMessage.includes("too many requests") || status === 429) {
      return "Too many attempts right now. Please wait a moment and try again.";
    }

    if (
      rawMessage.includes("network") ||
      rawMessage.includes("failed to fetch") ||
      code === "auth_retryable_fetch_error"
    ) {
      return "Network issue detected. Check your connection and try again.";
    }

    if (
      rawMessage.includes("supabase config") ||
      rawMessage.includes("auth config") ||
      rawMessage.includes("supabase client is not initialized")
    ) {
      return "Login service is temporarily unavailable. Please refresh and try again.";
    }

    return fallback;
  }

  async function getClient() {
    if (typeof window.getSupabaseClient !== 'function') {
      throw new Error('Supabase client is not initialized.');
    }

    return window.getSupabaseClient();
  }

  function isTransientNetworkAuthError(error) {
    const message = String(error?.message || "").toLowerCase();
    const code = String(error?.code || "").toLowerCase();
    return (
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("network request failed") ||
      code === "auth_retryable_fetch_error"
    );
  }

  async function withAuthRetry(fn, attempts = 3, delayMs = 300) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (!isTransientNetworkAuthError(error) || attempt === attempts) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
    throw lastError || new Error("Authentication request failed.");
  }

  async function login(email, password) {
    const client = await getClient();
    const { data, error } = await withAuthRetry(() =>
      client.auth.signInWithPassword({ email, password })
    );

    if (error) throw error;
    return data?.user || null;
  }

  async function logout() {
    const client = await getClient();
    const { error } = await client.auth.signOut();

    if (error) throw error;
  }

  async function getCurrentUser() {
    try {
      const client = await getClient();
      const { data, error } = await client.auth.getSession();

      if (error) {
        console.error(error);
        return null;
      }

      return data?.session?.user || null;
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async function requestPasswordReset(email) {
    const client = await getClient();
    const { error } = await withAuthRetry(() =>
      client.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login.html`
      })
    );

    if (error) throw error;
  }

  window.auth = {
    login,
    logout,
    getCurrentUser,
    requestPasswordReset
  };

  if (!window.toast) {
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
  }

  function setError(errorEl, message, type = "error") {
    if (!errorEl) return;
    errorEl.textContent = message || '';
    if (message && window.toast) {
      window.toast(message, type);
    }
  }

  function setButtonLoading(button, isLoading, idleLabel, loadingLabel) {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingLabel : idleLabel;
  }

  function initLoginPage() {
    const form = document.getElementById('login-form');
    if (!form) return;

    const errorEl = document.getElementById('login-error');
    const submitBtn = document.getElementById('login-submit');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '').trim();

      if (!email || !password) {
        setError(errorEl, 'Email and password are required.');
        return;
      }

      setError(errorEl, '');
      setButtonLoading(submitBtn, true, 'Log in', 'Logging in...');

      try {
        await login(email, password);
        window.location.href = '/';
      } catch (error) {
        console.error(error);
        setError(errorEl, toFriendlyAuthError(error, "login"));
      } finally {
        setButtonLoading(submitBtn, false, 'Log in', 'Logging in...');
      }
    });
  }

  function initForgotPasswordPage() {
    const form = document.getElementById('forgot-form');
    if (!form) return;

    const errorEl = document.getElementById('forgot-error');
    const submitBtn = document.getElementById('forgot-submit');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const email = String(formData.get('email') || '').trim();

      if (!email) {
        setError(errorEl, 'Email is required.');
        return;
      }

      setError(errorEl, '');
      setButtonLoading(submitBtn, true, 'Send reset link', 'Sending...');

      try {
        await requestPasswordReset(email);
        setError(errorEl, 'Reset link sent. Check your email.', "success");
      } catch (error) {
        console.error(error);
        setError(errorEl, toFriendlyAuthError(error, "reset"));
      } finally {
        setButtonLoading(submitBtn, false, 'Send reset link', 'Sending...');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (isAuthPage()) {
      injectAuthThemeToggle();
    } else {
      const existing = document.getElementById("auth-theme-toggle");
      if (existing) existing.remove();
    }
    initLoginPage();
    initForgotPasswordPage();
  });
})();
