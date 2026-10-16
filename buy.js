const formatSalePrice = (value) => `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
const escapeSaleHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const saleGrid = document.querySelector("#sale-grid");
const saleSearch = document.querySelector("#sale-search");
const saleSort = document.querySelector("#sale-sort");
const ENQUIRY_KEY = "camera-matrix-sale-enquiry";
let saleItems = [];
let activeBrand = "all";
let enquiry = readEnquiry();
const compareIds = new Set();

function readEnquiry() {
  try {
    const stored = JSON.parse(localStorage.getItem(ENQUIRY_KEY) || "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([, quantity]) => Number.isSafeInteger(quantity) && quantity > 0));
  } catch { return {}; }
}

function saveEnquiry() {
  try { localStorage.setItem(ENQUIRY_KEY, JSON.stringify(enquiry)); } catch { /* Enquiry stays usable for this visit if storage is unavailable. */ }
  document.querySelector("#sale-enquiry-count").textContent = String(Object.values(enquiry).reduce((total, quantity) => total + quantity, 0));
}

function renderSaleItems() {
  const query = saleSearch.value.trim().toLowerCase();
  const visible = saleItems.filter((item) => (activeBrand === "all" || item.brand === activeBrand) && `${item.brand} ${item.name}`.toLowerCase().includes(query));
  const sorted = [...visible];
  if (saleSort.value === "price-asc") sorted.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
  if (saleSort.value === "price-desc") sorted.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name));
  if (saleSort.value === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  saleGrid.innerHTML = sorted.map((item) => {
    const quantity = enquiry[item.id] || 0;
    const photo = item.images?.[0] ? `<img class="sale-photo" src="${escapeSaleHtml(item.images[0])}" alt="${escapeSaleHtml(item.brand)} ${escapeSaleHtml(item.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.sale-visual').classList.remove('has-photo');this.remove()" />` : "";
    const control = quantity
      ? `<div class="sale-qty" aria-label="${quantity} ${escapeSaleHtml(item.name)} selected"><button type="button" data-sale-qty="${escapeSaleHtml(item.id)}" data-delta="-1" aria-label="Remove one ${escapeSaleHtml(item.name)}">−</button><span>${quantity} selected</span><button type="button" data-sale-qty="${escapeSaleHtml(item.id)}" data-delta="1" aria-label="Add one ${escapeSaleHtml(item.name)}">+</button></div>`
      : `<button class="sale-cta" type="button" data-sale-add="${escapeSaleHtml(item.id)}">Add to enquiry <span aria-hidden="true">+</span></button>`;
    const comparing = compareIds.has(item.id);
    return `<article class="sale-card"><div class="sale-visual ${photo ? "has-photo" : ""}">${photo}<span class="sale-photo-placeholder">Product photo unavailable</span><span class="sale-brand">${escapeSaleHtml(item.brand)}</span></div><div class="sale-card-body"><p class="sale-type">${escapeSaleHtml(item.brand)} camera</p><h3>${escapeSaleHtml(item.name)}</h3><div class="sale-card-bottom"><strong>${formatSalePrice(item.price)}</strong>${control}</div><a class="sale-learn" href="/buy-item.html?id=${encodeURIComponent(item.id)}">Learn more <span aria-hidden="true">→</span></a><button type="button" class="sale-compare-toggle ${comparing ? "is-selected" : ""}" data-sale-compare="${escapeSaleHtml(item.id)}" aria-pressed="${comparing}">${comparing ? "Remove from compare" : "Compare"}</button></div></article>`;
  }).join("");
  document.querySelector("#sale-empty").hidden = visible.length > 0;
  document.querySelector("#sale-count").textContent = String(visible.length);
  updateCompareBar();
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2300);
}

function updateCompareBar() {
  const count = compareIds.size;
  document.querySelector("#sale-compare-bar").hidden = count === 0;
  document.querySelector("#sale-compare-status").textContent = `${count} camera${count === 1 ? "" : "s"} selected`;
  const open = document.querySelector("#sale-compare-open");
  open.disabled = count < 2;
  open.textContent = count < 2 ? "Choose one more" : "Compare cameras";
  renderComparison();
}

function renderComparison() {
  const section = document.querySelector("#sale-compare-results");
  const chosen = saleItems.filter((item) => compareIds.has(item.id));
  if (chosen.length < 2) {
    section.hidden = true;
    section.innerHTML = "";
    return;
  }
  const labels = [...new Set(chosen.flatMap((item) => (item.specs || []).map((spec) => spec.label)))];
  const rows = [["Price", (item) => formatSalePrice(item.price)], ["About", (item) => item.description || "—"], ...labels.map((label) => [label, (item) => item.specs?.find((spec) => spec.label === label)?.value || "—"])];
  section.innerHTML = `<div class="sale-compare-heading"><div><p class="eyebrow"><span></span> SIDE-BY-SIDE</p><h2>Compare cameras</h2></div><button type="button" data-compare-close>Close comparison</button></div><div class="sale-compare-scroll"><table><thead><tr><th scope="col">Specification</th>${chosen.map((item) => `<th scope="col"><span>${escapeSaleHtml(item.brand)}</span><strong>${escapeSaleHtml(item.name)}</strong><button type="button" data-compare-remove="${escapeSaleHtml(item.id)}">Remove</button></th>`).join("")}</tr></thead><tbody>${rows.map(([label, value]) => `<tr><th scope="row">${escapeSaleHtml(label)}</th>${chosen.map((item) => `<td>${escapeSaleHtml(value(item))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  section.hidden = false;
}

document.querySelectorAll("[data-brand]").forEach((button) => button.addEventListener("click", () => {
  const current = document.querySelector(".sale-controls .filter.active");
  current?.classList.remove("active");
  current?.setAttribute("aria-pressed", "false");
  button.classList.add("active");
  button.setAttribute("aria-pressed", "true");
  activeBrand = button.dataset.brand;
  renderSaleItems();
}));
saleSearch.addEventListener("input", renderSaleItems);
saleSort.addEventListener("change", renderSaleItems);
saleGrid.addEventListener("click", (event) => {
  const compare = event.target.closest("[data-sale-compare]");
  if (compare) {
    const id = compare.dataset.saleCompare;
    if (compareIds.has(id)) compareIds.delete(id);
    else if (compareIds.size >= 3) showToast("Compare up to 3 cameras at a time.");
    else compareIds.add(id);
    renderSaleItems();
    return;
  }
  const add = event.target.closest("[data-sale-add]");
  const adjust = event.target.closest("[data-sale-qty]");
  const id = add?.dataset.saleAdd || adjust?.dataset.saleQty;
  if (!id) return;
  const next = (enquiry[id] || 0) + (add ? 1 : Number(adjust.dataset.delta));
  if (next > 0) enquiry[id] = next;
  else delete enquiry[id];
  saveEnquiry();
  renderSaleItems();
});
document.querySelector("#sale-compare-open").addEventListener("click", () => {
  if (compareIds.size < 2) return;
  renderComparison();
  document.querySelector("#sale-compare-results").scrollIntoView({ behavior: "smooth", block: "start" });
});
document.querySelector("#sale-compare-clear").addEventListener("click", () => {
  compareIds.clear();
  renderSaleItems();
});
document.querySelector("#sale-compare-results").addEventListener("click", (event) => {
  if (event.target.closest("[data-compare-close]")) {
    document.querySelector("#sale-compare-results").hidden = true;
    return;
  }
  const remove = event.target.closest("[data-compare-remove]");
  if (remove) {
    compareIds.delete(remove.dataset.compareRemove);
    renderSaleItems();
  }
});
document.querySelector("#sale-enquiry-open").addEventListener("click", () => {
  const lines = saleItems.filter((item) => enquiry[item.id] > 0).map((item) => `${item.brand} ${item.name} × ${enquiry[item.id]} — ${formatSalePrice(item.price)} each`);
  if (!lines.length) {
    const toast = document.querySelector("#toast");
    toast.textContent = "Add cameras to your enquiry list first.";
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2300);
    return;
  }
  const message = ["Hello Camera Matrix, please let me know availability for:", ...lines, "Please confirm stock and package details."] .join("\n");
  window.open(`https://wa.me/256704738156?${new URLSearchParams({ text: message })}`, "_blank", "noopener,noreferrer");
});

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

function initBuyHero() {
  const hero = document.querySelector("#buy-hero-carousel");
  if (!hero) return;
  const featured = [
    { image: "/assets/buy-hero/cinema-lens.jpg", alt: "Cinematic close-up of a professional camera lens", photographer: "Phil Hearing", source: "https://unsplash.com/photos/close-up-of-a-professional-cinema-camera-lens-Os9PU0os3p0", kicker: "CINEMA CAMERA CULTURE", title: "The craft behind every frame.", description: "Find the camera and production gear to bring your next idea to life." },
    { image: "/assets/buy-hero/camera-sunset.jpg", alt: "Camera on a tripod silhouetted against a vivid sunset", photographer: "Bornil Amin", source: "https://unsplash.com/photos/a-camera-on-a-tripod-in-front-of-a-sunset-rkVfj8Cb2IY", kicker: "TAKE IT OUT THERE", title: "Chase the last light.", description: "Explore cameras and tools for the places your stories take you." },
    { image: "/assets/buy-hero/lens-macro.jpg", alt: "Dramatic macro photograph of a camera lens", photographer: "Alexander Andrews", source: "https://unsplash.com/photos/a-close-up-of-a-camera-lens-on-a-black-background-fb7pmlbc-Xg", kicker: "BUILT AROUND THE DETAIL", title: "Make every image count.", description: "Compare the gear, specifications and prices before choosing your next camera." },
  ];
  const image = document.querySelector("#buy-hero-image");
  const pauseButton = hero.querySelector("[data-buy-hero-pause]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let index = 0;
  let timer;
  let paused = false;
  let hovering = false;
  let focused = false;
  let touchStartX = null;
  const show = (next) => {
    index = (next + featured.length) % featured.length;
    const item = featured[index];
    hero.classList.remove("has-no-photo");
    image.onerror = () => {
      if (featured[index] !== item) return;
      hero.classList.add("has-no-photo");
    };
    image.onload = () => hero.classList.remove("has-no-photo");
    image.classList.add("is-changing");
    image.src = item.image;
    image.alt = item.alt;
    document.querySelector("#buy-hero-image-link").setAttribute("aria-label", `${item.title} Explore cameras and gear for sale`);
    document.querySelector("#buy-hero-kicker").textContent = item.kicker;
    document.querySelector("#buy-hero-name").textContent = item.title;
    document.querySelector("#buy-hero-description").textContent = item.description;
    document.querySelector("#buy-hero-credit-text").textContent = `Photo by ${item.photographer}`;
    document.querySelector("#buy-hero-credit").href = item.source;
    document.querySelector("#buy-hero-image-index").textContent = `${String(index + 1).padStart(2, "0")} / ${String(featured.length).padStart(2, "0")}`;
    hero.querySelectorAll("[data-buy-hero-go]").forEach((dot, dotIndex) => {
      const active = dotIndex === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-pressed", String(active));
    });
    window.setTimeout(() => image.classList.remove("is-changing"), 250);
  };
  const stop = () => window.clearInterval(timer);
  const start = () => {
    stop();
    if (!reducedMotion.matches && !paused && !hovering && !focused && !document.hidden && featured.length > 1) {
      timer = window.setInterval(() => show(index + 1), 7000);
    }
  };
  hero.querySelector("[data-buy-hero-prev]").addEventListener("click", () => { show(index - 1); start(); });
  hero.querySelector("[data-buy-hero-next]").addEventListener("click", () => { show(index + 1); start(); });
  hero.querySelector("#buy-hero-dots").innerHTML = featured.map((item, dotIndex) => `<button type="button" data-buy-hero-go="${dotIndex}" aria-label="Show promotional photo: ${escapeSaleHtml(item.title)}" aria-pressed="${dotIndex === 0}"></button>`).join("");
  hero.querySelector("#buy-hero-dots").addEventListener("click", (event) => {
    const dot = event.target.closest("[data-buy-hero-go]");
    if (!dot) return;
    show(Number(dot.dataset.buyHeroGo));
    start();
  });
  pauseButton.addEventListener("click", () => {
    paused = !paused;
    pauseButton.textContent = paused ? "Play" : "Pause";
    pauseButton.setAttribute("aria-label", paused ? "Resume featured camera rotation" : "Pause featured camera rotation");
    start();
  });
  hero.addEventListener("mouseenter", () => { hovering = true; stop(); });
  hero.addEventListener("mouseleave", () => { hovering = false; start(); });
  hero.addEventListener("focusin", () => { focused = true; stop(); });
  hero.addEventListener("focusout", (event) => { if (!hero.contains(event.relatedTarget)) { focused = false; start(); } });
  hero.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const rect = hero.getBoundingClientRect();
    hero.style.setProperty("--pointer-x", `${(event.clientX - rect.left) / rect.width - 0.5}`);
    hero.style.setProperty("--pointer-y", `${(event.clientY - rect.top) / rect.height - 0.5}`);
  });
  hero.addEventListener("pointerleave", () => {
    hero.style.setProperty("--pointer-x", "0");
    hero.style.setProperty("--pointer-y", "0");
  });
  hero.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".buy-hero-image-link") && event.pointerType !== "mouse") touchStartX = event.clientX;
  });
  hero.addEventListener("pointerup", (event) => {
    if (touchStartX === null) return;
    const delta = event.clientX - touchStartX;
    touchStartX = null;
    if (Math.abs(delta) > 45) { show(index + (delta < 0 ? 1 : -1)); start(); }
  });
  document.addEventListener("visibilitychange", start);
  reducedMotion.addEventListener("change", start);
  show(0);
  start();
}

fetch("/buy-catalog.json").then((response) => {
  if (!response.ok) throw new Error("The sale catalog could not be loaded.");
  return response.json();
}).then((items) => {
  if (!Array.isArray(items)) throw new Error("The sale catalog is invalid.");
  saleItems = items;
  initBuyHero();
  const validIds = new Set(saleItems.map((item) => item.id));
  enquiry = Object.fromEntries(Object.entries(enquiry).filter(([id]) => validIds.has(id)));
  saveEnquiry();
  renderSaleItems();
}).catch((error) => {
  console.error("Could not load sale catalog", error);
  saleGrid.innerHTML = '<p class="empty-state">The sale catalog could not load. Please refresh the page.</p>';
});
