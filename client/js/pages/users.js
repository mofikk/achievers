(function () {
  const myAccountForm = document.getElementById("my-account-form");
  const myFullNameInput = document.getElementById("my-full-name");
  const myEmailInput = document.getElementById("my-email");
  const mySaveBtn = document.getElementById("my-save-btn");
  const changePasswordBtn = document.getElementById("change-password-btn");
  const logoutBtn = document.getElementById("logout-btn-page");
  const myAccountError = document.getElementById("my-account-error");

  const userManagementSection = document.getElementById("user-management-section");
  const usersBody = document.getElementById("users-body");
  const usersEmpty = document.getElementById("users-empty");
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
    !usersBody ||
    !usersEmpty ||
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
    users: []
  };

  function isSuperUser(user) {
    return user?.role === "super_user";
  }

  function isAdmin(user) {
    return user?.role === "admin";
  }

  function isViewer(user) {
    return user?.role === "viewer";
  }

  function guardAction(user, targetUserId) {
    const isSelf = Boolean(user?.id && targetUserId && user.id === targetUserId);
    console.log("isSelf:", isSelf);
    console.log("role:", user?.role);
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
  }

  function renderMyAccount() {
    const user = state.currentUser || {};
    myFullNameInput.value = user.full_name || "";
    myEmailInput.value = user.email || "";
    showError("");
  }

  function renderUsersTable() {
    usersBody.innerHTML = "";
    const list = state.users || [];
    usersEmpty.textContent = list.length ? "" : "No users found";
    console.log("renderUserManagement list:", list);

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
      console.log("isSelf:", isSelf);
      console.log("role:", state.currentUser?.role);
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

  function renderUserManagement(users, currentUser) {
    state.currentUser = currentUser || null;
    state.users = Array.isArray(users) ? users : [];
    renderMyAccount();
    userManagementSection.classList.remove("hidden");
    renderUsersTable();
  }

  async function fetchCurrentUser() {
    try {
      const res = await window.apiFetch("/me");
      console.log("Current User:", res.data);
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
      console.log("Users:", users);
      return users;
    } catch (err) {
      console.error("fetchUsers error:", err);
      return [];
    }
  }

  async function load() {
    console.log("LOAD START");
    setLoadingState();
    try {
      const currentUser = await fetchCurrentUser();
      const users = await fetchUsers();
      renderUserManagement(users, currentUser);
    } catch (error) {
      console.error(error);
      usersBody.innerHTML = "";
      usersEmpty.textContent = "Unable to load users.";
      showError(error?.message || "Unable to load account data.");
      if (window.toast) window.toast("Unable to load user data", "error");
    } finally {
      console.log("LOAD END");
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

    mySaveBtn.disabled = true;
    showError("");

    try {
      console.log("Updating profile full_name:", fullName);
      const res = await window.apiFetch("/me", {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName })
      });
      console.log("PATCH /api/me response:", res);

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
      mySaveBtn.disabled = false;
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
    console.log("PATCH /api/users/:id payload:", userId, payload);

    target.setAttribute("disabled", "true");
    try {
      const res = await window.apiFetch(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      console.log("PATCH /api/users/:id response:", res);

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
      target.removeAttribute("disabled");
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

    passwordSaveBtn.disabled = true;
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
      passwordSaveBtn.disabled = false;
    }
  });

  document.addEventListener("DOMContentLoaded", load);
})();
