let gear = [];
const formatUGX = (value) => `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
let activeCategory = "all";
let cart = JSON.parse(localStorage.getItem("camera-matrix-cart") || "{}");
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
  const visible = gear.filter((item) => (activeCategory === "all" || item.category === activeCategory) && `${item.name} ${item.type} ${item.desc} ${item.specs || ""} ${item.tag}`.toLowerCase().includes(query));
  grid.innerHTML = visible.map((item) => {
    const stock = availabilityById[item.id];
    const label = stock ? `${stock.available} available` : inventoryReady ? "● In stock" : "● Available";
    const disabled = stock && stock.available < 1;
    const photo = item.image ? `<img class="product-photo" src="${item.image}" alt="${item.imageAlt || `${item.name} product photo`}" loading="lazy" referrerpolicy="no-referrer" onerror="this.hidden=true" />` : "";
    return `<article class="product-card"><div class="product-visual" data-tone="${item.tone}"><span class="card-badge">${item.tag}</span>${photo}</div><div class="card-body"><div class="card-meta"><span>${item.type}</span><span class="available ${disabled ? "out-of-stock" : ""}">${label}</span></div><h3>${item.name}</h3><p class="product-desc">${item.desc}</p><p class="product-specs"><strong>Specs</strong> · ${item.specs || "See product details"}</p><div class="card-bottom"><span class="price"><strong>${formatUGX(item.price)}</strong> <small>/ day</small></span><button class="add-button" data-add="${item.id}" ${disabled ? "disabled" : ""}>${disabled ? "Unavailable" : "+ Add to kit"}</button></div><a class="product-link" href="/gear/${encodeURIComponent(item.id)}">Learn more <span aria-hidden="true">→</span></a></div></article>`;
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
    const unavailable = entries.filter(([id, qty]) => (availabilityById[id]?.available ?? 0) < qty);
    availabilitySummary.textContent = unavailable.length ? "Some selected quantities are unavailable for these dates." : "Selected gear is available for these dates.";
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
    return `<div class="cart-line"><div><h3>${item.name}</h3><p>${formatUGX(item.price)} / day${days ? ` · ${days} ${days === 1 ? "day" : "days"}` : ""}</p><div class="qty-controls"><button data-qty="${id}" data-delta="-1" aria-label="Remove one ${item.name}">−</button><span>${qty}</span><button data-qty="${id}" data-delta="1" aria-label="Add one ${item.name}">+</button></div></div><span class="line-price">${formatUGX(item.price * qty * (days || 1))}</span></div>`;
  }).join("") : `<p class="empty-state">Your kit is empty for now.<br />Add gear from the rental shelf.</p>`;
  localStorage.setItem("camera-matrix-cart", JSON.stringify(cart));
}
function openCart() { document.querySelector("#drawer-backdrop").hidden = false; document.querySelector("#cart-drawer").classList.add("open"); document.querySelector("#cart-drawer").setAttribute("aria-hidden", "false"); }
function closeCart() { document.querySelector("#drawer-backdrop").hidden = true; document.querySelector("#cart-drawer").classList.remove("open"); document.querySelector("#cart-drawer").setAttribute("aria-hidden", "true"); }
let toastTimer;
function toast(message) { const el = document.querySelector("#toast"); el.textContent = message; el.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2300); }
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => { document.querySelector(".filter.active").classList.remove("active"); button.classList.add("active"); activeCategory = button.dataset.category; renderProducts(); }));
searchInput.addEventListener("input", renderProducts);
grid.addEventListener("click", (event) => { const button = event.target.closest("[data-add]"); if (!button) return; const id = button.dataset.add; cart[id] = (cart[id] || 0) + 1; renderCart(); toast(`${gear.find((item) => item.id === id).name} added to your kit`); });
document.querySelector("#cart-items").addEventListener("click", (event) => { const button = event.target.closest("[data-qty]"); if (!button) return; const id = button.dataset.qty; cart[id] = (cart[id] || 0) + Number(button.dataset.delta); if (cart[id] <= 0) delete cart[id]; renderCart(); });
document.querySelector("#cart-open").addEventListener("click", openCart);
document.querySelector("#cart-close").addEventListener("click", closeCart);
document.querySelector("#drawer-backdrop").addEventListener("click", closeCart);
const pickupInput = document.querySelector("#rental-dates");
const returnInput = document.querySelector("#return-date");
const today = new Date();
const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
pickupInput.min = localToday;
returnInput.min = localToday;
pickupInput.addEventListener("change", () => {
  availabilityPeriod = "";
  if (pickupInput.value) {
    const nextDay = new Date(`${pickupInput.value}T00:00:00`);
    nextDay.setDate(nextDay.getDate() + 1);
    returnInput.min = nextDay.toISOString().slice(0, 10);
    if (returnInput.value && returnInput.value <= pickupInput.value) returnInput.value = "";
  }
  renderCart();
});
returnInput.addEventListener("change", () => { availabilityPeriod = ""; renderCart(); });
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
    const missing = Object.entries(cart).filter(([id, qty]) => (availabilityById[id]?.available ?? 0) < qty);
    renderCart();
    if (missing.length) toast("Some kit quantities are not available for those dates.");
    else toast("Availability checked for your rental dates.");
    return missing.length === 0;
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
        ? `Request ${data.booking.id} received. The team was notified by email and WhatsApp; they’ll confirm availability and payment with you.`
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
fetch("/api/gear").then((response) => response.json()).then((data) => { if (data.products) { gear = data.products; inventoryReady = true; renderProducts(); renderCart(); } }).catch((error) => { console.error("Could not load rental catalog", error); toast("The rental catalog could not load. Refresh the page to try again."); });
initHeroSlider();
renderProducts();
renderCart();
