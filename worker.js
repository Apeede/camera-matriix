const ACTIVE_STATUSES = new Set(["requested", "confirmed"]);
const ALL_STATUSES = new Set(["requested", "confirmed", "declined", "cancelled", "completed"]);
const MAX_BODY_BYTES = 32_000;
const RATE_LIMIT = 8;
const RATE_WINDOW_SECONDS = 3_600;
const RETENTION_DAYS = 365;

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function isDatabaseError(error) {
  return /^(D1_ERROR:|SQLITE_|no such (?:table|column)|database is locked)/i.test(String(error?.message || ""));
}

function escapeXml(value) {
  return String(value).replace(/[<>&'\"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]);
}

function publicBooking(booking) {
  const fields = ["id", "status", "pickupDate", "returnDate", "rentalDays", "collection", "items", "estimatedTotal", "currency"];
  return Object.fromEntries(fields.filter((field) => field in booking).map((field) => [field, booking[field]]));
}

function parseBookingRow(row) {
  return JSON.parse(row.booking_json);
}

async function productsFor(env) {
  const response = await env.ASSETS.fetch(new Request("https://assets/catalog.json"));
  if (!response.ok) throw new Error("Could not load the rental catalog.");
  return response.json();
}

function dateValue(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Enter valid pickup and return dates.");
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Enter valid pickup and return dates.");
  return parsed;
}

function kampalaToday() {
  // Uganda uses UTC+03:00 year-round.
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dayCount(start, end) {
  return Math.max(1, Math.round((dateValue(end) - dateValue(start)) / 86_400_000));
}

function daysBetween(start, end) {
  const days = [];
  for (let current = dateValue(start); current < dateValue(end); current = new Date(current.getTime() + 86_400_000)) {
    days.push(current.toISOString().slice(0, 10));
  }
  return days;
}

async function activeBookings(env, start, end) {
  const result = await env.DB.prepare(
    "SELECT b.booking_json FROM bookings b WHERE b.status IN ('requested','confirmed') AND b.pickup_date < ? AND b.return_date > ?",
  ).bind(end, start).all();
  return (result.results || []).map(parseBookingRow);
}

async function availability(env, products, start, end, requested = {}) {
  dateValue(start);
  dateValue(end);
  if (end <= start) throw new Error("Return date must be after pickup date.");
  const answer = {};
  for (const product of products) {
    const quantity = requested[product.id] || 0;
    answer[product.id] = { available: Number.MAX_SAFE_INTEGER, requested: quantity, inStock: true, unlimited: true };
  }
  return answer;
}

function validItems(rawItems, products) {
  if (!rawItems || typeof rawItems !== "object" || Array.isArray(rawItems) || !Object.keys(rawItems).length) throw new Error("Add at least one item to your booking.");
  const byId = new Map(products.map((product) => [product.id, product]));
  const items = [];
  for (const [id, quantity] of Object.entries(rawItems)) {
    if (!byId.has(id) || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error("One or more item quantities are invalid.");
    const product = byId.get(id);
    items.push({ id, name: product.name, quantity, dailyRate: product.price });
  }
  return items;
}

function bookingMessage(booking) {
  return [
    `New Camera Matrix booking request ${booking.id}`,
    `Customer: ${booking.customer.name}`,
    `Email: ${booking.customer.email}`,
    `Phone/WhatsApp: ${booking.customer.phone}`,
    `Dates: ${booking.pickupDate} to ${booking.returnDate} (${booking.rentalDays} days)`,
    `Collection: ${booking.collection}`,
    "Equipment:",
    ...booking.items.map((item) => `• ${item.name} × ${item.quantity}`),
    `Estimated total: UGX ${new Intl.NumberFormat("en-UG").format(booking.estimatedTotal)}`,
    "Status: requested; follow up with the customer to confirm.",
  ].join("\n");
}

async function sendNotifications(booking, env, selected = ["email", "whatsapp"]) {
  const notifications = { ...(booking.notifications || {}) };
  const message = bookingMessage(booking);
  if (selected.includes("email")) {
    if (!env.RESEND_API_KEY || !env.BOOKING_NOTIFY_EMAIL || !env.MAIL_FROM) {
      notifications.email = { status: "not_configured" };
    } else {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: env.MAIL_FROM, to: [env.BOOKING_NOTIFY_EMAIL], reply_to: booking.customer.email, subject: `New rental request ${booking.id}`, text: message }),
        });
        if (!response.ok) throw new Error("Email provider rejected the request.");
        notifications.email = { status: "sent", updatedAt: new Date().toISOString() };
      } catch {
        notifications.email = { status: "failed", error: "Email delivery failed; check the email provider configuration." };
      }
    }
  }
  if (selected.includes("whatsapp")) {
    if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_API_VERSION || !env.WHATSAPP_ADMIN_TO) {
      notifications.whatsapp = { status: "not_configured" };
    } else {
      try {
        const response = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to: env.WHATSAPP_ADMIN_TO.replace(/\D/g, ""), type: "template", template: { name: env.WHATSAPP_TEMPLATE_NAME || "booking_request_alert", language: { code: env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US" }, components: [{ type: "body", parameters: [{ type: "text", text: message.slice(0, 1024) }] }] } }),
        });
        if (!response.ok) throw new Error("WhatsApp provider rejected the request.");
        notifications.whatsapp = { status: "accepted", updatedAt: new Date().toISOString() };
      } catch {
        notifications.whatsapp = { status: "failed", error: "WhatsApp delivery failed; check the WhatsApp configuration." };
      }
    }
  }
  return notifications;
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) mismatch |= (a[index] || 0) ^ (b[index] || 0);
  return mismatch === 0;
}

function adminAuthorized(request, env) {
  const expected = env.ADMIN_TOKEN || "";
  const provided = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  return Boolean(expected) && constantTimeEqual(provided, expected);
}

async function readJson(request) {
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_BODY_BYTES) throw new Error("Request is too large.");
  const value = JSON.parse(new TextDecoder().decode(body) || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Request body must be a JSON object.");
  return value;
}

async function clientHash(request) {
  const address = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function allowBookingRequest(request, env) {
  const hash = await clientHash(request);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("DELETE FROM booking_attempts WHERE created_at < ?").bind(now - RATE_WINDOW_SECONDS).run();
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM booking_attempts WHERE ip_hash = ? AND created_at >= ?").bind(hash, now - RATE_WINDOW_SECONDS).first();
  if (count.count >= RATE_LIMIT) return false;
  await env.DB.prepare("INSERT INTO booking_attempts (ip_hash, created_at) VALUES (?, ?)").bind(hash, now).run();
  return true;
}

async function bookingById(env, id) {
  const row = await env.DB.prepare("SELECT booking_json FROM bookings WHERE id = ?").bind(id).first();
  return row ? JSON.parse(row.booking_json) : null;
}

async function saveBooking(env, booking) {
  await env.DB.prepare("UPDATE bookings SET status = ?, pickup_date = ?, return_date = ?, updated_at = ?, booking_json = ? WHERE id = ?")
    .bind(booking.status, booking.pickupDate, booking.returnDate, booking.updatedAt, JSON.stringify(booking), booking.id).run();
}

async function changeBookingStatus(env, booking, status, products) {
  booking.status = status;
  booking.updatedAt = new Date().toISOString();
  await env.DB.prepare("UPDATE bookings SET status = ?, pickup_date = ?, return_date = ?, updated_at = ?, booking_json = ? WHERE id = ?")
    .bind(status, booking.pickupDate, booking.returnDate, booking.updatedAt, JSON.stringify(booking), booking.id).run();
  return booking;
}

async function bookingApi(request, env, url) {
  const path = url.pathname;
  if (request.method === "GET" && path === "/api/gear") {
    try { return json({ products: await productsFor(env) }); }
    catch { return json({ error: "Could not load the rental catalog." }, 500); }
  }
  if (request.method === "GET" && path === "/api/availability") {
    try {
      const products = await productsFor(env);
      const start = url.searchParams.get("pickup");
      const end = url.searchParams.get("return");
      const requested = JSON.parse(url.searchParams.get("items") || "{}");
      if (!requested || typeof requested !== "object" || Array.isArray(requested) || Object.values(requested).some((quantity) => !Number.isInteger(quantity) || quantity < 0)) throw new Error("Item quantities must be positive whole numbers.");
      return json({ pickupDate: start, returnDate: end, availability: await availability(env, products, start, end, requested) });
    } catch (error) {
      if (isDatabaseError(error)) return json({ error: "Availability could not be checked right now. Please try again." }, 503);
      return json({ error: error.message || "Invalid availability request." }, 400);
    }
  }
  if (request.method === "GET" && path === "/api/admin/bookings") {
    if (!adminAuthorized(request, env)) return json({ error: "Admin access is not configured or the token is invalid." }, 401);
    const result = await env.DB.prepare("SELECT booking_json FROM bookings ORDER BY created_at DESC").all();
    return json({ bookings: (result.results || []).map(parseBookingRow) });
  }
  const adminMatch = path.match(/^\/api\/admin\/bookings\/([A-Fa-f0-9]+)(?:\/(notify))?$/);
  if (request.method === "POST" && adminMatch) {
    if (!adminAuthorized(request, env)) return json({ error: "Admin access is not configured or the token is invalid." }, 401);
    const booking = await bookingById(env, adminMatch[1]);
    if (!booking) return json({ error: "Booking not found." }, 404);
    if (adminMatch[2] === "notify") {
      const channels = ["email", "whatsapp"].filter((channel) => !["sent", "accepted"].includes(booking.notifications?.[channel]?.status));
      booking.notifications = await sendNotifications(booking, env, channels);
      booking.updatedAt = new Date().toISOString();
      await saveBooking(env, booking);
      return json({ booking });
    }
    try {
      const payload = await readJson(request);
      if (!ALL_STATUSES.has(payload.status)) throw new Error("Choose a valid booking status.");
      const products = await productsFor(env);
      await changeBookingStatus(env, booking, payload.status, products);
      return json({ booking });
    } catch (error) {
      if (isDatabaseError(error)) return json({ error: "The booking could not be updated right now. Please try again." }, 503);
      return json({ error: error.message || "Invalid status." }, 400);
    }
  }
  const publicMatch = path.match(/^\/api\/bookings\/([A-Fa-f0-9]+)$/);
  if (request.method === "GET" && publicMatch) {
    const booking = await bookingById(env, publicMatch[1]);
    return booking ? json({ booking: publicBooking(booking) }) : json({ error: "Booking not found." }, 404);
  }
  if (request.method === "GET" && path === "/api/bookings") return json({ error: "Booking details require a booking ID." }, 405);
  if (request.method !== "POST" || path !== "/api/bookings") return json({ error: "Not found." }, 404);
  if (!await allowBookingRequest(request, env)) return json({ error: "Too many booking requests from this connection. Please try again later." }, 429);
  try {
    const payload = await readJson(request);
    const pickup = payload.pickupDate;
    const returnDate = payload.returnDate;
    dateValue(pickup);
    dateValue(returnDate);
    if (pickup < kampalaToday()) throw new Error("Pickup date cannot be in the past.");
    if (returnDate <= pickup) throw new Error("Return date must be after pickup date.");
    const customer = payload.customer || {};
    const name = typeof customer.name === "string" ? customer.name.trim() : "";
    const email = typeof customer.email === "string" ? customer.email.trim() : "";
    const phone = typeof customer.phone === "string" ? customer.phone.trim() : "";
    if (!name || !email.includes("@") || name.length > 100 || email.length > 200) throw new Error("Enter a name and valid email address.");
    if (!/^\+?[0-9][0-9 ()-]{6,20}$/.test(phone) || phone.replace(/\D/g, "").length < 7) throw new Error("Enter a valid phone number, including country code for WhatsApp follow-up.");
    if (payload.privacyAcknowledged !== true) throw new Error("Acknowledge the Privacy Policy and Terms before submitting.");
    const collection = payload.collection;
    if (!["Kampala · Kololo", "Entebbe · Airport pickup", "Delivery to me"].includes(collection)) throw new Error("Choose a valid collection option.");
    const products = await productsFor(env);
    const items = validItems(payload.items, products);
    const days = dayCount(pickup, returnDate);
    const now = new Date().toISOString();
    const id = crypto.randomUUID().replaceAll("-", "").toUpperCase();
    const booking = {
      id,
      createdAt: now,
      updatedAt: now,
      privacyAcknowledgedAt: now,
      privacyPolicyVersion: "2026-10-13.1",
      status: "requested",
      paymentStatus: "not_started",
      customer: { name, email, phone },
      pickupDate: pickup,
      returnDate,
      rentalDays: days,
      collection,
      items,
      estimatedTotal: items.reduce((sum, item) => sum + item.dailyRate * item.quantity, 0) * days,
      currency: "UGX",
      notifications: { email: { status: "sending" }, whatsapp: { status: "sending" } },
    };
    await env.DB.prepare("INSERT INTO bookings (id,status,pickup_date,return_date,created_at,updated_at,booking_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, booking.status, pickup, returnDate, now, now, JSON.stringify(booking)).run();
    booking.notifications = await sendNotifications(booking, env);
    await saveBooking(env, booking);
    return json({ booking }, 201);
  } catch (error) {
    if (isDatabaseError(error)) return json({ error: "We could not save your request right now. Please try again or contact Camera Matrix." }, 503);
    return json({ error: error.message || "Invalid booking." }, 400);
  }
}

async function staticResponse(request, env) {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/gear/")) {
    const id = decodeURIComponent(url.pathname.slice("/gear/".length).replace(/\/$/, ""));
    const response = await env.ASSETS.fetch(new Request(new URL(`/gear/${encodeURIComponent(id)}/index.html`, url)));
    if (response.ok) return response;
    return new Response("Gear not found.", { status: 404 });
  }
  return env.ASSETS.fetch(request);
}

async function apiFetch(request, env) {
  const url = new URL(request.url);
  const canonicalOrigin = (env.PUBLIC_BASE_URL || url.origin).replace(/\/+$/, "");
  if (url.pathname.startsWith("/api/")) return bookingApi(request, env, url);
  if (url.pathname === "/robots.txt") return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${canonicalOrigin}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  if (url.pathname === "/sitemap.xml") {
    const products = await productsFor(env);
    const paths = ["/", "/rentals.html", "/camera-rentals-kampala.html", "/lens-rentals-kampala.html", "/lighting-audio-rentals.html", "/how-to-rent.html", "/about.html", "/contact.html", "/privacy-policy.html", "/cookie-policy.html", "/terms.html", "/refund-policy.html", ...products.map((product) => `/gear/${product.id}`)];
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escapeXml(canonicalOrigin + path)}</loc></url>`).join("")}</urlset>`;
    return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    const response = await env.ASSETS.fetch(request);
    const body = await response.text();
    const business = JSON.stringify({ "@context": "https://schema.org", "@type": "LocalBusiness", name: "Camera Matrix Rentals", url: `${canonicalOrigin}/`, telephone: "+256704738156", email: "Cameramatrixrentals@gmail.com", areaServed: [{ "@type": "City", name: "Kampala" }, { "@type": "City", name: "Entebbe" }], priceRange: "UGX 20,000–200,000 per day" }).replaceAll("</", "<\\/");
    const headers = new Headers(response.headers);
    headers.delete("Content-Length");
    headers.delete("ETag");
    return new Response(body.replaceAll("{{CANONICAL}}", `${canonicalOrigin}/`).replace("{{BUSINESS_SCHEMA}}", business), { status: response.status, headers });
  }
  return staticResponse(request, env);
}

export default {
  async fetch(request, env) {
    try { return await apiFetch(request, env); }
    catch { return json({ error: "The request could not be completed. Please try again." }, 500); }
  },
  async scheduled(_event, env, ctx) {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
    ctx.waitUntil(env.DB.prepare("DELETE FROM bookings WHERE updated_at < ?").bind(cutoff).run());
    ctx.waitUntil(env.DB.prepare("DELETE FROM booking_attempts WHERE created_at < ?").bind(Math.floor(Date.now() / 1000) - RATE_WINDOW_SECONDS).run());
  },
};
