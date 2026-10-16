# Camera Matrix Rentals

Responsive camera and production gear rentals storefront. The catalog and rental rates are in `catalog.json`. Product details are server-rendered at clean `/gear/{product-id}` URLs.

The top navigation switches between rentals and the camera sales catalog at `/buy.html`. Sale listings, UGX prices, and product photo galleries are maintained in `buy-catalog.json`; each listing links to `/buy-item.html?id={product-id}` for additional photos. Buyers can filter, search, sort by price or model, save multiple items and quantities to a browser-stored enquiry list, then send one WhatsApp request to confirm stock and package details.

## Run locally

```bash
cd "/Users/joel/Desktop/camera matriix"
python3 server.py
```

Open http://127.0.0.1:8000. Stop the server with Ctrl+C.

## Free Cloudflare deployment

The production version is designed for Cloudflare Workers static assets and D1. The storefront and SEO pages are built into `public/`; booking APIs run in `worker.js`; booking records and date-level inventory reservations live in D1. Python is used only to render the existing pages during the build and for local development. It is not a production server requirement.

Cloudflare's free Workers plan currently includes up to 100,000 requests per day, and D1 includes up to 5 GB of storage, 5 million rows read per day, and 100,000 rows written per day. Free D1 databases support point-in-time recovery for seven days. These quotas are suitable to start with modest traffic; requests can fail if a daily quota is exceeded. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), and [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

### First-time setup

1. Install Node.js and npm, create a free Cloudflare account, and install dependencies in this project with `npm install`.
2. Sign in to Cloudflare from the project folder by running `npx wrangler login`.
3. In the Cloudflare dashboard, open **Storage & databases → D1 SQL Database → Create database** and name it `camera-matrix-bookings`. Copy its ID into `wrangler.jsonc` if you create a new database; this deployment already has its D1 ID configured.
4. Apply the database schema with `npx wrangler d1 migrations apply camera-matrix-bookings --remote`.
5. Generate a private admin token with `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'`. Set it without putting it in a file by running `npx wrangler secret put ADMIN_TOKEN`; paste the generated value at Wrangler's hidden prompt.
6. Deploy with `npm run deploy`. This builds the storefront and SEO pages, then deploys the static files and Worker together. The first deployment gets a temporary `workers.dev` address.
7. Add `cinematrix.store` to Cloudflare as a DNS zone. Review the imported records and preserve the MX and SPF records if you use Namecheap email forwarding. At Namecheap, set the two Cloudflare nameservers, then wait until Cloudflare marks the zone active. In **Workers & Pages → camera-matrix-rentals → Settings → Domains & Routes**, add both `cinematrix.store` and `www.cinematrix.store` as custom domains.

New booking requests are saved in D1. Email and automatic WhatsApp alerts are optional and are not active until their provider credentials and sender configuration are set as Worker secrets. Without notification credentials, customers receive the existing link to send the booking details to Camera Matrix on WhatsApp, and the team can review requests in `/admin.html`.

To configure email later, verify a sender domain with an HTTPS email API provider such as Resend, then set `RESEND_API_KEY`, `BOOKING_NOTIFY_EMAIL`, and `MAIL_FROM` as Worker secrets. Do not use SMTP credentials in Cloudflare Workers. Keep secrets out of Git and chat.

### Updating the deployed site

After changing the catalog or site files, run `npm run deploy` again. The build script renders the public SEO pages with `PUBLIC_BASE_URL` from the environment, or defaults to `https://www.cinematrix.store`.

## Search visibility

- Public landing pages cover the rental catalog, Kampala camera rentals, lenses, lighting and audio, booking steps, about, and contact.
- `/robots.txt` points crawlers to `/sitemap.xml`; the sitemap includes all landing pages and current product detail URLs.
- The server renders page titles, descriptions, canonical URLs, LocalBusiness data, and Product pricing/specification data. Product schema states daily UGX rates and does not claim live availability.
- `wrangler.jsonc` sets `PUBLIC_BASE_URL` to `https://www.cinematrix.store` so Worker-rendered canonical links, structured data, robots.txt, and sitemap entries use the preferred domain. The build script uses the same default; change both settings if the public domain changes.
- After deployment, verify the domain in Google Search Console and Bing Webmaster Tools, submit `/sitemap.xml`, and keep business details and catalog information accurate. Search inclusion and ranking depend on the search providers and cannot be guaranteed by the site code alone.

## Booking flow

- Rates in the supplied list are entered as UGX per day.
- Choose dates, add any requested quantity of equipment, and submit a booking request with your name, email, and phone/WhatsApp number. The phone number is used only to follow up on the request.
- The local Python server saves booking requests in `data/bookings.json`; the Cloudflare deployment stores them in D1. Inventory is treated as unlimited, and each request is reviewed by the team before confirmation.
- The request is not paid or confirmed automatically; the rental operator must follow up.
- Booking submissions are rate-limited per client connection to reduce spam.
- The booking drawer validates dates before submitting and shows the selected dates and estimate. The team confirms requested gear and quantities.
- After saving a request, local development uses SMTP and optionally WhatsApp Cloud API. Cloudflare uses an HTTPS email API and can optionally send WhatsApp Cloud API messages. Without notification credentials, the confirmation gives customers a pre-filled WhatsApp link; the team can review saved requests in the admin booking list.

### Configure booking notifications

For local setup, open Terminal and run:

```bash
cd "/Users/joel/Desktop/camera matriix"
cp .env.example .env
open -e .env
chmod 600 .env
```

Fill in the values below in the TextEdit window, save it, and restart the server. The `.env` file is git-ignored. Never send its contents in chat or commit it. Generate the admin token by running `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'` in Terminal and pasting the output into `ADMIN_TOKEN` in `.env`.

1. **Email:** use the company mailbox `Cameramatrixrentals@gmail.com` for `SMTP_USERNAME` and `SMTP_FROM`; `BOOKING_NOTIFY_EMAIL` is already set to this address. For Gmail SMTP, turn on 2-Step Verification for the account and create an App Password in its Google Account security settings. Put that app password in `SMTP_PASSWORD`, with `SMTP_HOST=smtp.gmail.com` and `SMTP_PORT=587`. Google may hide App Passwords for managed accounts or certain security configurations; in that case use an authorized SMTP provider's host, username, and password instead.
2. **Optional automatic WhatsApp:** the simpler setup needs no WhatsApp API credentials: the customer taps the pre-filled WhatsApp button after submitting, and sends the message to the company. For fully automatic WhatsApp alerts to the admin, set up Meta's Cloud API: connect the business app and sending number, then put the phone number ID, a long-lived access token, and API version in the matching `.env` fields. Set `WHATSAPP_ADMIN_TO` to an admin's WhatsApp phone in international digits-only format, distinct from the API sending number.
3. **Optional WhatsApp template:** for automatic alerts, get approval for a utility template named `booking_request_alert` with one body text variable (`{{1}}`), and set its language code. Meta requires a template before this app can send these automated messages.
4. **Admin login:** generate a private token with `python3 -c 'import secrets; print(secrets.token_urlsafe(32))'` and paste the result into `ADMIN_TOKEN` in `.env`.
5. **Run and check:** save `.env`, stop the old server with Ctrl+C, run `python3 server.py` again, open `/admin.html`, and enter the admin token. Submit a test booking using your own contact details, then cancel it after checking delivery. Check that email shows `sent`; if automatic WhatsApp is configured, check `accepted` and verify it arrives on the admin phone. Otherwise, tap the WhatsApp link in the customer confirmation and send the message. You can retry a failed automatic notification from the admin page.

The WhatsApp Cloud API follows Meta's official [WhatsApp Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api). Google documents App Password eligibility and setup in [Google Account Help](https://support.google.com/accounts/answer/185833?hl=en).

## Local Python data and safety

- Start the local server with settings from `.env` loaded.
- Open `/admin.html`, enter that token, and review requests or change their status. The admin API refuses access when `ADMIN_TOKEN` is unset. Do not expose the app over a public network without HTTPS and a strong token.
- Local booking data is written atomically to `data/bookings.json`. Before each update, the previous file is copied into `data/backups/`; backups older than 30 days are pruned during later saves. Restrict access to `data/` because it contains customer contact details.
- Locally, a retention sweep removes booking records and personal details after 365 days without an update, and sanitizes backup copies. Cloudflare runs its database retention sweep daily, and D1 provides seven-day point-in-time recovery on the free plan. Legal, accounting, dispute, or security holds may require keeping specific records longer.
- The built-in Python server is for local use or a small trusted deployment. The Cloudflare deployment uses a managed D1 database and Cloudflare HTTPS instead.
- Catalog requests are treated as unlimited quantity. Every booking remains a request until the Camera Matrix team reviews and confirms the dates and gear.

Product photos are remote product images and depend on the source hosts remaining available. Manufacturer reference URLs are retained in the catalog data. Review the manufacturer links for exact package and model variants before publishing the catalog.


Bookings and enquiries: Cameramatrixrentals@gmail.com · WhatsApp: +256 704 738 156.
