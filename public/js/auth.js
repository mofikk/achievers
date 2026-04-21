(function () {
  function toFriendlyAuthError(error, mode) {
    const fallbackByMode = {
      login: "We couldn't log you in. Check your details, and if you just signed up, verify your email first.",
      signup: "We couldn't create your account right now. Please try again.",
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

    if (rawMessage.includes("user already registered")) {
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

  async function login(email, password) {
    const client = await getClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error) throw error;
    return data?.user || null;
  }

  async function signup(email, password) {
    const client = await getClient();
    const { data, error } = await client.auth.signUp({ email, password });

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
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login.html`
    });

    if (error) throw error;
  }

  window.auth = {
    login,
    signup,
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

  function initSignupPage() {
    const form = document.getElementById('signup-form');
    if (!form) return;

    const errorEl = document.getElementById('signup-error');
    const submitBtn = document.getElementById('signup-submit');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const email = String(formData.get('email') || '').trim();
      const password = String(formData.get('password') || '').trim();
      const confirmPassword = String(formData.get('confirmPassword') || '').trim();

      if (!email || !password || !confirmPassword) {
        setError(errorEl, 'All fields are required.');
        return;
      }

      if (password !== confirmPassword) {
        setError(errorEl, 'Passwords do not match.');
        return;
      }

      setError(errorEl, '');
      setButtonLoading(submitBtn, true, 'Create account', 'Creating...');

      try {
        await signup(email, password);
        window.location.href = '/login.html';
      } catch (error) {
        console.error(error);
        setError(errorEl, toFriendlyAuthError(error, "signup"));
      } finally {
        setButtonLoading(submitBtn, false, 'Create account', 'Creating...');
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
    initLoginPage();
    initSignupPage();
    initForgotPasswordPage();
  });
})();
