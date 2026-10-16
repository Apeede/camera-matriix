const salePrice = (value) => `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
const saleEscape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const key = "camera-matrix-sale-enquiry";
let products = [];
let selected = {};
let item;
let photoIndex = 0;
window.addEventListener("sale-enquiry-change", () => { selected = getSelection(); renderDetails(); });

function getSelection() {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).filter(([, qty]) => Number.isSafeInteger(qty) && qty > 0)) : {};
  } catch { return {}; }
}
function saveSelection() {
  try { localStorage.setItem(key, JSON.stringify(selected)); } catch { /* Keep the current-page enquiry usable if storage is unavailable. */ }
  document.querySelector("#sale-enquiry-count").textContent = String(Object.values(selected).reduce((sum, qty) => sum + qty, 0));
  window.dispatchEvent(new Event("sale-enquiry-change"));
  renderDetails();
}
function renderDetails() {
  if (!item) return;
  const photos = item.images || [];
  const current = photos[photoIndex];
  const gallery = current
    ? `<div class="sale-detail-photo-wrap"><img id="sale-detail-photo" class="sale-detail-photo" src="${saleEscape(current)}" alt="${saleEscape(item.brand)} ${saleEscape(item.name)} photo ${photoIndex + 1}" referrerpolicy="no-referrer" onerror="this.classList.add('is-unavailable')" /><span class="sale-detail-placeholder">Product photo unavailable</span><span class="sale-detail-brand">${saleEscape(item.brand)}</span><span class="sale-detail-count">${photoIndex + 1} / ${photos.length}</span></div><div class="sale-thumbnails" role="group" aria-label="Product photos">${photos.map((source, index) => `<button class="sale-thumb ${index === photoIndex ? "is-active" : ""}" type="button" data-photo="${index}" aria-label="Show product photo ${index + 1}" aria-pressed="${index === photoIndex}"><img src="${saleEscape(source)}" alt="" loading="lazy" referrerpolicy="no-referrer" /></button>`).join("")}</div>`
    : `<div class="sale-detail-photo-wrap sale-photo-pending"><p>Product photos coming soon</p></div>`;
  const quantity = selected[item.id] || 0;
  const action = quantity
    ? `<div class="sale-detail-qty"><button type="button" data-delta="-1" aria-label="Remove one ${saleEscape(item.name)}">−</button><span>${quantity} in your enquiry</span><button type="button" data-delta="1" aria-label="Add one ${saleEscape(item.name)}">+</button></div>`
    : `<button type="button" class="sale-detail-add" data-delta="1">Add to enquiry list <span aria-hidden="true">+</span></button>`;
  const credits = item.imageSources?.length ? `<p class="sale-photo-credits">Reference photos: ${item.imageSources.map(saleEscape).join(" · ")}</p>` : "";
  const specs = item.specs?.length ? `<section class="sale-specs"><h2>Specifications</h2><dl>${item.specs.map((spec) => `<div><dt>${saleEscape(spec.label)}</dt><dd>${saleEscape(spec.value)}</dd></div>`).join("")}</dl></section>` : "";
  document.querySelector("#sale-detail").innerHTML = `<a class="sale-detail-back" href="/buy.html">← Back to equipment for sale</a><div class="sale-detail-layout"><section class="sale-gallery" aria-label="Product gallery">${gallery}${credits}<p class="sale-image-note">Reference product photos. Confirm exact package contents and stock with Camera Matrix.</p></section><section class="sale-detail-copy"><p class="eyebrow"><span></span> ${saleEscape(item.brand)} · EQUIPMENT FOR SALE</p><h1>${saleEscape(item.name)}</h1><p class="sale-detail-price">${salePrice(item.price)}</p><p class="sale-detail-description">${saleEscape(item.description || "Contact our team to confirm availability and package contents.")}</p>${specs}${action}<p class="sale-detail-help">Your enquiry list stays saved in this browser. Send the list to Camera Matrix on WhatsApp to check stock.</p><a class="sale-compare-link" href="/buy.html#sale-catalog">Compare with other cameras <span aria-hidden="true">→</span></a></section></div>${item.images?.length ? `<div class="sale-more-photos"><h2>More views of the ${saleEscape(item.name)}</h2><div class="sale-more-grid">${item.images.map((source, index) => `<button type="button" data-photo="${index}" aria-label="View photo ${index + 1}"><img src="${saleEscape(source)}" alt="${saleEscape(item.brand)} ${saleEscape(item.name)} view ${index + 1}" loading="lazy" referrerpolicy="no-referrer" /></button>`).join("")}</div></div>` : ""}`;
  document.querySelectorAll("[data-photo]").forEach((button) => button.addEventListener("click", () => {
    photoIndex = Number(button.dataset.photo);
    renderDetails();
  }));
  document.querySelector("[data-delta]")?.addEventListener("click", (event) => {
    const next = (selected[item.id] || 0) + Number(event.currentTarget.dataset.delta);
    if (next > 0) selected[item.id] = next;
    else delete selected[item.id];
    saveSelection();
  });
}

const menuToggle = document.querySelector(".menu-toggle");
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") !== "true";
  menuToggle.setAttribute("aria-expanded", String(open));
  menuToggle.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  document.querySelector("#primary-navigation").classList.toggle("is-open", open);
});
document.querySelector("#primary-navigation").addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open navigation");
  event.currentTarget.classList.remove("is-open");
});

selected = getSelection();
fetch("/buy-catalog.json").then((response) => {
  if (!response.ok) throw new Error("Could not load product information.");
  return response.json();
}).then((data) => {
  products = data;
  item = products.find((product) => product.id === new URLSearchParams(location.search).get("id"));
  if (!item) {
    document.querySelector("#sale-detail").innerHTML = '<section class="sale-detail-missing"><p class="eyebrow"><span></span> EQUIPMENT FOR SALE</p><h1>We could not find that item.</h1><a class="sale-detail-add" href="/buy.html">Browse gear for sale <span>→</span></a></section>';
    return;
  }
  document.title = `${item.brand} ${item.name} for Sale | Camera Matrix`;
  renderDetails();
  document.querySelector("#sale-enquiry-count").textContent = String(Object.values(selected).reduce((sum, qty) => sum + qty, 0));
}).catch((error) => {
  console.error("Could not load sale item", error);
  document.querySelector("#sale-detail").innerHTML = '<p class="detail-loading">Product details could not load. Please return to the sales catalog.</p>';
});
