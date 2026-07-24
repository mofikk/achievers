(function () {
  const myAccountForm = document.getElementById("my-account-form");
  const myFullNameInput = document.getElementById("my-full-name");
  const myEmailInput = document.getElementById("my-email");
  const mySaveBtn = document.getElementById("my-save-btn");
  const changePasswordBtn = document.getElementById("change-password-btn");
  const logoutBtn = document.getElementById("logout-btn-page");
  const myAccountError = document.getElementById("my-account-error");

  const userManagementSection = document.getElementById("user-management-section");
  const createUserForm = document.getElementById("create-user-form");
  const createUserFullNameInput = document.getElementById("create-user-full-name");
  const createUserEmailInput = document.getElementById("create-user-email");
  const createUserPasswordInput = document.getElementById("create-user-password");
  const createUserRoleInput = document.getElementById("create-user-role");
  const createUserSubmitBtn = document.getElementById("create-user-submit");
  const createUserError = document.getElementById("create-user-error");
  const usersBody = document.getElementById("users-body");
  const usersEmpty = document.getElementById("users-empty");
  const rolePermissionsSection = document.getElementById("role-permissions-section");
  const rolePermissionsBody = document.getElementById("role-permissions-body");
  const rolePermissionsEmpty = document.getElementById("role-permissions-empty");
  const passwordModal = document.getElementById("password-modal");
  const passwordInput = document.getElementById("password-input");
  const passwordError = document.getElementById("password-error");
  const passwordCancelBtn = document.getElementById("password-cancel");
  const passwordSaveBtn = document.getElementById("password-save");

  if (
    !myAccountForm ||
    !myFullNameInput ||
    !myEmailInput ||
    !mySaveBtn ||
    !changePasswordBtn ||
    !logoutBtn ||
    !myAccountError ||
    !userManagementSection ||
    !createUserForm ||
    !createUserFullNameInput ||
    !createUserEmailInput ||
    !createUserPasswordInput ||
    !createUserRoleInput ||
    !createUserSubmitBtn ||
    !createUserError ||
    !usersBody ||
    !usersEmpty ||
    !rolePermissionsSection ||
    !rolePermissionsBody ||
    !rolePermissionsEmpty ||
    !passwordModal ||
    !passwordInput ||
    !passwordError ||
    !passwordCancelBtn ||
    !passwordSaveBtn
  ) {
    return;
  }

  const state = {
    currentUser: null,
    users: [],
    rolePermissions: [],
    permissionKeys: []
  };

  function isSuperUser(user) {
    return user?.role === "super_user";
  }

  function canCreateUsers(user) {
    return user?.role === "super_user" || user?.role === "super_admin";
  }

  function canViewUserManagement(user) {
    return Boolean(user?.permissions?.manage_users) || canCreateUsers(user);
  }

  function guardAction(user, targetUserId) {
    const isSelf = Boolean(user?.id && targetUserId && user.id === targetUserId);
    if (!isSelf && user?.role !== "super_user") {
      window.toast("You don't have permission", "error");
      return false;
    }
    return true;
  }

  function disableControl(control) {
    control.classList.add("disabled");
    control.disabled = true;
  }

  function showError(message) {
    myAccountError.textContent = message || "";
  }

  function showCreateUserError(message) {
    createUserError.textContent = message || "";
  }

  function setButtonLoading(button, isLoading, loadingText, idleText) {
    if (!(button instanceof HTMLButtonElement)) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : idleText;
  }

  function openPasswordModal() {
    passwordError.textContent = "";
    passwordInput.value = "";
    passwordModal.classList.remove("hidden");
    passwordModal.setAttribute("aria-hidden", "false");
    passwordInput.focus();
  }

  function closePasswordModal() {
    passwordModal.classList.add("hidden");
    passwordModal.setAttribute("aria-hidden", "true");
    passwordInput.value = "";
    passwordError.textContent = "";
  }

  function setLoadingState() {
    usersBody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';
    usersEmpty.textContent = "";
    rolePermissionsBody.innerHTML = '<tr><td colspan="3">Loading...</td></tr>';
    rolePermissionsEmpty.textContent = "";
  }

  function renderMyAccount() {
    const user = state.currentUser || {};
    myFullNameInput.value = user.full_name || "";
    myEmailInput.value = user.email || "";
    showError("");
  }

  function renderCreateUserForm() {
    const superUserOption = createUserRoleInput.querySelector('option[value="super_user"]');
    if (superUserOption) {
      superUserOption.hidden = !isSuperUser(state.currentUser);
      superUserOption.disabled = !isSuperUser(state.currentUser);
    }
    if (!isSuperUser(state.currentUser) && createUserRoleInput.value === "super_user") {
      createUserRoleInput.value = "viewer";
    }
    showCreateUserError("");
  }

  function renderUsersTable() {
    usersBody.innerHTML = "";
    const list = state.users || [];
    usersEmpty.textContent = list.length ? "" : "No users found";

    list.forEach((user) => {
      const row = document.createElement("tr");
      const roleValue = user.role || "viewer";
      const activeValue = user.is_active !== false;

      row.innerHTML = `
        <td data-label="Name">${user.full_name || "-"}</td>
        <td data-label="Email">${user.email || "-"}</td>
        <td data-label="Role">
          <select class="input" data-role-id="${user.id}">
            <option value="viewer" ${roleValue === "viewer" ? "selected" : ""}>viewer</option>
            <option value="admin" ${roleValue === "admin" ? "selected" : ""}>admin</option>
            <option value="super_admin" ${roleValue === "super_admin" ? "selected" : ""}>super_admin</option>
            <option value="super_user" ${roleValue === "super_user" ? "selected" : ""}>super_user</option>
          </select>
        </td>
        <td data-label="Status">
          <label class="form-field" style="margin: 0;">
            <span style="display:none;">Status</span>
            <input type="checkbox" data-active-id="${user.id}" ${activeValue ? "checked" : ""} />
          </label>
        </td>
        <td data-label="Actions">
          <button class="action-btn" data-save-id="${user.id}">Save</button>
        </td>
      `;

      usersBody.appendChild(row);

      const isSelf = Boolean(state.currentUser?.id && user.id && state.currentUser.id === user.id);
      if (!isSelf && !isSuperUser(state.currentUser)) {
        const roleSelect = row.querySelector(`[data-role-id="${user.id}"]`);
        const statusToggle = row.querySelector(`[data-active-id="${user.id}"]`);
        const saveBtn = row.querySelector(`[data-save-id="${user.id}"]`);
        if (roleSelect instanceof HTMLElement) disableControl(roleSelect);
        if (statusToggle instanceof HTMLElement) disableControl(statusToggle);
        if (saveBtn instanceof HTMLElement) disableControl(saveBtn);
      }
    });
  }

  function permissionLabel(key) {
    const labels = {
      view_activity: "View activity",
      view_reports: "View reports",
      manage_players_create: "Create players",
      manage_players_update: "Update players",
      manage_players_delete: "Delete players",
      manage_attendance: "Manage attendance",
      manage_visitors: "Manage visitors",
      manage_stats: "Manage stats",
      manage_fines: "Manage fines",
      manage_payments: "Manage payments",
      manage_notes: "Manage notes",
      manage_settings: "Manage settings",
      manage_users: "Manage users"
    };
    return labels[key] || key;
  }

  function renderRolePermissionsTable() {
    rolePermissionsBody.innerHTML = "";
    const list = Array.isArray(state.rolePermissions) ? state.rolePermissions : [];
    const editable = isSuperUser(state.currentUser);
    rolePermissionsSection.classList.toggle("hidden", !editable);
    rolePermissionsEmpty.textContent = list.length ? "" : "No role permissions found";
    if (!editable) return;

    list
      .filter((row) => row.role !== "super_user")
      .forEach((row) => {
        const tr = document.createElement("tr");
        const role = String(row.role || "viewer");
        const permissions = row.permissions || {};
        const chips = state.permissionKeys
          .map((key) => {
            const checked = permissions[key] ? "checked" : "";
            const disabled = key === "manage_users" || key === "manage_settings" || key === "view_reports" ? "disabled" : "";
            return `<label style="display:inline-flex;align-items:center;gap:6px;margin-right:12px;margin-bottom:6px;">
              <input type="checkbox" data-perm-role="${role}" data-perm-key="${key}" ${checked} ${disabled} />
              <span>${permissionLabel(key)}</span>
            </label>`;
          })
          .join("");

        tr.innerHTML = `
          <td data-label="Role">${role}</td>
          <td data-label="Permissions">${chips}</td>
          <td data-label="Actions">
            <button class="action-btn" data-save-role="${role}">Save</button>
          </td>
        `;
        rolePermissionsBody.appendChild(tr);
      });
  }

  function renderUserManagement(users, currentUser) {
    state.currentUser = currentUser || null;
    state.users = Array.isArray(users) ? users : [];
    renderMyAccount();
    const canManageUsers = canViewUserManagement(state.currentUser);
    userManagementSection.classList.toggle("hidden", !canManageUsers);
    createUserForm.classList.toggle("hidden", !canCreateUsers(state.currentUser));
    renderCreateUserForm();
    if (!canManageUsers) {
      usersBody.innerHTML = "";
      usersEmpty.textContent = "";
    }
    renderUsersTable();
    renderRolePermissionsTable();
  }

  async function fetchCurrentUser() {
    try {
      const res = await window.apiFetch("/me");
      return res.data;
    } catch (err) {
      console.error("fetchCurrentUser error:", err);
      return null;
    }
  }

  async function fetchUsers() {
    try {
      const res = await window.apiFetch("/users");
      const users = res?.data || [];
      return users;
    } catch (err) {
      console.error("fetchUsers error:", err);
      return [];
    }
  }

  async function fetchRolePermissions() {
    try {
      const res = await window.apiFetch("/permissions");
      const rows = res?.data?.permissions || [];
      const keys = res?.data?.keys || [];
      return { rows, keys };
    } catch (error) {
      console.error("fetchRolePermissions error:", error);
      return { rows: [], keys: [] };
    }
  }

  async function load() {
    setLoadingState();
    try {
      const currentUser = await fetchCurrentUser();
      const users = await fetchUsers();
      const permissions = await fetchRolePermissions();
      state.rolePermissions = Array.isArray(permissions.rows) ? permissions.rows : [];
      state.permissionKeys = Array.isArray(permissions.keys) ? permissions.keys : [];
      renderUserManagement(users, currentUser);
    } catch (error) {
      console.error(error);
      usersBody.innerHTML = "";
      usersEmpty.textContent = "Unable to load users.";
      showError(error?.message || "Unable to load account data.");
      if (window.toast) window.toast("Unable to load user data", "error");
    }
  }

  myAccountForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!guardAction(state.currentUser, state.currentUser?.id)) return;

    const fullName = String(myFullNameInput.value || "").trim();
    if (!fullName) {
      showError("Full name is required.");
      return;
    }

    setButtonLoading(mySaveBtn, true, "Saving...", "Save");
    showError("");

    try {
      const res = await window.apiFetch("/me", {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName })
      });

      if (res?.error) {
        showError(res.error);
        return;
      }

      state.currentUser = res?.data || state.currentUser;
      if (window.toast) window.toast("Profile updated", "success");
      renderMyAccount();
    } catch (error) {
      console.error(error);
      showError(error?.message || "Unable to update profile.");
      if (window.toast) window.toast("Unable to update profile", "error");
    } finally {
      setButtonLoading(mySaveBtn, false, "Saving...", "Save");
    }
  });

  createUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!canCreateUsers(state.currentUser)) {
      showCreateUserError("You don't have permission to create accounts.");
      return;
    }

    const fullName = String(createUserFullNameInput.value || "").trim();
    const email = String(createUserEmailInput.value || "").trim();
    const password = String(createUserPasswordInput.value || "").trim();
    const role = String(createUserRoleInput.value || "viewer");

    if (!fullName || !email || !password) {
      showCreateUserError("Full name, email, and password are required.");
      return;
    }

    if (password.length < 6) {
      showCreateUserError("Password must be at least 6 characters.");
      return;
    }

    setButtonLoading(createUserSubmitBtn, true, "Creating...", "Create account");
    showCreateUserError("");

    try {
      const res = await window.apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
          role
        })
      });

      if (res?.error) {
        showCreateUserError(res.error);
        return;
      }

      const created = res?.data;
      if (created?.id) {
        state.users = [...state.users, created];
      } else {
        state.users = await fetchUsers();
      }
      createUserForm.reset();
      createUserRoleInput.value = "viewer";
      renderUsersTable();
      if (window.toast) window.toast("Account created", "success");
    } catch (error) {
      console.error(error);
      showCreateUserError(error?.message || "Unable to create account.");
      if (window.toast) window.toast("Unable to create account", "error");
    } finally {
      setButtonLoading(createUserSubmitBtn, false, "Creating...", "Create account");
    }
  });

  changePasswordBtn.addEventListener("click", async () => {
    if (!guardAction(state.currentUser, state.currentUser?.id)) return;
    openPasswordModal();
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      const supabase = await window.getSupabaseClient();
      await supabase.auth.signOut();
    } catch (error) {
      console.error(error);
    } finally {
      window.location.href = "/login.html";
    }
  });

  usersBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute("data-save-id")) return;
    const userId = target.getAttribute("data-save-id");
    if (!userId) return;
    if (!guardAction(state.currentUser, userId)) return;

    const roleInput = usersBody.querySelector(`[data-role-id="${userId}"]`);
    const activeInput = usersBody.querySelector(`[data-active-id="${userId}"]`);
    if (!(roleInput instanceof HTMLSelectElement) || !(activeInput instanceof HTMLInputElement)) {
      return;
    }

    const payload = {
      role: roleInput.value,
      is_active: activeInput.checked
    };

    const originalText = target.textContent || "Save";
    setButtonLoading(target, true, "Saving...", originalText);
    try {
      const res = await window.apiFetch(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });

      if (res?.error) {
        if (window.toast) window.toast(res.error, "error");
        return;
      }

      const updated = res?.data;
      state.users = state.users.map((user) => (user.id === userId ? { ...user, ...updated } : user));
      if (window.toast) window.toast("User updated", "success");
      renderUsersTable();
    } catch (error) {
      console.error(error);
      if (window.toast) window.toast(error?.message || "Unable to update user", "error");
    } finally {
      setButtonLoading(target, false, "Saving...", originalText);
    }
  });

  rolePermissionsBody.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.hasAttribute("data-save-role")) return;
    const role = target.getAttribute("data-save-role");
    if (!role || !isSuperUser(state.currentUser)) return;

    const permissions = {};
    const checkboxes = rolePermissionsBody.querySelectorAll(`input[type="checkbox"][data-perm-role="${role}"]`);
    checkboxes.forEach((checkbox) => {
      if (!(checkbox instanceof HTMLInputElement)) return;
      const key = checkbox.getAttribute("data-perm-key");
      if (!key) return;
      permissions[key] = checkbox.checked;
    });

    const originalText = target.textContent || "Save";
    setButtonLoading(target, true, "Saving...", originalText);
    try {
      const res = await window.apiFetch("/permissions", {
        method: "PATCH",
        body: JSON.stringify({ role, permissions })
      });
      if (res?.error) {
        if (window.toast) window.toast(res.error, "error");
        return;
      }
      const reloaded = await fetchRolePermissions();
      state.rolePermissions = Array.isArray(reloaded.rows) ? reloaded.rows : [];
      state.permissionKeys = Array.isArray(reloaded.keys) ? reloaded.keys : [];
      renderRolePermissionsTable();
      if (window.toast) window.toast("Role permissions updated", "success");
    } catch (error) {
      console.error(error);
      if (window.toast) window.toast("Unable to update role permissions", "error");
    } finally {
      setButtonLoading(target, false, "Saving...", originalText);
    }
  });

  passwordCancelBtn.addEventListener("click", closePasswordModal);
  passwordModal.addEventListener("click", (event) => {
    if (event.target === passwordModal) closePasswordModal();
  });

  passwordSaveBtn.addEventListener("click", async () => {
    if (!guardAction(state.currentUser, state.currentUser?.id)) return;
    const newPassword = String(passwordInput.value || "").trim();
    if (!newPassword) {
      passwordError.textContent = "Password is required.";
      return;
    }

    setButtonLoading(passwordSaveBtn, true, "Saving...", "Save");
    passwordError.textContent = "";
    try {
      const supabase = await window.getSupabaseClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });
      if (error) throw error;
      if (window.toast) window.toast("Password updated", "success");
      closePasswordModal();
    } catch (error) {
      console.error(error);
      passwordError.textContent = error?.message || "Unable to change password.";
      if (window.toast) window.toast(error?.message || "Unable to change password", "error");
    } finally {
      setButtonLoading(passwordSaveBtn, false, "Saving...", "Save");
    }
  });

  document.addEventListener("DOMContentLoaded", load);
})();
