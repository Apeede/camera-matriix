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

ROOT = Path(__file__).resolve().parent
BOOKINGS_FILE = ROOT / "data" / "bookings.json"
LOCK = threading.Lock()
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


def save_bookings(bookings):
    BOOKINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    BOOKINGS_FILE.write_text(json.dumps(bookings, indent=2), encoding="utf-8")


def day_count(start, end):
    return max(1, (date.fromisoformat(end) - date.fromisoformat(start)).days)


def quantities_for_period(start, end):
    used = {item["id"]: 0 for item in PRODUCTS}
    for booking in load_bookings():
        if booking.get("status") != "requested":
            continue
        overlaps = start < booking["returnDate"] and end > booking["pickupDate"]
        if overlaps:
            for line in booking["items"]:
                used[line["id"]] = used.get(line["id"], 0) + line["quantity"]
    return used


def availability(start, end, requested):
    date.fromisoformat(start)
    date.fromisoformat(end)
    if end <= start:
        raise ValueError("Return date must be after pickup date.")
    used = quantities_for_period(start, end)
    results = {}
    for product in PRODUCTS:
        available = max(0, product["quantity"] - used[product["id"]])
        results[product["id"]] = {"available": available, "requested": requested.get(product["id"], 0), "inStock": available >= requested.get(product["id"], 0)}
    return results


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

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

    def page_shell(self, title, description, canonical, content, extra_schema=""):
        origin = safe_origin(self)
        description = escape(description, quote=True)
        title = escape(title)
        schema = business_schema(origin)
        if extra_schema:
            schema += "\n" + extra_schema
        return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title><meta name="description" content="{description}"><link rel="canonical" href="{escape(canonical, quote=True)}"><meta property="og:type" content="website"><meta property="og:title" content="{title}"><meta property="og:description" content="{description}"><meta property="og:url" content="{escape(canonical, quote=True)}"><meta name="theme-color" content="#202820"><link rel="icon" type="image/png" href="/assets/favicon-01.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="/styles.css"><style>.seo-main{{width:min(1080px,90%);margin:56px auto 80px;min-height:60vh}}.seo-main h1{{font:500 clamp(38px,6vw,62px)/1.05 Georgia,serif;letter-spacing:-.04em;max-width:850px}}.seo-main h2{{font:600 25px Manrope,sans-serif;margin:38px 0 12px}}.seo-main h3{{font:700 16px Manrope,sans-serif}}.seo-main p,.seo-main li{{font-size:15px;line-height:1.8;color:#626a5e;max-width:820px}}.seo-main a{{color:#59693b}}.seo-lead{{font-size:18px!important}}.seo-cta{{display:inline-flex;background:#29332a;color:white!important;text-decoration:none;padding:14px 20px;font-weight:700;margin:12px 10px 8px 0}}.seo-list{{display:grid;grid-template-columns:repeat(auto-fit,minmax(225px,1fr));gap:12px;padding:0;list-style:none}}.seo-list li{{background:white;border:1px solid #e6e5dd;padding:17px;margin:0}}.seo-list a{{font-weight:700}}.seo-product-list{{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}}.seo-product{{background:white;border:1px solid #e6e5dd;padding:16px}}.seo-product img{{width:100%;height:155px;object-fit:contain;background:#f0f1eb}}.seo-product p{{font-size:12px}}.seo-price{{font-weight:700;color:#202820!important}}.seo-nav{{display:flex;gap:16px;flex-wrap:wrap}}.seo-nav a{{font-size:12px}}.seo-product-detail{{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start}}.seo-product-detail img{{width:100%;max-height:560px;object-fit:contain;background:#eff0e9}}.seo-product-detail .seo-price{{font-size:23px}}.seo-main footer{{width:100%;margin-top:55px}}@media(max-width:650px){{.seo-product-detail{{grid-template-columns:1fr}}.seo-main{{margin:35px auto 60px}}}}</style><script type="application/ld+json">{schema}</script></head><body><header class="topbar"><a class="brand" href="/" aria-label="Camera Matrix home"><img src="/assets/logo-01.png" alt="Camera Matrix"></a><nav aria-label="Main navigation"><a href="/rentals.html">Rent gear</a><a href="/how-to-rent.html">How it works</a><a href="/contact.html">Contact</a></nav><a class="cart-button" href="/">Book gear <span aria-hidden="true">→</span></a></header><main class="seo-main">{content}<nav class="seo-nav" aria-label="More information"><a href="/rentals.html">All rental gear</a><a href="/camera-rentals-kampala.html">Camera rentals</a><a href="/lens-rentals-kampala.html">Lens rentals</a><a href="/lighting-audio-rentals.html">Lighting &amp; audio</a><a href="/how-to-rent.html">How to rent</a><a href="/about.html">About</a><a href="/contact.html">Contact</a></nav></main><footer><img src="/assets/logo-01.png" alt="Camera Matrix"><p>Good gear. Great stories. Yours next.</p><a href="mailto:Cameramatrixrentals@gmail.com">Bookings &amp; enquiries: Cameramatrixrentals@gmail.com ↗</a></footer><a class="whatsapp-float" href="https://wa.me/256704738156?text=Hello%20Camera%20Matrix%2C%20I%27d%20like%20to%20ask%20about%20a%20rental." target="_blank" rel="noopener noreferrer" aria-label="Contact Camera Matrix on WhatsApp"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3.4A12.4 12.4 0 0 0 5.3 22.1L4 28l6-1.3A12.4 12.4 0 1 0 16 3.4Zm0 22.5c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.5.8.8-3.4-.2-.4A10.1 10.1 0 1 1 16 25.9Zm5.6-7.5c-.3-.2-1.8-.9-2.1-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-1 1.2-.2.2-.4.2-.7.1-.3-.2-1.3-.5-2.5-1.6-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.7l.5-.6.3-.5c.1-.2 0-.4 0-.6l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.6.1-.9.4-.3.3-1.2 1.1-1.2 2.7s1.2 3.1 1.4 3.3c.2.2 2.3 3.5 5.6 4.9.8.3 1.4.5 1.8.6.8.2 1.5.2 2.1.1.7-.1 1.8-.8 2-1.5.3-.8.3-1.4.2-1.5-.1-.2-.3-.3-.6-.5Z"/></svg></a></body></html>'''

    def send_seo_page(self, path, origin):
        title, description, page = SEO_PAGES[path]
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
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
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
        if parsed.path == "/api/availability":
            query = parse_qs(parsed.query)
            try:
                start, end = query["pickup"][0], query["return"][0]
                requested = json.loads(query.get("items", ["{}"])[0])
                if not isinstance(requested, dict) or any(not isinstance(q, int) or q < 0 for q in requested.values()):
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
                return self.send_json(200, {"booking": booking})
            return self.send_json(404, {"error": "Booking not found."})
        if parsed.path == "/api/bookings":
            return self.send_json(405, {"error": "Booking details require a booking ID."})
        return super().do_GET()

    def do_POST(self):
        if urlparse(self.path).path != "/api/bookings":
            return self.send_json(404, {"error": "Not found."})
        try:
            payload = self.read_json()
            pickup, return_date = payload["pickupDate"], payload["returnDate"]
            date.fromisoformat(pickup)
            date.fromisoformat(return_date)
            if return_date <= pickup:
                raise ValueError("Return date must be after pickup date.")
            customer = payload.get("customer", {})
            name, email = customer.get("name", "").strip(), customer.get("email", "").strip()
            if not name or "@" not in email or len(name) > 100 or len(email) > 200:
                raise ValueError("Enter a name and valid email address.")
            collection = payload.get("collection", "")
            if collection not in {"Kampala · Kololo", "Entebbe · Airport pickup", "Delivery to me"}:
                raise ValueError("Choose a valid collection option.")
            raw_items = payload.get("items", {})
            if not isinstance(raw_items, dict) or not raw_items:
                raise ValueError("Add at least one item to your booking.")
            items = []
            for product_id, quantity in raw_items.items():
                if product_id not in PRODUCT_BY_ID or not isinstance(quantity, int) or quantity < 1 or quantity > 10:
                    raise ValueError("One or more item quantities are invalid.")
                product = PRODUCT_BY_ID[product_id]
                items.append({"id": product_id, "name": product["name"], "quantity": quantity, "dailyRate": product["price"]})
            with LOCK:
                stock = availability(pickup, return_date, raw_items)
                unavailable = [PRODUCT_BY_ID[key]["name"] for key, result in stock.items() if result["requested"] and not result["inStock"]]
                if unavailable:
                    return self.send_json(409, {"error": "Not enough stock for: " + ", ".join(unavailable), "availability": stock})
                days = day_count(pickup, return_date)
                total = sum(line["dailyRate"] * line["quantity"] for line in items) * days
                booking = {"id": uuid.uuid4().hex[:10].upper(), "createdAt": datetime.now(timezone.utc).isoformat(), "status": "requested", "paymentStatus": "not_started", "customer": {"name": name, "email": email}, "pickupDate": pickup, "returnDate": return_date, "rentalDays": days, "collection": collection, "items": items, "estimatedTotal": total, "currency": "UGX"}
                all_bookings = load_bookings()
                all_bookings.append(booking)
                save_bookings(all_bookings)
            return self.send_json(201, {"booking": booking})
        except (KeyError, ValueError, TypeError, json.JSONDecodeError) as error:
            return self.send_json(400, {"error": str(error) or "Invalid booking."})


if __name__ == "__main__":
    from argparse import ArgumentParser
    parser = ArgumentParser(description="Run the Camera Matrix rental app locally.")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Camera Matrix Rentals is running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server.")
    finally:
        server.server_close()
