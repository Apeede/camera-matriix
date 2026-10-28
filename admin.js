let token = "";
const list = document.querySelector("#bookings");
const saleList = document.querySelector("#sale-enquiries");
const academyList = document.querySelector("#academy-submissions");
const academyExport = document.querySelector("#academy-export");
const message = document.querySelector("#admin-message");
let academySubmissions = [];
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
function renderSaleEnquiries(enquiries) {
  saleList.innerHTML = enquiries.length ? enquiries.map((enquiry) => {
    const contact = [`<a href="https://wa.me/${escapeHtml(enquiry.customer.phone.replace(/\D/g, ""))}" target="_blank" rel="noopener noreferrer">${escapeHtml(enquiry.customer.phone)}</a>`, enquiry.customer.email ? escapeHtml(enquiry.customer.email) : "No email provided"].join(" · ");
    return `<article class="booking sale-enquiry-admin"><div><h2>${escapeHtml(enquiry.customer.name)} · ${escapeHtml(enquiry.id)}</h2><p>${contact}</p><p class="booking-items">${enquiry.items.map((item) => `${escapeHtml(item.brand)} ${escapeHtml(item.name)} × ${item.quantity} — ${formatUGX(item.unitPrice)} each`).join(" · ")}</p><p>Estimated total: ${formatUGX(enquiry.estimatedTotal)}</p><p>Submitted ${escapeHtml(new Date(enquiry.createdAt).toLocaleString())}</p></div><label>Status <select class="status-select" data-sale-status-id="${escapeHtml(enquiry.id)}" data-current-status="${escapeHtml(enquiry.status)}">${["new", "contacted", "resolved"].map((status) => `<option value="${status}" ${enquiry.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label></article>`;
  }).join("") : "<p>No sale enquiries yet.</p>";
}
function renderAcademySubmissions(submissions) {
  academySubmissions = submissions;
  academyExport.disabled = false;
  const labels = { training_interest: "Training interest", newsletter: "Newsletter", contact: "Contact enquiry", partnership: "Partnership proposal" };
  academyList.innerHTML = submissions.length ? submissions.map((submission) => {
    const data = submission.data || {};
    const details = Object.entries(data).filter(([key]) => key !== "email").map(([key, value]) => `${escapeHtml(key.replaceAll("_", " "))}: ${escapeHtml(value)}`).join("<br>");
    const statusOptions = submission.type === "newsletter" ? ["subscribed", "unsubscribed"] : ["new", "contacted", "resolved"];
    return `<article class="booking academy-submission-admin"><div><p>${escapeHtml(labels[submission.type] || submission.type)} · ${escapeHtml(submission.id)}</p><h2>${escapeHtml(submission.name || submission.email)}</h2><p><a href="mailto:${encodeURIComponent(submission.email)}">${escapeHtml(submission.email)}</a></p><p class="academy-submission-details">${details || "No additional details."}</p><p>Submitted ${escapeHtml(new Date(submission.createdAt).toLocaleString())} · Consent recorded ${escapeHtml(new Date(submission.consentAt).toLocaleDateString())} · Notification: ${escapeHtml(submission.notification?.status || "unknown")}</p>${submission.notification?.error ? `<p class="admin-error">${escapeHtml(submission.notification.error)}</p>` : ""}</div><label>Status <select class="status-select" data-academy-status-id="${escapeHtml(submission.id)}" data-current-status="${escapeHtml(submission.status)}">${statusOptions.map((status) => `<option value="${status}" ${submission.status === status ? "selected" : ""}>${status}</option>`).join("")}</select></label></article>`;
  }).join("") : "<p>No Academy submissions yet.</p>";
}
async function refresh() {
  message.textContent = "Loading…";
  try { const [data, saleData, academyData] = await Promise.all([request("/api/admin/bookings"), request("/api/admin/sale-enquiries"), request("/api/admin/academy-submissions")]); render(data.bookings); renderSaleEnquiries(saleData.enquiries); renderAcademySubmissions(academyData.submissions); const subscribers = academyData.submissions.filter((entry) => entry.type === "newsletter" && entry.status === "subscribed").length; message.className = "admin-help"; message.textContent = `${data.bookings.length} booking(s) · ${saleData.enquiries.length} sale enquiry(s) · ${academyData.submissions.length} Academy submission(s) · ${subscribers} subscribed contact(s). Changes save immediately.`; }
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
saleList.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-sale-status-id]");
  if (!select) return;
  const previousStatus = select.dataset.currentStatus || select.value;
  try { await request(`/api/admin/sale-enquiries/${encodeURIComponent(select.dataset.saleStatusId)}`, { method: "POST", body: JSON.stringify({ status: select.value }) }); select.dataset.currentStatus = select.value; message.className = "admin-help"; message.textContent = "Sale enquiry status saved."; }
  catch (error) { select.value = previousStatus; message.textContent = error.message; message.className = "admin-error"; }
});
academyList.addEventListener("change", async (event) => {
  const select = event.target.closest("[data-academy-status-id]");
  if (!select) return;
  const previousStatus = select.dataset.currentStatus || select.value;
  try {
    await request(`/api/admin/academy-submissions/${encodeURIComponent(select.dataset.academyStatusId)}`, { method: "POST", body: JSON.stringify({ status: select.value }) });
    select.dataset.currentStatus = select.value;
    const row = academySubmissions.find((submission) => submission.id === select.dataset.academyStatusId);
    if (row) row.status = select.value;
    message.className = "admin-help";
    message.textContent = "Academy submission status saved.";
  } catch (error) {
    select.value = previousStatus;
    message.textContent = error.message;
    message.className = "admin-error";
  }
});
academyExport.addEventListener("click", () => {
  const rows = academySubmissions.filter((entry) => entry.type === "newsletter" && entry.status === "subscribed");
  const quote = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = ["Email,First name,Subscribed at", ...rows.map((entry) => [entry.email, entry.data?.first_name || "", entry.consentAt].map(quote).join(","))].join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = "camera-matrix-academy-subscribers.csv";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
list.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-retry-id]");
  if (!button) return;
  button.disabled = true;
  message.textContent = "Retrying pending notifications…";
  try { await request(`/api/admin/bookings/${encodeURIComponent(button.dataset.retryId)}/notify`, { method: "POST" }); await refresh(); }
  catch (error) { message.textContent = error.message; message.className = "admin-error"; button.disabled = false; }
});
