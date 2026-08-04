// ═══════════════════════════════════════════════════════════════════
//  Storefront — auth (Supabase email/password), profile modal, user chip
//  Owns state.sbUser / state.sbProfile / state.sbOrders.
// ═══════════════════════════════════════════════════════════════════
import { state, GUEST_NAME, MAX_AVATAR_BYTES, AVATAR_SIZE_PX, AVATAR_JPEG_QUALITY, EMAIL_REGEX } from "./state.js";
import { getById, formatPrice, escHtml, safeImageUrl, showToast } from "./utils.js";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmail(email) {
  const normalized = normalizeEmail(email);
  if (!EMAIL_REGEX.test(normalized)) return false;
  if (normalized.includes("..")) return false;
  const parts = normalized.split("@");
  if (parts.length !== 2) return false;
  const domain = parts[1];
  return !domain.startsWith(".") && !domain.endsWith(".");
}

// Session helpers — read from the cached Supabase user.
export function getCurrentUsername() {
  return state.sbUser ? state.sbUser.email : null;
}

// Returns a shape compatible with the old "account" object expected by the UI.
export function getCurrentAccount() {
  if (!state.sbUser) return null;
  return {
    username:        state.sbUser.email,
    email:           state.sbUser.email,
    profileImageUrl: state.sbProfile ? state.sbProfile.avatar_url       : null,
    favoriteItemId:  state.sbProfile ? state.sbProfile.favorite_item_id : null,
  };
}

export function getDisplayName() {
  if (state.sbUser) return state.sbUser.email;
  return GUEST_NAME;
}

export function isGuestDismissed() {
  return !!localStorage.getItem("nnbc_guest_dismissed");
}

// Compute weekly nutrition from cached orders (loaded when user logs in).
export function getWeeklyNutrition() {
  const weekAgo    = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekOrders = state.sbOrders.filter(o => o.ts >= weekAgo);
  const tot = { calories: 0, protein: 0, totalFat: 0, totalCarbs: 0 };
  weekOrders.forEach(order => {
    order.items.forEach(item => {
      const p = state.products.find(p => p.id === item.id);
      if (p && p.nutrition) {
        tot.calories   += (p.nutrition.calories   || 0) * item.qty;
        tot.protein    += (p.nutrition.protein    || 0) * item.qty;
        tot.totalFat   += (p.nutrition.totalFat   || 0) * item.qty;
        tot.totalCarbs += (p.nutrition.totalCarbs || 0) * item.qty;
      }
    });
  });
  return tot;
}

export function getMostPurchasedItem() {
  const counts = {};
  state.sbOrders.forEach(order =>
    order.items.forEach(item => {
      counts[item.id] = (counts[item.id] || 0) + item.qty;
    })
  );
  let topId = null, topCount = 0;
  Object.entries(counts).forEach(([id, c]) => {
    if (c > topCount) { topCount = c; topId = +id; }
  });
  if (!topId) return null;
  const p = state.products.find(p => p.id === topId);
  return p ? { product: p, count: topCount } : null;
}

// ─────────────────────────────────────────────────────
//  USER CHIP
// ─────────────────────────────────────────────────────
export function updateUserChip() {
  getById("user-chip-name").textContent = getDisplayName();
  const avatarEl  = getById("user-chip-avatar");
  avatarEl.innerHTML = "";
  const avatarUrl = state.sbProfile ? state.sbProfile.avatar_url : null;
  if (state.sbUser && avatarUrl && safeImageUrl(avatarUrl)) {
    const img = document.createElement("img");
    img.src = avatarUrl;
    img.alt = state.sbUser.email;
    avatarEl.appendChild(img);
  } else if (state.sbUser) {
    avatarEl.textContent = state.sbUser.email.charAt(0).toUpperCase();
  } else {
    avatarEl.textContent = "👤";
  }
}

// ─────────────────────────────────────────────────────
//  AUTH MODAL (Login / Register)
// ─────────────────────────────────────────────────────
export function openAuthModal(defaultTab) {
  getById("auth-modal").classList.add("open");
  document.body.style.overflow = "hidden";
  getById("login-error").textContent = "";
  getById("reg-error").textContent   = "";
  switchAuthTab(defaultTab || "login");
}

export function closeAuthModal() {
  getById("auth-modal").classList.remove("open");
  document.body.style.overflow = "";
}

export function switchAuthTab(tab) {
  getById("auth-modal").querySelectorAll(".auth-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  getById("auth-login-form").classList.toggle("active", tab === "login");
  getById("auth-register-form").classList.toggle("active", tab === "register");
  setTimeout(() => {
    const focusEl = tab === "login" ? "login-username" : "reg-username";
    getById(focusEl).focus();
  }, 50);
}

getById("close-auth-modal").addEventListener("click", closeAuthModal);
getById("auth-modal").addEventListener("click", e => {
  if (e.target === getById("auth-modal")) closeAuthModal();
});

// Tab switching
getById("auth-modal").querySelectorAll(".auth-tab-btn").forEach(btn => {
  btn.addEventListener("click", () => switchAuthTab(btn.dataset.tab));
});

// Login submit — uses Supabase Auth
getById("login-submit-btn").addEventListener("click", async () => {
  const email    = getById("login-username").value.trim();
  const password = getById("login-password").value;
  getById("login-error").textContent = "";
  if (!email || !password) {
    getById("login-error").textContent = "Please enter your email and password.";
    return;
  }
  const btn = getById("login-submit-btn");
  btn.disabled = true;
  try {
    await DB.signIn(email, password);
    // onAuthChange callback will update state.sbUser and call updateUserChip()
    closeAuthModal();
    if (getById("checkout-modal").classList.contains("open")) {
      getById("checkout-buyer-name").textContent = email;
      getById("change-name-btn").textContent = "👤 Profile";
    }
    showToast("👋 Welcome back, " + escHtml(email) + "!");
  } catch (err) {
    getById("login-error").textContent = err.message || "Incorrect email or password.";
  } finally {
    btn.disabled = false;
  }
});
getById("login-username").addEventListener("keydown", e => { if (e.key === "Enter") getById("login-password").focus(); });
getById("login-password").addEventListener("keydown", e => { if (e.key === "Enter") getById("login-submit-btn").click(); });

// Register submit — uses Supabase Auth
getById("reg-submit-btn").addEventListener("click", async () => {
  const email   = getById("reg-username").value.trim();
  const password = getById("reg-password").value;
  const confirm  = getById("reg-password-confirm").value;
  getById("reg-error").textContent = "";
  if (!isValidEmail(email)) {
    getById("reg-error").textContent = "Please enter a valid email address.";
    return;
  }
  if (password.length < 8) {
    getById("reg-error").textContent = "Password must be at least 8 characters.";
    return;
  }
  if (password !== confirm) {
    getById("reg-error").textContent = "Passwords do not match.";
    return;
  }
  const btn = getById("reg-submit-btn");
  btn.disabled = true;
  try {
    await DB.signUp(email, password);
    closeAuthModal();
    showToast("🎉 Account created! Check your email to confirm, then sign in.");
  } catch (err) {
    getById("reg-error").textContent = err.message || "Could not create account.";
  } finally {
    btn.disabled = false;
  }
});
getById("reg-username").addEventListener("keydown", e => { if (e.key === "Enter") getById("reg-password").focus(); });
getById("reg-password").addEventListener("keydown", e => { if (e.key === "Enter") getById("reg-password-confirm").focus(); });
getById("reg-password-confirm").addEventListener("keydown", e => { if (e.key === "Enter") getById("reg-submit-btn").click(); });

// Guest buttons — mark as dismissed so modal doesn't auto-show again
const guestAction = () => {
  localStorage.setItem("nnbc_guest_dismissed", "1");
  closeAuthModal();
};
getById("auth-guest-btn").addEventListener("click", guestAction);
getById("auth-guest-btn-2").addEventListener("click", guestAction);

// User chip click — open profile if logged in, else open auth modal
getById("user-chip").addEventListener("click", () => {
  if (state.sbUser) {
    openProfileModal();
  } else {
    openAuthModal("login");
  }
});

// Checkout "change" button
getById("change-name-btn").addEventListener("click", () => {
  // Lazy import avoids a circular top-level dependency on checkout.js
  // (checkout.js also needs things from this module); closing the cart
  // modal here is just a class toggle so it's safe to do directly.
  getById("checkout-modal").classList.remove("open");
  if (state.sbUser) {
    openProfileModal();
  } else {
    openAuthModal("login");
  }
});

// ─────────────────────────────────────────────────────
//  PROFILE MODAL
// ─────────────────────────────────────────────────────
export async function openProfileModal() {
  if (!state.sbUser) { openAuthModal("login"); return; }

  // Show modal immediately, then fill data async
  getById("profile-modal").classList.add("open");
  document.body.style.overflow = "hidden";

  const email = state.sbUser.email;

  // Basic fields
  getById("profile-username-display").textContent = email;
  getById("profile-email-display").textContent    = email;
  getById("profile-email-input").value             = email;
  getById("profile-email-hint").textContent        = "Your email is your login username.";

  // Avatar — show initial from cached profile while loading
  const avatarEl = getById("profile-avatar-display");
  avatarEl.innerHTML = "";
  const cachedAvatarUrl = state.sbProfile ? state.sbProfile.avatar_url : null;
  if (cachedAvatarUrl && safeImageUrl(cachedAvatarUrl)) {
    const img = document.createElement("img");
    img.src = cachedAvatarUrl;
    img.alt = email;
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = email.charAt(0).toUpperCase();
  }
  getById("btn-remove-avatar").classList.toggle("visible", !!cachedAvatarUrl);

  // Favorite item select
  const favSelect = getById("profile-fav-select");
  favSelect.innerHTML = '<option value="">— Select a favorite —</option>';
  const savedFavId = state.sbProfile ? state.sbProfile.favorite_item_id : null;
  state.products.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = (p.emoji || "🛍️") + " " + p.name;
    if (p.id === savedFavId) opt.selected = true;
    favSelect.appendChild(opt);
  });

  // Load orders fresh from Supabase for this session
  try {
    state.sbOrders = await DB.loadOrders(state.sbUser.id);
  } catch(e) {
    console.warn("Could not load user orders:", e);
  }

  // Most purchased
  const mp   = getMostPurchasedItem();
  const mpEl = getById("profile-most-purchased-content");
  if (mp) {
    const p      = mp.product;
    const imgUrl = safeImageUrl(p.imageUrl);
    const visual = imgUrl
      ? `<img src="${p.imageUrl}" class="profile-most-purchased-img" alt="${escHtml(p.name)}" />`
      : escHtml(p.emoji || "🛍️");
    mpEl.innerHTML = `
      <div class="profile-most-purchased">
        <div class="profile-most-purchased-visual">${visual}</div>
        <div>
          <div class="profile-most-purchased-name">${escHtml(p.name)}</div>
          <div class="profile-most-purchased-count">Purchased ${mp.count}× total</div>
        </div>
      </div>`;
  } else {
    mpEl.innerHTML = '<div class="profile-empty-state">No purchases yet.</div>';
  }

  // Weekly nutrition
  const nut = getWeeklyNutrition();
  getById("pn-calories").textContent = nut.calories   > 0 ? Math.round(nut.calories)   + " kcal" : "—";
  getById("pn-protein").textContent  = nut.protein    > 0 ? Math.round(nut.protein)    + "g"    : "—";
  getById("pn-carbs").textContent    = nut.totalCarbs > 0 ? Math.round(nut.totalCarbs) + "g"    : "—";
  getById("pn-fat").textContent      = nut.totalFat   > 0 ? Math.round(nut.totalFat)   + "g"    : "—";

  // Order history — sort newest first, cap at 10
  const orders   = [...state.sbOrders].sort((a, b) => b.ts - a.ts);
  const ordersEl = getById("profile-orders-list");
  if (orders.length === 0) {
    ordersEl.innerHTML = '<div class="profile-empty-state">No orders yet.</div>';
  } else {
    ordersEl.innerHTML = "";
    orders.slice(0, 10).forEach(order => {
      const date     = new Date(order.ts).toLocaleDateString();
      const itemsStr = order.items.map(i => `${i.qty}× ${i.name}`).join(", ");
      const row      = document.createElement("div");
      row.className  = "profile-order-row";
      row.innerHTML  = `
        <div class="profile-order-id">${escHtml(order.id)}</div>
        <div class="profile-order-info">
          <div class="profile-order-date">${escHtml(date)}</div>
          <div class="profile-order-items">${escHtml(itemsStr)}</div>
        </div>
        <div class="profile-order-total">${formatPrice(order.total)}</div>`;
      ordersEl.appendChild(row);
    });
  }
}

export function closeProfileModal() {
  getById("profile-modal").classList.remove("open");
  document.body.style.overflow = "";
}

getById("close-profile-modal").addEventListener("click", closeProfileModal);
getById("profile-modal").addEventListener("click", e => {
  if (e.target === getById("profile-modal")) closeProfileModal();
});

// Email field is now read-only (email is the Supabase auth login).
getById("profile-email-save-btn").addEventListener("click", () => {
  showToast("ℹ️ To change your email, please contact an admin.");
});
getById("profile-email-input").setAttribute("readonly", "readonly");

// Favorite item change
getById("profile-fav-select").addEventListener("change", async () => {
  if (!state.sbUser) return;
  const val = getById("profile-fav-select").value;
  try {
    state.sbProfile = await DB.upsertProfile(state.sbUser.id, { favorite_item_id: val ? +val : null });
    showToast("⭐ Favorite saved!");
  } catch(e) {
    showToast("⚠️ Could not save favorite: " + e.message);
  }
});

// Profile image upload — resize to AVATAR_SIZE_PX, compress as JPEG, upload to Supabase Storage
getById("profile-img-upload").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > MAX_AVATAR_BYTES) {
    showToast("⚠️ Image must be under 10 MB");
    e.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = async ev => {
    const dataUrl = ev.target.result;
    if (!safeImageUrl(dataUrl) || !state.sbUser) return;
    const img = new Image();
    img.onload = async () => {
      const canvas = document.createElement("canvas");
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > h) { if (w > AVATAR_SIZE_PX) { h = Math.round(h * AVATAR_SIZE_PX / w); w = AVATAR_SIZE_PX; } }
      else        { if (h > AVATAR_SIZE_PX) { w = Math.round(w * AVATAR_SIZE_PX / h); h = AVATAR_SIZE_PX; } }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const compressed = canvas.toDataURL("image/jpeg", AVATAR_JPEG_QUALITY);
      try {
        const { avatarUrl } = await DB.uploadAvatar(state.sbUser.id, compressed);
        state.sbProfile = await DB.upsertProfile(state.sbUser.id, { avatar_url: avatarUrl });
        updateUserChip();
        const avatarEl = getById("profile-avatar-display");
        avatarEl.innerHTML = "";
        const imgEl = document.createElement("img");
        imgEl.src = avatarUrl;
        imgEl.alt = state.sbUser.email;
        avatarEl.appendChild(imgEl);
        getById("btn-remove-avatar").classList.add("visible");
        showToast("📷 Profile photo updated!");
      } catch(err) {
        showToast("⚠️ Could not upload photo: " + err.message);
      }
    };
    img.src = dataUrl;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

// Remove avatar
getById("btn-remove-avatar").addEventListener("click", async () => {
  if (!state.sbUser) return;
  try {
    state.sbProfile = await DB.upsertProfile(state.sbUser.id, { avatar_url: null });
    updateUserChip();
    const avatarEl = getById("profile-avatar-display");
    avatarEl.innerHTML = "";
    avatarEl.textContent = state.sbUser.email.charAt(0).toUpperCase();
    getById("btn-remove-avatar").classList.remove("visible");
    showToast("Profile photo removed.");
  } catch(e) {
    showToast("⚠️ Could not remove photo: " + e.message);
  }
});

// Logout
getById("profile-logout-btn").addEventListener("click", async () => {
  await DB.signOut();
  // state.sbUser will be cleared by onAuthChange callback
  closeProfileModal();
  showToast("👋 Logged out.");
});

// ─────────────────────────────────────────────────────
//  SUPABASE AUTH STATE — keep state.sbUser in sync across tabs/refreshes
// ─────────────────────────────────────────────────────
export function initAuthSync() {
  DB.onAuthChange(async (user) => {
    state.sbUser = user;
    if (user) {
      state.sbProfile = await DB.loadProfile(user.id).catch(() => null);
      state.sbOrders  = await DB.loadOrders(user.id).catch(() => []);
    } else {
      state.sbProfile = null;
      state.sbOrders  = [];
    }
    updateUserChip();
  });
}
