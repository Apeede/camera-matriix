#!/usr/bin/env python3
"""Local Camera Matrix rental catalog and booking request server."""

from datetime import date, datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from html import escape
from os import environ
import re
import json
import threading
import uuid
import logging
import hmac
import os
import shutil
from datetime import timedelta
import smtplib
import ssl
import urllib.request
import urllib.error
from email.message import EmailMessage

ROOT = Path(__file__).resolve().parent
BOOKINGS_FILE = ROOT / "data" / "bookings.json"


def load_local_env():
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        environ.setdefault(key, value)


load_local_env()
LOCK = threading.Lock()
BOOKING_RATE_LOCK = threading.Lock()
BOOKING_ATTEMPTS = {}
LAST_RETENTION_SWEEP = None
BOOKING_RETENTION_DAYS = 365
BOOKING_RATE_LIMIT = 8
BOOKING_RATE_WINDOW = 3600
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
LOGGER = logging.getLogger("camera_matrix")
PRODUCTS = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
PRODUCT_BY_ID = {p["id"]: p for p in PRODUCTS}
SEO_PAGES = {
    "/rentals.html": ("Camera and Production Gear Rentals in Kampala | Camera Matrix", "Browse cameras, lenses, lighting and audio equipment available to rent by the day in Kampala, Uganda.", "rentals"),
    "/camera-rentals-kampala.html": ("Camera Rentals in Kampala, Uganda | Camera Matrix", "Rent Sony and Canon cameras and production equipment in Kampala. Compare daily UGX rates, choose rental dates and send a booking request.", "cameras"),
    "/lens-rentals-kampala.html": ("Camera Lens Rentals in Kampala | Camera Matrix", "Explore Sony, Canon RF and Canon EF lenses available for daily rental in Kampala, with specifications and UGX rates.", "lenses"),
    "/lighting-audio-rentals.html": ("Lighting and Audio Gear Rentals in Kampala | Camera Matrix", "Find lighting, microphones, audio recorders and production accessories for rent by the day in Kampala.", "production"),
    "/how-to-rent.html": ("How Camera Gear Rental Works | Camera Matrix Kampala", "Learn how to choose gear, select pickup and return dates, check availability and request your camera rental in Kampala.", "how"),
    "/about.html": ("About Camera Matrix Rentals | Kampala, Uganda", "Camera Matrix Rentals offers cameras, lenses and production equipment for filmmakers, photographers and creators in Kampala.", "about"),
    "/contact.html": ("Contact Camera Matrix Rentals | Kampala, Uganda", "Contact Camera Matrix Rentals about gear, dates and bookings by WhatsApp, phone or email.", "contact"),
    "/privacy-policy.html": ("Privacy Policy | Camera Matrix Rentals", "How Camera Matrix Rentals collects, uses, stores and protects booking information.", "privacy"),
    "/cookie-policy.html": ("Cookie and Browser Storage Policy | Camera Matrix Rentals", "Cookies, local browser storage, and third-party content used by Camera Matrix Rentals.", "cookies"),
    "/terms.html": ("Rental Terms and Conditions | Camera Matrix Rentals", "Terms for requesting, confirming and renting equipment from Camera Matrix Rentals.", "terms"),
    "/refund-policy.html": ("Cancellation and Refund Policy | Camera Matrix Rentals", "Cancellation and refund terms for Camera Matrix rental requests and confirmed bookings.", "refunds"),
}

POLICY_CONTENT = {
    "privacy": '''<h1>Privacy Policy</h1><p class="seo-lead">Last updated: 13 October 2026. This notice explains how Camera Matrix Rentals handles information when you browse the site or send a rental request.</p><h2>Who is responsible</h2><p>Camera Matrix Rentals is the business contact for booking information. Contact us at <a href="mailto:Cameramatrixrentals@gmail.com">Cameramatrixrentals@gmail.com</a> or <a href="https://wa.me/256704738156">+256 704 738 156 on WhatsApp</a>. The service area is Kampala and Entebbe, Uganda.</p><h2>Information we collect</h2><ul><li>Your name, email address, and phone/WhatsApp number when you submit a booking request.</li><li>Your selected equipment and quantities, pickup and return dates, collection option, booking ID, request status, and estimated rental amount.</li><li>Basic server request details used for operation and security, such as IP address, request path, and request time.</li><li>Your saved kit in your browser’s local storage. The saved kit contains product IDs and quantities, not your name or email.</li></ul><h2>How we use it</h2><p>We use booking information to check inventory, respond to the request you asked us to make, prepare a quote, manage a confirmed rental, and meet applicable record-keeping duties. We use your phone/WhatsApp number only to follow up about that booking request. A booking request is not automatically confirmed and the site does not collect payment.</p><p>We rely on the steps you ask us to take before entering a rental agreement and, where applicable, your consent or a legal obligation. The form asks you to acknowledge this notice and the rental terms before submitting.</p><h2>Who may receive it</h2><p>Authorized Camera Matrix staff can access booking records. The site host processes requests and stores booking records. If email notifications are configured, the booking details are sent through the configured email provider. If automatic WhatsApp notifications are enabled, booking details are sent through Meta’s WhatsApp Business Platform. If you choose the pre-filled WhatsApp link, you send the details to WhatsApp yourself. The site also loads Google Fonts and some product images from third-party hosts; those hosts may receive technical connection information such as your IP address and browser data.</p><p>We do not sell booking details. Some service providers may process information outside Uganda under their own terms and safeguards.</p><h2>Retention</h2><p>We retain enquiry and booking records for up to 12 months after the last update. The site removes expired records from its active booking file and sanitizes retained backup copies during its daily retention sweep. Records may be kept longer where required for legal, accounting, dispute, or security purposes.</p><h2>Your choices and rights</h2><p>You may ask us to confirm what personal information we hold, correct it, stop or restrict processing where the law allows, or delete it where we are not required to keep it. Contact <a href="mailto:Cameramatrixrentals@gmail.com">Cameramatrixrentals@gmail.com</a>. You can clear the saved kit by clearing this site’s browser storage. You may also contact Uganda’s Personal Data Protection Office about a data protection concern.</p><h2>Security</h2><p>Booking files and backups are stored by the site operator and should be accessible only to authorized staff. Use the admin token, restrict access to the server and its data folder, and use HTTPS for any public deployment. No internet transmission or storage method is completely secure.</p><h2>Changes and contact</h2><p>We may update this notice when our practices change. The latest date appears at the top. For privacy questions, email <a href="mailto:Cameramatrixrentals@gmail.com">Cameramatrixrentals@gmail.com</a> or call/WhatsApp <a href="https://wa.me/256704738156">+256 704 738 156</a>.</p>''',
    "cookies": '''<h1>Cookie and Browser Storage Policy</h1><p class="seo-lead">Last updated: 13 October 2026.</p><h2>Cookies</h2><p>The site’s current code does not set cookies and does not use analytics or advertising pixels. A cookie-consent pop-up is therefore not currently shown.</p><h2>Local browser storage</h2><p>The booking page uses browser local storage to remember the equipment and quantities in your kit between visits. This is a functional feature of the booking service; it does not store your name or email. You can remove it by clearing site data in your browser. If we add analytics, advertising, or other non-essential tracking/storage, we will update this policy and provide appropriate choices before enabling it.</p><h2>External content</h2><p>The site loads some fonts and product photographs from third-party services, and links to WhatsApp. When your browser loads or opens those services, they may receive technical information and apply their own policies. See our <a href="/privacy-policy.html">Privacy Policy</a> for more detail.</p><h2>Contact</h2><p>Questions? Email <a href="mailto:Cameramatrixrentals@gmail.com">Cameramatrixrentals@gmail.com</a> or WhatsApp <a href="https://wa.me/256704738156">+256 704 738 156</a>.</p>''',
    "terms": '''<h1>Rental Terms and Conditions</h1><p class="seo-lead">Last updated: 13 October 2026. These draft terms apply to requests made through the Camera Matrix Rentals website.</p><h2>1. A request is not a confirmed booking</h2><p>Submitting the online form sends a request only. It does not reserve equipment or create a confirmed rental. Camera Matrix must confirm availability and send you a written quote/confirmation. Do not travel to collect equipment until you have received confirmation.</p><h2>2. Reviewing your request and price</h2><p>Before submitting, review the equipment, quantities, dates, collection option, and displayed estimate in the booking drawer. You can change them before submission. Catalog rates are daily equipment rates. The written quote will state the full amount, including any applicable taxes, delivery/transport, deposits, other fees, payment method, and due dates before you accept or pay.</p><h2>3. Confirmation and collection</h2><p>A booking becomes confirmed only when Camera Matrix confirms it in writing and you accept the quote. The confirmation will state pickup and return arrangements, rental period, payment terms, any deposit, and the cancellation/refund terms for that booking.</p><h2>4. Use and return of equipment</h2><p>Use the equipment carefully and lawfully, keep it secure, do not lend or sub-rent it without written permission, and return it at the agreed time in the condition received, allowing for ordinary wear. Tell Camera Matrix promptly about loss, damage, malfunction, or a return delay. Any applicable late-return, repair, replacement, or other charge must be explained in the written quote or confirmation before the booking is accepted.</p><h2>5. Payment, cancellation, and refunds</h2><p>The website does not take payment. You may withdraw a request before it is confirmed without an online cancellation charge. For a confirmed booking, the written quote/confirmation will state the applicable deposit, payment schedule, cancellation cutoff, and refund treatment before you accept or pay. See the <a href="/refund-policy.html">Cancellation and Refund Policy</a>. These terms do not remove rights provided by applicable law.</p><h2>6. Contact and governing law</h2><p>Contact Camera Matrix Rentals at <a href="mailto:Cameramatrixrentals@gmail.com">Cameramatrixrentals@gmail.com</a> or <a href="https://wa.me/256704738156">+256 704 738 156</a>. These terms are governed by the laws of Uganda, subject to any mandatory consumer rights.</p>''',
    "refunds": '''<h1>Cancellation and Refund Policy</h1><p class="seo-lead">Last updated: 13 October 2026.</p><h2>Online requests</h2><p>Submitting a request through this website does not confirm a rental and does not charge you. You may withdraw an unconfirmed request at no charge by contacting Camera Matrix at <a href="mailto:Cameramatrixrentals@gmail.com">Cameramatrixrentals@gmail.com</a> or <a href="https://wa.me/256704738156">+256 704 738 156</a>. Since the website does not collect payment, there is no website payment to refund at this stage.</p><h2>Confirmed bookings</h2><p>Before you accept or pay for a confirmed booking, Camera Matrix will give you written terms stating any deposit, cancellation deadline, late-cancellation or no-show treatment, refund amount or deductions, and expected refund timing. Those terms form part of the quote/confirmation. No payment should be requested until those terms and the full price have been disclosed.</p><h2>Refund requests</h2><p>Contact Camera Matrix using the email or WhatsApp above and include your booking ID and payment details (do not send card passwords, PINs, or one-time codes). Refunds will be handled through the original payment method where practicable, within the period stated in the applicable confirmation and subject to mandatory law.</p><p>For each confirmed booking, the written quote will state the applicable cancellation deadline, deposit treatment, late-cancellation or no-show rule, and refund timing before payment is requested.</p>''',
}


def safe_origin(handler):
    configured = environ.get("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if configured:
        return configured
    host = handler.headers.get("Host", "127.0.0.1:8000")
    if not re.fullmatch(r"[A-Za-z0-9.\-\[\]:]+", host):
        host = "127.0.0.1:8000"
    scheme = "https" if handler.headers.get("X-Forwarded-Proto", "").split(",")[0].strip().lower() == "https" else "http"
    return f"{scheme}://{host}"


def business_schema(origin):
    return json.dumps({"@context": "https://schema.org", "@type": "LocalBusiness", "name": "Camera Matrix Rentals", "url": origin + "/", "telephone": "+256704738156", "email": "Cameramatrixrentals@gmail.com", "areaServed": [{"@type": "City", "name": "Kampala"}, {"@type": "City", "name": "Entebbe"}], "priceRange": "UGX 20,000–200,000 per day"}, ensure_ascii=False).replace("</", "<\\/")


def product_schema(product, canonical):
    return json.dumps({"@context": "https://schema.org", "@type": "Product", "name": product["name"], "description": product["desc"], "image": product.get("image"), "brand": {"@type": "Brand", "name": product.get("brand", "Camera Matrix")}, "sku": product["id"], "offers": {"@type": "Offer", "url": canonical, "priceCurrency": "UGX", "price": str(product["price"]), "priceSpecification": {"@type": "UnitPriceSpecification", "priceCurrency": "UGX", "price": str(product["price"]), "unitCode": "DAY", "unitText": "day"}}}, ensure_ascii=False).replace("</", "<\\/")


def load_bookings():
    try:
        return json.loads(BOOKINGS_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []


def booking_is_expired(booking, now=None):
    now = now or datetime.now(timezone.utc)
    value = booking.get("updatedAt") or booking.get("createdAt")
    try:
        activity = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if activity.tzinfo is None:
            activity = activity.replace(tzinfo=timezone.utc)
        return now - activity >= timedelta(days=BOOKING_RETENTION_DAYS)
    except (AttributeError, TypeError, ValueError):
        return False


def parse_rental_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Enter valid pickup and return dates.")
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise ValueError("Enter valid pickup and return dates.") from error


def kampala_today():
    return datetime.now(timezone(timedelta(hours=3))).date()


def write_booking_file(path, bookings):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(bookings, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def run_retention_sweep(force=False):
    global LAST_RETENTION_SWEEP
    now = datetime.now(timezone.utc)
    if not force and LAST_RETENTION_SWEEP and now - LAST_RETENTION_SWEEP < timedelta(hours=24):
        return
    with LOCK:
        records = load_bookings()
        retained = [booking for booking in records if not booking_is_expired(booking, now)]
        if len(retained) != len(records):
            write_booking_file(BOOKINGS_FILE, retained)
            LOGGER.info("Retention sweep removed %d expired booking record(s)", len(records) - len(retained))
        backups = BOOKINGS_FILE.parent / "backups"
        cutoff = now - timedelta(days=30)
        for backup in backups.glob("bookings-*.json") if backups.exists() else ():
            try:
                old_rows = json.loads(backup.read_text(encoding="utf-8"))
                clean_rows = [row for row in old_rows if not booking_is_expired(row, now)]
                if len(clean_rows) != len(old_rows):
                    write_booking_file(backup, clean_rows)
                if datetime.fromtimestamp(backup.stat().st_mtime, timezone.utc) < cutoff:
                    backup.unlink(missing_ok=True)
            except (OSError, ValueError, TypeError):
                LOGGER.exception("Could not sanitize booking backup %s", backup.name)
    LAST_RETENTION_SWEEP = now


def save_bookings(bookings):
    BOOKINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    bookings = [booking for booking in bookings if not booking_is_expired(booking, now)]
    if BOOKINGS_FILE.exists():
        backups = BOOKINGS_FILE.parent / "backups"
        backups.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        shutil.copy2(BOOKINGS_FILE, backups / f"bookings-{stamp}.json")
        for backup in sorted(backups.glob("bookings-*.json")):
            try:
                rows = json.loads(backup.read_text(encoding="utf-8"))
                clean_rows = [row for row in rows if not booking_is_expired(row, now)]
                if len(clean_rows) != len(rows):
                    write_booking_file(backup, clean_rows)
            except (OSError, ValueError, TypeError):
                LOGGER.exception("Could not sanitize booking backup %s", backup.name)
            if datetime.fromtimestamp(backup.stat().st_mtime, timezone.utc) < now - timedelta(days=30):
                backup.unlink(missing_ok=True)
    write_booking_file(BOOKINGS_FILE, bookings)


def day_count(start, end):
    return max(1, (parse_rental_date(end) - parse_rental_date(start)).days)


def availability(start, end, requested):
    parse_rental_date(start)
    parse_rental_date(end)
    if end <= start:
        raise ValueError("Return date must be after pickup date.")
    results = {}
    for product in PRODUCTS:
        results[product["id"]] = {"available": 9007199254740991, "requested": requested.get(product["id"], 0), "inStock": True, "unlimited": True}
    return results


def booking_message(booking):
    item_lines = [f"• {line['name']} × {line['quantity']}" for line in booking["items"]]
    return "\n".join([
        "New Camera Matrix booking request",
        f"Booking ID: {booking['id']}",
        f"Customer: {booking['customer']['name']}",
        f"Email: {booking['customer']['email']}",
        f"Phone/WhatsApp: {booking['customer'].get('phone', 'Not provided')}",
        f"Dates: {booking['pickupDate']} to {booking['returnDate']} ({booking['rentalDays']} days)",
        f"Collection: {booking['collection']}",
        "Equipment:", *item_lines,
        f"Estimated total: UGX {booking['estimatedTotal']:,}",
        "Status: requested; follow up with the customer to confirm.",
    ])


def deliver_booking_notifications(booking, channels=None):
    message = booking_message(booking)
    result = {}
    channels = channels or {"email", "whatsapp"}

    if "email" in channels:
        host = environ.get("SMTP_HOST", "").strip()
        username = environ.get("SMTP_USERNAME", "").strip()
        password = environ.get("SMTP_PASSWORD", "")
        recipient = environ.get("BOOKING_NOTIFY_EMAIL", "Cameramatrixrentals@gmail.com").strip()
        if not (host and username and password and recipient):
            result["email"] = {"status": "not_configured"}
        else:
            try:
                mail = EmailMessage()
                mail["Subject"] = f"New rental request {booking['id']}"
                mail["From"] = environ.get("SMTP_FROM", username)
                mail["To"] = recipient
                mail["Reply-To"] = booking["customer"]["email"]
                mail.set_content(message)
                port = int(environ.get("SMTP_PORT", "587"))
                if environ.get("SMTP_USE_SSL", "").lower() in {"1", "true", "yes"}:
                    with smtplib.SMTP_SSL(host, port, timeout=12, context=ssl.create_default_context()) as smtp:
                        smtp.login(username, password)
                        smtp.send_message(mail)
                else:
                    with smtplib.SMTP(host, port, timeout=12) as smtp:
                        smtp.ehlo()
                        smtp.starttls(context=ssl.create_default_context())
                        smtp.ehlo()
                        smtp.login(username, password)
                        smtp.send_message(mail)
                result["email"] = {"status": "sent", "updatedAt": datetime.now(timezone.utc).isoformat()}
            except Exception:
                LOGGER.exception("Booking email delivery failed for %s", booking["id"])
                result["email"] = {"status": "failed", "error": "Email delivery failed; check the server log."}

    if "whatsapp" in channels:
        token = environ.get("WHATSAPP_ACCESS_TOKEN", "").strip()
        phone_id = environ.get("WHATSAPP_PHONE_NUMBER_ID", "").strip()
        api_version = environ.get("WHATSAPP_API_VERSION", "").strip()
        recipient = re.sub(r"\D", "", environ.get("WHATSAPP_ADMIN_TO", ""))
        template = environ.get("WHATSAPP_TEMPLATE_NAME", "booking_request_alert").strip()
        language = environ.get("WHATSAPP_TEMPLATE_LANGUAGE", "en_US").strip()
        if not (token and phone_id and api_version and recipient and template):
            result["whatsapp"] = {"status": "not_configured"}
        else:
            try:
                payload = json.dumps({
                    "messaging_product": "whatsapp",
                    "to": recipient,
                    "type": "template",
                    "template": {"name": template, "language": {"code": language}, "components": [{"type": "body", "parameters": [{"type": "text", "text": message[:1024]}]}]},
                }).encode("utf-8")
                request = urllib.request.Request(
                    f"https://graph.facebook.com/{api_version}/{phone_id}/messages",
                    data=payload,
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(request, timeout=12) as response:
                    response.read()
                result["whatsapp"] = {"status": "accepted", "updatedAt": datetime.now(timezone.utc).isoformat()}
            except Exception:
                LOGGER.exception("Booking WhatsApp delivery failed for %s", booking["id"])
                result["whatsapp"] = {"status": "failed", "error": "WhatsApp delivery failed; check the server log."}
    return result


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        resolved = Path(super().translate_path(path)).resolve()
        try:
            relative_parts = resolved.relative_to(ROOT).parts
        except ValueError:
            relative_parts = ("blocked",)
        blocked_parts = {"data", "__pycache__"}
        if any(part in blocked_parts or part.startswith(".") for part in relative_parts):
            return str(ROOT / "__private_data_not_served__" / "not-found")
        return str(resolved)

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_html(self, status, body):
        data = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        LOGGER.info("%s - %s", self.address_string(), fmt % args)

    def require_admin(self):
        expected = environ.get("ADMIN_TOKEN", "")
        provided = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if not expected or not hmac.compare_digest(provided, expected):
            self.send_json(401, {"error": "Admin access is not configured or the token is invalid."})
            return False
        return True

    def allow_booking_request(self):
        now = datetime.now(timezone.utc).timestamp()
        address = self.client_address[0] if self.client_address else "unknown"
        with BOOKING_RATE_LOCK:
            active = {key: stamps for key, stamps in BOOKING_ATTEMPTS.items() if stamps and now - stamps[-1] < BOOKING_RATE_WINDOW}
            BOOKING_ATTEMPTS.clear()
            BOOKING_ATTEMPTS.update(active)
            attempts = [stamp for stamp in BOOKING_ATTEMPTS.get(address, []) if now - stamp < BOOKING_RATE_WINDOW]
            if len(attempts) >= BOOKING_RATE_LIMIT:
                self.send_json(429, {"error": "Too many booking requests from this connection. Please try again later."})
                return False
            attempts.append(now)
            BOOKING_ATTEMPTS[address] = attempts
        return True

    def page_shell(self, title, description, canonical, content, extra_schema=""):
        origin = safe_origin(self)
        description = escape(description, quote=True)
        title = escape(title)
        schema = business_schema(origin)
        if extra_schema:
            schema += "\n" + extra_schema
        return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title><meta name="description" content="{description}"><link rel="canonical" href="{escape(canonical, quote=True)}"><meta property="og:type" content="website"><meta property="og:title" content="{title}"><meta property="og:description" content="{description}"><meta property="og:url" content="{escape(canonical, quote=True)}"><meta name="theme-color" content="#202820"><link rel="icon" type="image/png" href="/assets/favicon-01.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/styles.css"><style>.seo-main{{width:min(1080px,90%);margin:56px auto 80px;min-height:60vh}}.seo-main h1{{font:500 clamp(38px,6vw,62px)/1.05 Georgia,serif;letter-spacing:-.04em;max-width:850px}}.seo-main h2{{font:600 25px Manrope,sans-serif;margin:38px 0 12px}}.seo-main h3{{font:700 16px Manrope,sans-serif}}.seo-main p,.seo-main li{{font-size:15px;line-height:1.8;color:#626a5e;max-width:820px}}.seo-main a{{color:#59693b}}.seo-lead{{font-size:18px!important}}.seo-cta{{display:inline-flex;background:#29332a;color:white!important;text-decoration:none;padding:14px 20px;font-weight:700;margin:12px 10px 8px 0}}.seo-list{{display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:12px;padding:0;list-style:none}}.seo-list li{{background:white;border:1px solid #e6e5dd;padding:17px;margin:0}}.seo-list a{{font-weight:700}}.seo-product-list{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}}.seo-product{{background:white;border:1px solid #e6e5dd;padding:16px}}.seo-product img{{width:100%;height:155px;object-fit:contain;background:#f0f1eb}}.seo-product p{{font-size:12px}}.seo-price{{font-weight:700;color:#202820!important}}.seo-nav{{display:flex;gap:16px;flex-wrap:wrap}}.seo-nav a{{font-size:12px}}.seo-product-detail{{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}}.seo-product-detail img{{width:100%;max-height:560px;object-fit:contain;background:#eff0e9}}.seo-product-detail .seo-price{{font-size:23px}}.seo-main footer{{width:100%;margin-top:55px}}@media(max-width:650px){{.seo-product-detail{{grid-template-columns:1fr}}.seo-main{{margin:35px auto 60px}}}}</style><script type="application/ld+json">{schema}</script></head><body><header class="topbar"><a class="brand" href="/" aria-label="Camera Matrix home"><img src="/assets/logo-01.png" alt="Camera Matrix"></a><nav aria-label="Main navigation"><a href="/rentals.html">Rent gear</a><a href="/how-to-rent.html">How it works</a><a href="/contact.html">Contact</a></nav><a class="cart-button" href="/">Book gear <span aria-hidden="true">→</span></a></header><main class="seo-main">{content}<nav class="seo-nav" aria-label="More information"><a href="/rentals.html">All rental gear</a><a href="/camera-rentals-kampala.html">Camera rentals</a><a href="/lens-rentals-kampala.html">Lens rentals</a><a href="/lighting-audio-rentals.html">Lighting &amp; audio</a><a href="/how-to-rent.html">How to rent</a><a href="/about.html">About</a><a href="/contact.html">Contact</a><a href="/privacy-policy.html">Privacy</a><a href="/cookie-policy.html">Cookies</a><a href="/terms.html">Terms</a><a href="/refund-policy.html">Cancellations &amp; refunds</a></nav></main><footer><img src="/assets/logo-01.png" alt="Camera Matrix"><p>Good gear. Great stories. Yours next.</p><div class="footer-links"><a href="/privacy-policy.html">Privacy</a><a href="/cookie-policy.html">Cookies</a><a href="/terms.html">Terms</a><a href="/refund-policy.html">Cancellations &amp; refunds</a></div><a href="mailto:Cameramatrixrentals@gmail.com">Bookings &amp; enquiries: Cameramatrixrentals@gmail.com ↗</a></footer><a class="whatsapp-float" href="https://wa.me/256704738156?text=Hello%20Camera%20Matrix%2C%20I%27d%20like%20to%20ask%20about%20a%20rental." target="_blank" rel="noopener noreferrer" aria-label="Contact Camera Matrix on WhatsApp"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.4A12.4 12.4 0 0 0 5.3 22.1L4 28l6-1.3A12.4 12.4 0 1 0 16 3.4Zm0 22.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.5.8.8-3.4-.2-.4A10.1 10.1 0 1 1 16 25.9Zm5.6-7.5c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.7l.5-.6.3-.5c.1-.2 0-.4 0-.6l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.1 1.4 3.3c.2.2 2.3 3.5 5.6 4.9.8.3 1.4.5 1.8.6.8.2 1.5.2 2.1.1.7-.1 1.8-.8 2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.5Z"/></svg></a></body></html>'''

    def send_seo_page(self, path, origin):
        title, description, page = SEO_PAGES[path]
        if page in POLICY_CONTENT:
            content = POLICY_CONTENT[page]
            return self.send_html(200, self.page_shell(title, description, origin + path, content))
        if page == "rentals":
            headline, intro, products = "Camera and production gear for rent in Kampala", "Browse the Camera Matrix rental catalog. Rates are shown in UGX per day; choose your dates on the booking page to check availability.", PRODUCTS
            content = f'<p class="eyebrow">CAMERA MATRIX RENTALS · KAMPALA, UGANDA</p><h1>{headline}</h1><p class="seo-lead">{intro}</p><a class="seo-cta" href="/">Choose dates &amp; request a booking →</a><h2>Available rental equipment</h2><div class="seo-product-list">' + "".join(self.product_teaser(p) for p in products) + "</div>"
        elif page == "cameras":
            products = [p for p in PRODUCTS if p["category"] == "camera"]
            content = '<p class="eyebrow">CAMERA RENTALS · KAMPALA</p><h1>Camera rentals in Kampala, Uganda</h1><p class="seo-lead">Choose a camera body for photography, video production, events and content creation. Compare specifications and daily rental rates, then request the dates you need.</p><div class="seo-product-list">' + "".join(self.product_teaser(p) for p in products) + '</div><h2>How to book a camera</h2><p>Open the booking page, choose pickup and return dates, select your gear and submit a booking request. The request is not a confirmed reservation until Camera Matrix follows up.</p><a class="seo-cta" href="/">Check dates and request a camera →</a>'
        elif page == "lenses":
            products = [p for p in PRODUCTS if p["category"] == "lens"]
            content = '<p class="eyebrow">LENS RENTALS · KAMPALA</p><h1>Camera lens rentals in Kampala</h1><p class="seo-lead">Explore Sony E-mount, Canon RF and Canon EF lenses with focal length, aperture and mount information shown on each product page. Confirm your camera mount before requesting a booking.</p><div class="seo-product-list">' + "".join(self.product_teaser(p) for p in products) + '</div><a class="seo-cta" href="/">Choose dates and request lenses →</a>'
        elif page == "production":
            products = [p for p in PRODUCTS if p["category"] in {"lighting", "audio", "accessories"}]
            content = '<p class="eyebrow">PRODUCTION EQUIPMENT · KAMPALA</p><h1>Lighting and audio gear rentals</h1><p class="seo-lead">Build a production kit with continuous lighting, flashes, wireless microphones, field recorders and supporting accessories. Product pages show the listed specifications and daily UGX rates.</p><div class="seo-product-list">' + "".join(self.product_teaser(p) for p in products) + '</div><a class="seo-cta" href="/">Check dates and request gear →</a>'
        elif page == "how":
            content = '<p class="eyebrow">BOOKING GUIDE</p><h1>How to rent camera gear</h1><p class="seo-lead">Choose equipment and dates online, then send a booking request for the Camera Matrix team to review.</p><ol><li><strong>Choose gear.</strong> Browse products and open Learn more for specifications and photos.</li><li><strong>Select dates.</strong> Choose pickup and return dates, then check availability for your rental period.</li><li><strong>Send your request.</strong> Add items to your booking list and submit your contact details. Payment is not collected online, and the request is not automatically confirmed.</li><li><strong>Confirm with the team.</strong> Camera Matrix follows up to discuss and confirm the booking.</li></ol><h2>Pickup and delivery options</h2><p>The booking form lists Kampala · Kololo, Entebbe · Airport pickup, and Delivery to me. Ask the team to confirm arrangements for your booking.</p><a class="seo-cta" href="/">Browse and choose rental dates →</a>'
        elif page == "about":
            content = '<p class="eyebrow">ABOUT CAMERA MATRIX</p><h1>Camera Matrix Rentals</h1><p class="seo-lead">Camera Matrix Rentals provides photography, video and production gear for creators, photographers and production teams in Uganda.</p><p>The online catalog includes camera bodies, lenses, lighting and audio equipment. Product pages include listed rental rates, product photos and key specifications so you can compare gear before requesting dates.</p><h2>Serving Kampala and Entebbe</h2><p>The booking form currently offers Kampala · Kololo, Entebbe · Airport pickup, and delivery as collection options. Contact the team to check the details for your dates.</p><a class="seo-cta" href="/rentals.html">Explore rental gear →</a>'
        else:
            content = '<p class="eyebrow">CONTACT &amp; BOOKINGS</p><h1>Talk to Camera Matrix Rentals</h1><p class="seo-lead">Ask about product details, rental dates, availability and booking arrangements.</p><ul class="seo-list"><li><h3>WhatsApp or phone</h3><p><a href="https://wa.me/256704738156">+256 704 738 156 · Open WhatsApp chat</a></p></li><li><h3>Email bookings</h3><p><a href="mailto:Cameramatrixrentals@gmail.com">Cameramatrixrentals@gmail.com</a></p></li></ul><h2>Ready to choose your kit?</h2><p>Browse the catalog, select pickup and return dates, and submit a booking request. The team will follow up to confirm.</p><a class="seo-cta" href="/">Browse gear and request dates →</a>'
        return self.send_html(200, self.page_shell(title, description, origin + path, content))

    def product_teaser(self, p):
        name = escape(p["name"])
        alt = escape(p.get("imageAlt", p["name"] + " product photo"), quote=True)
        photo = f'<img loading="lazy" src="{escape(p.get("image", ""), quote=True)}" alt="{alt}">' if p.get("image") else ""
        return f'<article class="seo-product">{photo}<h3><a href="/gear/{escape(p["id"], quote=True)}">{name}</a></h3><p>{escape(p["desc"])} · {escape(p.get("specs", ""))}</p><p class="seo-price">UGX {p["price"]:,} / day</p></article>'

    def send_product_page(self, product, origin):
        name = escape(product["name"])
        description = f'{product["desc"]} {product.get("specs", "")} Rent in Kampala from UGX {product["price"]:,} per day.'
        image = escape(product.get("image", ""), quote=True)
        image_alt = escape(product.get("imageAlt", product["name"] + " product photo"), quote=True)
        specs = [escape(part.strip()) for part in product.get("specs", "").split("·") if part.strip()]
        items = "".join(f"<li>{part}</li>" for part in specs)
        canonical = origin + "/gear/" + product["id"]
        schema = f'<script type="application/ld+json">{product_schema(product, canonical)}</script>'
        content = f'<p class="eyebrow">{escape(product["type"])} · CAMERA MATRIX RENTALS</p><div class="seo-product-detail"><img src="{image}" alt="{image_alt}" fetchpriority="high"><div><h1>{name}</h1><p class="seo-lead">{escape(product["desc"])}</p><p class="seo-price">UGX {product["price"]:,} / day</p><h2>Key specifications</h2><ul>{items}</ul><p>Confirm dates and availability before your shoot. Requests are reviewed by Camera Matrix and are not automatically confirmed online.</p><a class="seo-cta" href="/#catalog">Choose dates and request this gear →</a><h2>About this item</h2><p>{escape(product["name"])} is listed as a {escape(product["type"])}. Review compatibility and package requirements before submitting your booking request.</p></div></div>'
        return self.send_html(200, self.page_shell(name + " Rental in Kampala | Camera Matrix", description, canonical, content, schema))

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 32_000:
            raise ValueError("Request is too large.")
        value = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(value, dict):
            raise ValueError("Request body must be a JSON object.")
        return value

    def do_GET(self):
        run_retention_sweep()
        parsed = urlparse(self.path)
        origin = safe_origin(self)
        if parsed.path == "/robots.txt":
            body = f"User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: {origin}/sitemap.xml\n"
            data = body.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        if parsed.path == "/sitemap.xml":
            pages = ["/", *SEO_PAGES.keys(), *(f"/gear/{p['id']}" for p in PRODUCTS)]
            xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(f"<url><loc>{escape(origin + path)}</loc></url>" for path in pages) + "</urlset>"
            data = xml.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/xml; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            return self.wfile.write(data)
        if parsed.path in {"/", "/index.html"}:
            template = (ROOT / "index.html").read_text(encoding="utf-8")
            html = template.replace("{{CANONICAL}}", origin + "/").replace("{{BUSINESS_SCHEMA}}", business_schema(origin))
            return self.send_html(200, html)
        if parsed.path in SEO_PAGES:
            return self.send_seo_page(parsed.path, origin)
        if parsed.path.startswith("/gear/"):
            product_id = parsed.path.removeprefix("/gear/").strip("/")
            product = PRODUCT_BY_ID.get(product_id)
            if product:
                return self.send_product_page(product, origin)
            return self.send_html(404, self.page_shell("Gear not found | Camera Matrix", "This item was not found in the rental catalog.", origin + parsed.path, '<h1>Gear not found</h1><p>This item is not in the current rental catalog.</p><a class="seo-cta" href="/rentals.html">Browse available gear →</a>'))
        if parsed.path == "/api/gear":
            return self.send_json(200, {"products": PRODUCTS})
        if parsed.path == "/api/admin/bookings":
            if not self.require_admin():
                return
            with LOCK:
                return self.send_json(200, {"bookings": list(reversed(load_bookings()))})
        if parsed.path == "/api/availability":
            query = parse_qs(parsed.query)
            try:
                start, end = query["pickup"][0], query["return"][0]
                requested = json.loads(query.get("items", ["{}"])[0])
                if not isinstance(requested, dict) or any(type(q) is not int or q < 0 for q in requested.values()):
                    raise ValueError("Item quantities must be positive whole numbers.")
                result = availability(start, end, requested)
                return self.send_json(200, {"pickupDate": start, "returnDate": end, "availability": result})
            except (KeyError, ValueError, TypeError, json.JSONDecodeError) as error:
                return self.send_json(400, {"error": str(error)})
        if parsed.path.startswith("/api/bookings/"):
            booking_id = parsed.path.rsplit("/", 1)[-1]
            with LOCK:
                booking = next((b for b in load_bookings() if b["id"] == booking_id), None)
            if booking:
                public_fields = ("id", "status", "pickupDate", "returnDate", "rentalDays", "collection", "items", "estimatedTotal", "currency")
                return self.send_json(200, {"booking": {key: booking[key] for key in public_fields if key in booking}})
            return self.send_json(404, {"error": "Booking not found."})
        if parsed.path == "/api/bookings":
            return self.send_json(405, {"error": "Booking details require a booking ID."})
        return super().do_GET()

    def do_POST(self):
        run_retention_sweep()
        if urlparse(self.path).path.startswith("/api/admin/bookings/"):
            if not self.require_admin():
                return
            path_parts = urlparse(self.path).path.strip("/").split("/")
            booking_id = path_parts[-2] if path_parts[-1] == "notify" and len(path_parts) >= 4 else path_parts[-1]
            if path_parts[-1] == "notify":
                with LOCK:
                    bookings = load_bookings()
                    booking = next((item for item in bookings if item.get("id") == booking_id), None)
                    if not booking:
                        return self.send_json(404, {"error": "Booking not found."})
                    notifications = booking.setdefault("notifications", {})
                    channels = [channel for channel in ("email", "whatsapp") if notifications.get(channel, {}).get("status") not in {"sent", "accepted", "sending"}]
                    for channel in channels:
                        notifications[channel] = {"status": "sending"}
                    if channels:
                        save_bookings(bookings)
                    booking_copy = json.loads(json.dumps(booking))
                outcomes = deliver_booking_notifications(booking_copy, set(channels))
                with LOCK:
                    bookings = load_bookings()
                    booking = next(item for item in bookings if item.get("id") == booking_id)
                    booking.setdefault("notifications", {}).update(outcomes)
                    booking["updatedAt"] = datetime.now(timezone.utc).isoformat()
                    save_bookings(bookings)
                    return self.send_json(200, {"booking": booking})
            try:
                payload = self.read_json()
                status = payload.get("status")
                if status not in {"requested", "confirmed", "declined", "cancelled", "completed"}:
                    raise ValueError("Choose a valid booking status.")
                with LOCK:
                    bookings = load_bookings()
                    booking = next((item for item in bookings if item.get("id") == booking_id), None)
                    if not booking:
                        return self.send_json(404, {"error": "Booking not found."})
                    booking["status"] = status
                    booking["updatedAt"] = datetime.now(timezone.utc).isoformat()
                    save_bookings(bookings)
                return self.send_json(200, {"booking": booking})
            except (ValueError, TypeError, json.JSONDecodeError) as error:
                return self.send_json(400, {"error": str(error)})
        if urlparse(self.path).path != "/api/bookings":
            return self.send_json(404, {"error": "Not found."})
        if not self.allow_booking_request():
            return
        try:
            payload = self.read_json()
            pickup, return_date = payload["pickupDate"], payload["returnDate"]
            parse_rental_date(pickup)
            parse_rental_date(return_date)
            if pickup < kampala_today().isoformat():
                raise ValueError("Pickup date cannot be in the past.")
            if return_date <= pickup:
                raise ValueError("Return date must be after pickup date.")
            customer = payload.get("customer", {})
            if not isinstance(customer, dict):
                raise ValueError("Enter a name and valid email address.")
            raw_name, raw_email, raw_phone = customer.get("name", ""), customer.get("email", ""), customer.get("phone", "")
            if not all(isinstance(value, str) for value in (raw_name, raw_email, raw_phone)):
                raise ValueError("Enter a name, valid email address, and phone number.")
            name, email, phone = raw_name.strip(), raw_email.strip(), raw_phone.strip()
            if not name or "@" not in email or len(name) > 100 or len(email) > 200:
                raise ValueError("Enter a name and valid email address.")
            if not re.fullmatch(r"\+?[0-9][0-9 ()-]{6,20}", phone) or len(re.sub(r"\D", "", phone)) < 7:
                raise ValueError("Enter a valid phone number, including country code for WhatsApp follow-up.")
            if payload.get("privacyAcknowledged") is not True:
                raise ValueError("Acknowledge the Privacy Policy and Terms before submitting.")
            collection = payload.get("collection", "")
            if collection not in {"Kampala · Kololo", "Entebbe · Airport pickup", "Delivery to me"}:
                raise ValueError("Choose a valid collection option.")
            raw_items = payload.get("items", {})
            if not isinstance(raw_items, dict) or not raw_items:
                raise ValueError("Add at least one item to your booking.")
            items = []
            for product_id, quantity in raw_items.items():
                if product_id not in PRODUCT_BY_ID or type(quantity) is not int or quantity < 1:
                    raise ValueError("One or more item quantities are invalid.")
                product = PRODUCT_BY_ID[product_id]
                items.append({"id": product_id, "name": product["name"], "quantity": quantity, "dailyRate": product["price"]})
            with LOCK:
                days = day_count(pickup, return_date)
                total = sum(line["dailyRate"] * line["quantity"] for line in items) * days
                booking = {"id": uuid.uuid4().hex.upper(), "createdAt": datetime.now(timezone.utc).isoformat(), "privacyAcknowledgedAt": datetime.now(timezone.utc).isoformat(), "privacyPolicyVersion": "2026-10-13.1", "status": "requested", "paymentStatus": "not_started", "customer": {"name": name, "email": email, "phone": phone}, "pickupDate": pickup, "returnDate": return_date, "rentalDays": days, "collection": collection, "items": items, "estimatedTotal": total, "currency": "UGX", "notifications": {"email": {"status": "sending"}, "whatsapp": {"status": "sending"}}}
                all_bookings = load_bookings()
                all_bookings.append(booking)
                save_bookings(all_bookings)
            outcomes = deliver_booking_notifications(booking)
            with LOCK:
                all_bookings = load_bookings()
                stored_booking = next(item for item in all_bookings if item.get("id") == booking["id"])
                stored_booking["notifications"].update(outcomes)
                save_bookings(all_bookings)
                booking = stored_booking
            return self.send_json(201, {"booking": booking})
        except (KeyError, ValueError, TypeError, json.JSONDecodeError) as error:
            return self.send_json(400, {"error": str(error) or "Invalid booking."})


if __name__ == "__main__":
    from argparse import ArgumentParser
    parser = ArgumentParser(description="Run the Camera Matrix rental app locally.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    run_retention_sweep(force=True)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Camera Matrix Rentals is running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()
