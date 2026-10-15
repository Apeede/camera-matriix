const root = document.querySelector("#product-detail");
const id = new URLSearchParams(location.search).get("id");
const formatUGX = (value) => `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
fetch("/api/gear").then((response) => response.json()).then(({ products }) => {
  const item = products.find((product) => product.id === id);
  if (!item) {
    root.innerHTML = `<section class="detail-missing"><p class="eyebrow"><span></span> PRODUCT NOT FOUND</p><h1>This item isn’t in the rental shelf.</h1><a class="detail-cta" href="index.html#catalog">Browse all gear <span>→</span></a></section>`;
    return;
  }
  document.title = `${item.name} | Camera Matrix`;
  const photo = item.image ? `<img class="detail-photo" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.imageAlt || item.name)}" onerror="this.hidden=true;this.parentElement.classList.add('detail-photo-unavailable')" />` : `<div class="detail-photo-unavailable" role="img" aria-label="Product photo unavailable"></div>`;
  const specs = (item.specs || "Details available on request").split(" · ").map((spec) => `<li>${escapeHtml(spec)}</li>`).join("");
  root.innerHTML = `
    <a class="detail-back" href="index.html#catalog">← Back to all gear</a>
    <section class="detail-layout">
      <div class="detail-gallery"><div class="detail-photo-frame" data-tone="${item.tone}">${photo}</div><p class="detail-image-caption">${item.name}</p></div>
      <div class="detail-copy">
        <p class="eyebrow"><span></span> ${escapeHtml(item.tag.toUpperCase())}</p>
        <p class="detail-type">${escapeHtml(item.type)}</p>
        <h1>${escapeHtml(item.name)}</h1>
        <p class="detail-description">${escapeHtml(item.desc)}</p>
        <div class="detail-price"><strong>${formatUGX(item.price)}</strong><span>per day</span></div>
        <a class="detail-cta" href="index.html#top">Choose rental dates <span>→</span></a>
        <div class="detail-spec-block"><h2>Key specifications</h2><ul>${specs}</ul></div>
        <div class="detail-note"><span class="live-dot"></span>Check availability for your dates on the booking page.</div>
      </div>
    </section>`;
}).catch(() => {
  root.innerHTML = `<section class="detail-missing"><p class="eyebrow"><span></span> DETAILS UNAVAILABLE</p><h1>Product details couldn’t load.</h1><a class="detail-cta" href="index.html#catalog">Back to gear <span>→</span></a></section>`;
});
