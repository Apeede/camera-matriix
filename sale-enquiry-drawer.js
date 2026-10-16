(() => {
  const KEY = "camera-matrix-sale-enquiry";
  const drawer = document.querySelector("#sale-enquiry-drawer");
  if (!drawer) return;
  const backdrop = document.querySelector("#sale-drawer-backdrop");
  const itemsElement = document.querySelector("#sale-enquiry-items");
  const countElement = document.querySelector("#sale-enquiry-count");
  const totalElement = document.querySelector("#sale-enquiry-total");
  const enquiryForm = document.querySelector("#sale-enquiry-form");
  const startButton = document.querySelector("#sale-enquiry-start");
  const price = (amount) => `UGX ${new Intl.NumberFormat("en-UG").format(amount)}`;
  let products = [];

  const getSelection = () => {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY) || "{}");
      return stored && typeof stored === "object" && !Array.isArray(stored)
        ? Object.fromEntries(Object.entries(stored).filter(([, quantity]) => Number.isSafeInteger(quantity) && quantity > 0))
        : {};
    } catch { return {}; }
  };

  const render = () => {
    const selected = getSelection();
    const count = Object.values(selected).reduce((sum, quantity) => sum + quantity, 0);
    countElement.textContent = String(count);
    const chosen = products.filter((product) => selected[product.id]);
    itemsElement.innerHTML = chosen.length ? chosen.map((product) => {
      const quantity = selected[product.id];
      return `<article class="sale-enquiry-row"><div><p>${product.brand}</p><h3>${product.name}</h3><span>${price(product.price)} each</span></div><div class="sale-enquiry-controls"><button type="button" data-sale-drawer-qty="${product.id}" data-delta="-1" aria-label="Remove one ${product.name}">−</button><span>${quantity}</span><button type="button" data-sale-drawer-qty="${product.id}" data-delta="1" aria-label="Add one ${product.name}">+</button></div></article>`;
    }).join("") : '<p class="sale-enquiry-empty">Your enquiry list is empty. Add cameras from the catalog to get started.</p>';
    const total = chosen.reduce((sum, product) => sum + product.price * selected[product.id], 0);
    totalElement.textContent = price(total);
    startButton.disabled = !chosen.length;
  };

  const close = () => {
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    backdrop.hidden = true;
    document.body.classList.remove("drawer-open");
  };
  const open = () => {
    render();
    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
    document.body.classList.add("drawer-open");
    document.querySelector("#sale-enquiry-close").focus();
  };

  document.querySelector("#sale-enquiry-open").addEventListener("click", open);
  startButton.addEventListener("click", () => {
    if (!Object.values(getSelection()).some((quantity) => quantity > 0)) return;
    document.querySelector("#sale-enquiry-status").textContent = "";
    enquiryForm.hidden = false;
    startButton.hidden = true;
    enquiryForm.querySelector("input[name=name]").focus();
  });
  document.querySelector("#sale-enquiry-close").addEventListener("click", close);
  backdrop.addEventListener("click", close);
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && drawer.classList.contains("open")) close(); });
  window.addEventListener("sale-enquiry-change", render);
  window.addEventListener("storage", (event) => { if (event.key === KEY) render(); });
  itemsElement.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sale-drawer-qty]");
    if (!button) return;
    const selected = getSelection();
    const id = button.dataset.saleDrawerQty;
    const next = (selected[id] || 0) + Number(button.dataset.delta);
    if (next > 0) selected[id] = next;
    else delete selected[id];
    try { localStorage.setItem(KEY, JSON.stringify(selected)); } catch { /* Keep the list usable in this page. */ }
    window.dispatchEvent(new Event("sale-enquiry-change"));
  });
  enquiryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selected = getSelection();
    const chosen = products.filter((product) => selected[product.id]);
    if (!chosen.length) return;
    const button = enquiryForm.querySelector("button[type=submit]");
    const status = document.querySelector("#sale-enquiry-status");
    const form = new FormData(enquiryForm);
    button.disabled = true;
    button.firstChild.textContent = "Sending… ";
    status.textContent = "";
    try {
      const response = await fetch("/api/sale-enquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: { name: form.get("name"), phone: form.get("phone"), email: form.get("email") },
          items: selected,
          privacyAcknowledged: form.get("privacyAcknowledged") === "on",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not send your inquiry.");
      try { localStorage.setItem(KEY, "{}"); } catch { /* Submitted request is safely saved on the server. */ }
      window.dispatchEvent(new Event("sale-enquiry-change"));
      enquiryForm.reset();
      enquiryForm.hidden = true;
      startButton.hidden = false;
      status.textContent = `Inquiry ${data.enquiry.id} received. The Camera Matrix team will follow up.`;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      button.firstChild.textContent = "Send inquiry ";
    }
  });
  fetch("/buy-catalog.json").then((response) => {
    if (!response.ok) throw new Error("Could not load sale catalog");
    return response.json();
  }).then((catalog) => { products = catalog; render(); }).catch(() => render());
  render();
})();
