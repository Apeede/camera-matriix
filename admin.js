let token = "";
const list = document.querySelector("#bookings");
const message = document.querySelector("#admin-message");
const formatUGX = (value) => `UGX ${new Intl.NumberFormat("en-UG").format(value)}`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
function render(bookings) {
  list.innerHTML = bookings.length ? bookings.map((booking) => {
    const notifications = booking.notifications || {};
    const emailStatus = notifications.email?.status || "not_sent";
    const whatsappStatus = notifications.whatsapp?.status || "not_sent";
    const retryable = !["sent", "accepted"].includes(emailStatus) || !["sent", "accepted"].includes(whatsappStatus);
    return `<article class="booking"><div><h2>${escapeHtml(booking.customer.name)} · ${escapeHtml(booking.id)}</h2><p>${escapeHtml(booking.pickupDate)} → ${escapeHtml(booking.returnDate)} · ${escapeHtml(booking.collection)}</p><p>${escapeHtml(booking.customer.email)} · ${escapeHtml(booking.customer.phone || "No phone")} · ${formatUGX(booking.estimatedTotal)} total</p><p class="booking-items">${booking.items.map((item) => `${escapeHtml(item.name)} × ${item.quantity}`).join(" · ")}</p><p>Submitted ${escapeHtml(new Date(booking.createdAt).toLocaleString())}</p><p>Email: ${escapeHtml(emailStatus)} · WhatsApp: ${escapeHtml(whatsappStatus)}</p>${notifications.email?.error || notifications.whatsapp?.error ? `<p class="admin-error">${escapeHtml(notifications.email?.error || notifications.whatsapp?.error)}</p>` : ""}${retryable ? `<button type="button" data-retry-id="${escapeHtml(booking.id)}">Retry notifications</button>` : ""}</div><label>Status <select class="status-select" data-status-id="${escapeHtml(booking.id)}" data-current-status="${escapeHtml(booking.status)}">${["requested", "confirmed", "declined", "cancelled", "completed"].map((status) => `<option value="${status}" ${booking.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label></article>`;
  }).join("") : "<p>No booking requests yet.</p>";
}
async function refresh() {
  message.textContent = "Loading…";
  try { const data = await request("/api/admin/bookings"); render(data.bookings); message.className = "admin-help"; message.textContent = `${data.bookings.length} booking(s). Changes save immediately.`; }
  catch (error) { message.textContent = error.message; message.className = "admin-error"; }
}
document.querySelector("#admin-login").addEventListener("submit", async (event) => { event.preventDefault(); token = document.querySelector("#admin-token").value; await refresh(); });
list.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-status-id]");
  if (!select) return;
  const previousStatus = select.dataset.currentStatus || select.value;
  try { await request(`/api/admin/bookings/${encodeURIComponent(select.dataset.statusId)}`, { method: "POST", body: JSON.stringify({ status: select.value }) }); select.dataset.currentStatus = select.value; message.className = "admin-help"; message.textContent = "Booking status saved. Inventory has been updated."; }
  catch (error) { select.value = previousStatus; message.textContent = error.message; message.className = "admin-error"; }
});
list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-retry-id]");
  if (!button) return;
  button.disabled = true;
  message.textContent = "Retrying pending notifications…";
  try { await request(`/api/admin/bookings/${encodeURIComponent(button.dataset.retryId)}/notify`, { method: "POST" }); await refresh(); }
  catch (error) { message.textContent = error.message; message.className = "admin-error"; button.disabled = false; }
});
