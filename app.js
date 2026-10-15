let gear = [];
const formatUGX = (value) => `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const CART_KEY = "camera-matrix-cart";
function readCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY) || "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([, quantity]) => Number.isSafeInteger(quantity) && quantity > 0));
  } catch { return {}; }
}
function writeCart() {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Booking remains usable when browser storage is unavailable. */ }
}
function localDateString(value) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
let activeCategory = "all";
let cart = readCart();
let availabilityById = {};
let inventoryReady = false;
let availabilityPeriod = "";
const grid = document.querySelector("#product-grid");
const searchInput = document.querySelector("#search");
function initHeroSlider() {
  const hero = document.querySelector(".hero");
  if (!hero) return;
  const textSlides = [...hero.querySelectorAll(".hero-copy-slide")];
  const imageSlides = [...hero.querySelectorAll(".hero-image-slide")];
  const dots = [...hero.querySelectorAll("[data-hero-go]")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let current = 0;
  let timer;
  const show = (index) => {
    current = (index + textSlides.length) % textSlides.length;
    [...textSlides, ...imageSlides].forEach((slide) => {
      const active = Number(slide.dataset.heroSlide) === current;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
      slide.inert = !active;
    });
    dots.forEach((dot, i) => {
      const active = i === current;
      dot.classList.toggle("is-active", active);
      if (active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
    document.querySelector("#hero-current").textContent = String(current + 1).padStart(2, "0");
  };
  const stop = () => clearInterval(timer);
  const start = () => {
    stop();
    if (!reducedMotion.matches && !document.hidden) timer = setInterval(() => show(current + 1), 6200);
  };
  hero.querySelector("[data-hero-prev]").addEventListener("click", () => { show(current - 1); start(); });
  hero.querySelector("[data-hero-next]").addEventListener("click", () => { show(current + 1); start(); });
  dots.forEach((dot) => dot.addEventListener("click", () => { show(Number(dot.dataset.heroGo)); start(); }));
  hero.addEventListener("mouseenter", stop);
  hero.addEventListener("mouseleave", start);
  hero.addEventListener("focusin", stop);
  hero.addEventListener("focusout", (event) => { if (!hero.contains(event.relatedTarget)) start(); });
  document.addEventListener("visibilitychange", start);
  reducedMotion.addEventListener("change", start);
  show(0);
  start();
}
function renderProducts() {
  const query = searchInput.value.trim().toLowerCase();
  const start = document.querySelector("#rental-dates").value;
  const end = document.querySelector("#return-date").value;
  const currentPeriod = start && end ? `${start}/${end}` : "";
  const visible = gear.filter((item) => (activeCategory === "all" || item.category === activeCategory) && `${item.name} ${item.type} ${item.desc} ${item.specs || ""} ${item.tag}`.toLowerCase().includes(query));
  grid.innerHTML = visible.map((item) => {
    const stock = currentPeriod && availabilityPeriod === currentPeriod ? availabilityById[item.id] : null;
    const label = stock ? "Available for request" : inventoryReady ? "Select dates to check" : "Loading availability";
    const disabled = false;
    const photo = item.image ? `<img class="product-photo" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || `${item.name} product photo`)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true" />` : "";
    return `<article class="product-card"><div class="product-visual" data-tone="${escapeHtml(item.tone)}"><span class="card-badge">${escapeHtml(item.tag)}</span>${photo}</div><div class="card-body"><div class="card-meta"><span>${escapeHtml(item.type)}</span><span class="available ${disabled ? "out-of-stock" : ""}">${escapeHtml(label)}</span></div><h3>${escapeHtml(item.name)}</h3><p class="product-desc">${escapeHtml(item.desc)}</p><p class="product-specs"><strong>Specs</strong> · ${escapeHtml(item.specs || "See product details")}</p><div class="card-bottom"><span class="price"><strong>${formatUGX(item.price)}</strong> <small>/ day</small></span><button class="add-button" data-add="${escapeHtml(item.id)}" ${disabled ? "disabled" : ""}>${disabled ? "Unavailable" : "+ Add to kit"}</button></div><a class="product-link" href="/gear/${encodeURIComponent(item.id)}">Learn more <span aria-hidden="true">→</span></a></div></article>`;
  }).join("");
  document.querySelector("#empty-state").hidden = visible.length > 0;
}
function renderCart() {
  const entries = Object.entries(cart).filter(([, qty]) => qty > 0);
  const start = document.querySelector("#rental-dates").value;
  const end = document.querySelector("#return-date").value;
  const days = start && end && end > start ? Math.round((Date.parse(`${end}T00:00:00`) - Date.parse(`${start}T00:00:00`)) / 86400000) : 0;
  const dailyTotal = entries.reduce((sum, [id, qty]) => sum + (gear.find((item) => item.id === id)?.price || 0) * qty, 0);
  document.querySelector("#rental-summary").textContent = days ? `${start} → ${end} · ${days} ${days === 1 ? "day" : "days"}` : "Choose pickup and return dates to price your rental.";
  const period = start && end ? `${start}/${end}` : "";
  const availabilitySummary = document.querySelector("#availability-summary");
  if (!period) availabilitySummary.textContent = "Choose dates to check availability.";
  else if (availabilityPeriod !== period) availabilitySummary.textContent = "Availability has not been checked for these dates.";
  else {
    availabilitySummary.textContent = "Request any quantity. The team will confirm your booking.";
  }
  document.querySelector("#cart-total-label").textContent = days ? `Estimated total · ${days} ${days === 1 ? "day" : "days"}` : "Daily estimate";
  document.querySelector("#cart-total").textContent = formatUGX(dailyTotal * (days || 1));
  document.querySelector("#cart-count").textContent = entries.reduce((sum, [, qty]) => sum + qty, 0);
  document.querySelector("#gear-count").textContent = String(gear.length);
  if (!gear.length) {
    document.querySelector("#cart-items").innerHTML = `<p class="empty-state">Loading your saved kit…</p>`;
    return;
  }
  document.querySelector("#cart-items").innerHTML = entries.length ? entries.map(([id, qty]) => {
    const item = gear.find((product) => product.id === id);
    return `<div class="cart-line"><div><h3>${escapeHtml(item.name)}</h3><p>${formatUGX(item.price)} / day${days ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}</p><div class="qty-controls"><button data-qty="${escapeHtml(id)}" data-delta="-1" aria-label="Remove one ${escapeHtml(item.name)}">−</button><span>${qty}</span><button data-qty="${escapeHtml(id)}" data-delta="1" aria-label="Add one ${escapeHtml(item.name)}">+</button></div></div><span class="line-price">${formatUGX(item.price * qty * (days || 1))}</span></div>`;
  }).join("") : `<p class="empty-state">Your kit is empty for now.<br />Add gear from the rental shelf.</p>`;
  writeCart();
}
function openCart() { document.querySelector("#drawer-backdrop").hidden = false; document.querySelector("#cart-drawer").classList.add("open"); document.querySelector("#cart-drawer").setAttribute("aria-hidden", "false"); }
function closeCart() { document.querySelector("#drawer-backdrop").hidden = true; document.querySelector("#cart-drawer").classList.remove("open"); document.querySelector("#cart-drawer").setAttribute("aria-hidden", "true"); }
const menuToggle = document.querySelector(".menu-toggle");
menuToggle?.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  document.querySelector("#primary-navigation")?.classList.toggle("is-open", open);
});
document.querySelector("#primary-navigation")?.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  menuToggle?.setAttribute("aria-expanded", "false");
  menuToggle?.setAttribute("aria-label", "Open navigation");
  event.currentTarget.classList.remove("is-open");
});
let toastTimer;
function toast(message) { const el = document.querySelector("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2300); }
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => { document.querySelector(".filter.active").classList.remove("active"); button.classList.add("active"); activeCategory = button.dataset.category; renderProducts(); }));
searchInput.addEventListener("input", renderProducts);
grid.addEventListener("click", (event) => { const button = event.target.closest("[data-add]"); if (!button) return; const id = button.dataset.add; cart[id] = (cart[id] || 0) + 1; renderCart(); renderProducts(); toast(`${gear.find((item) => item.id === id).name} added to your kit`); });
document.querySelector("#cart-items").addEventListener("click", (event) => { const button = event.target.closest("[data-qty]"); if (!button) return; const id = button.dataset.qty; const quantity = (cart[id] || 0) + Number(button.dataset.delta); cart[id] = quantity; if (cart[id] <= 0) delete cart[id]; renderCart(); renderProducts(); });
document.querySelector("#cart-open").addEventListener("click", openCart);
document.querySelector("#cart-close").addEventListener("click", closeCart);
document.querySelector("#drawer-backdrop").addEventListener("click", closeCart);
const pickupInput = document.querySelector("#rental-dates");
const returnInput = document.querySelector("#return-date");
const today = new Date();
const localToday = localDateString(today);
pickupInput.min = localToday;
returnInput.min = localToday;
pickupInput.addEventListener("change", () => {
  availabilityPeriod = "";
  availabilityById = {};
  if (pickupInput.value) {
    const nextDay = new Date(`${pickupInput.value}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    returnInput.min = localDateString(nextDay);
    if (returnInput.value && returnInput.value <= pickupInput.value) returnInput.value = "";
  }
  renderProducts();
  renderCart();
});
returnInput.addEventListener("change", () => { availabilityPeriod = ""; availabilityById = {}; renderProducts(); renderCart(); });
document.querySelector("#apply-dates").addEventListener("click", () => {
  const start = document.querySelector("#rental-dates").value;
  const end = document.querySelector("#return-date").value;
  if (start && end && end <= start) return toast("Return date must be at least one day after pickup.");
  if (!start || !end) return toast("Choose pickup and return dates to check availability.");
  checkAvailability().then(() => document.querySelector("#catalog").scrollIntoView({ behavior: "smooth" }));
});
async function checkAvailability() {
  const start = document.querySelector("#rental-dates").value;
  const end = document.querySelector("#return-date").value;
  const params = new URLSearchParams({ pickup: start, return: end, items: JSON.stringify(cart) });
  try {
    const response = await fetch(`/api/availability?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not check availability.");
    availabilityPeriod = `${start}/${end}`;
    availabilityById = Object.fromEntries(Object.entries(data.availability).map(([id, result]) => [id, result]));
    renderProducts();
    renderCart();
    toast("Dates checked. The team will confirm your booking.");
    return true;
  } catch (error) {
    toast(`Availability check failed: ${error.message}`);
    return false;
  }
}
document.querySelector("#checkout").addEventListener("click", async () => {
  if (!Object.keys(cart).length) return toast("Add some gear to your booking first.");
  const privacyConsent = document.querySelector("#privacy-consent");
  if (!privacyConsent.checked) return toast("Please acknowledge the Privacy Policy and Terms before submitting.");
  const start = document.querySelector("#rental-dates").value;
  const end = document.querySelector("#return-date").value;
  if (!start || !end || end <= start) return toast("Choose a pickup date and a later return date before continuing.");
  for (const field of ["#customer-name", "#customer-email", "#customer-phone"]) {
    if (!document.querySelector(field).reportValidity()) return;
  }
  const button = document.querySelector("#checkout");
  const status = document.querySelector("#booking-status");
  button.disabled = true;
  button.firstChild.textContent = "Submitting… ";
  status.textContent = "";
  try {
    if (!await checkAvailability()) {
      status.textContent = "Check the selected gear and dates, then update your kit before sending the request.";
      return;
    }
    const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pickupDate: start, returnDate: end, collection: document.querySelector("#location").value, items: cart, privacyAcknowledged: privacyConsent.checked, customer: { name: document.querySelector("#customer-name").value, email: document.querySelector("#customer-email").value, phone: document.querySelector("#customer-phone").value } }) });
    const data = await response.json();
    if (!response.ok) {
      if (data.availability) {
        availabilityById = Object.fromEntries(Object.entries(data.availability).map(([id, result]) => [id, result]));
        renderProducts();
      }
      throw new Error(data.error || "Could not create the booking request.");
    }
    cart = {};
    renderCart();
    const notices = data.booking.notifications || {};
    const emailOk = notices.email?.status === "sent";
    const whatsappOk = notices.whatsapp?.status === "accepted";
    if (whatsappOk) {
      status.textContent = emailOk
        ? `Request ${data.booking.id} received. The team was notified by email and WhatsApp; they’ll confirm your booking and payment with you.`
        : `Request ${data.booking.id} received and sent to the team by WhatsApp. Email notification needs attention.`;
    } else {
      const booking = data.booking;
      const whatsappMessage = [
        `Camera Matrix booking request ${booking.id}`,
        `Name: ${booking.customer.name}`,
        `Email: ${booking.customer.email}`,
        `Phone/WhatsApp: ${booking.customer.phone}`,
        `Dates: ${booking.pickupDate} to ${booking.returnDate} (${booking.rentalDays} days)`,
        `Collection: ${booking.collection}`,
        "Equipment:",
        ...booking.items.map((item) => `${item.name} × ${item.quantity}`),
        `Estimated total: UGX ${new Intl.NumberFormat("en-UG").format(booking.estimatedTotal)}`,
      ].join("\n");
      const whatsappUrl = `https://wa.me/256704738156?${new URLSearchParams({ text: whatsappMessage })}`;
      status.innerHTML = `Request ${booking.id} is saved (email: ${notices.email?.status || "not sent"}). <a href="${whatsappUrl}" target="_blank" rel="noopener noreferrer">Send the booking details to Camera Matrix on WhatsApp</a>.`;
    }
    toast(`Booking request ${data.booking.id} received`);
    await checkAvailability();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
    button.firstChild.textContent = "Request this booking ";
  }
});
fetch("/api/gear").then((response) => response.json()).then((data) => {
  if (!Array.isArray(data.products)) throw new Error("The rental catalog response is invalid.");
  gear = data.products;
  const validIds = new Set(gear.map((item) => item.id));
  cart = Object.fromEntries(Object.entries(cart).filter(([id]) => validIds.has(id)));
  inventoryReady = true;
  renderProducts();
  renderCart();
}).catch((error) => { console.error("Could not load rental catalog", error); toast("The rental catalog could not load. Refresh the page to try again."); });
initHeroSlider();
renderProducts();
renderCart();
