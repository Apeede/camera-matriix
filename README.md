# Camera Matrix Rentals

Responsive camera and production gear rentals storefront. The catalog and rental rates are in `catalog.json`. Product details are server-rendered at clean `/gear/{product-id}` URLs.

## Run locally

```bash
cd "/Users/joel/Desktop/camera matriix"
python3 server.py
```

Open http://127.0.0.1:8000. Stop the server with Ctrl+C.

## Search visibility

- Public landing pages cover the rental catalog, Kampala camera rentals, lenses, lighting and audio, booking steps, about, and contact.
- `/robots.txt` points crawlers to `/sitemap.xml`; the sitemap includes all landing pages and current product detail URLs.
- The server renders page titles, descriptions, canonical URLs, LocalBusiness data, and Product pricing/specification data. Product schema states daily UGX rates and does not claim live availability.
- Set `PUBLIC_BASE_URL` to the public HTTPS origin when deploying (for example `https://example.com`) so canonical links and sitemap entries use the permanent domain. Without it, the app derives the origin from the request host.
- After deployment, verify the domain in Google Search Console and Bing Webmaster Tools, submit `/sitemap.xml`, and keep business details and catalog information accurate. Search inclusion and ranking depend on the search providers and cannot be guaranteed by the site code alone.

## Booking flow

- Rates in the supplied list are entered as UGX per day.
- Choose dates to check inventory, add equipment, and submit a booking request with your name, email, and phone/WhatsApp number. The phone number is used only to follow up on the request.
- Booking requests are saved in `data/bookings.json` and reduce availability for overlapping dates.
- Requests and confirmed bookings reserve inventory. Declined, cancelled, and completed bookings no longer block availability.
- The request is not paid or confirmed automatically; the rental operator must follow up.
- Booking submissions are rate-limited per client connection to reduce spam.
- The booking drawer rechecks availability before submitting and shows the selected dates, estimate, and check result together.
- After saving a request, the server emails `BOOKING_NOTIFY_EMAIL`. If WhatsApp Cloud API is configured, it also sends an automatic template notification; otherwise, the confirmation gives the customer a pre-filled WhatsApp link to send the request directly to the company. The delivery state appears in the admin booking list.

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

## Booking operations and data safety

- Start the server with the settings in `.env` loaded (or supply them through your deployment's secret manager).
- Open `/admin.html`, enter that token, and review requests or change their status. The admin API refuses access when `ADMIN_TOKEN` is unset. Do not expose the app over a public network without HTTPS and a strong token.
- Booking data is written atomically to `data/bookings.json`. Before each update, the previous file is copied into `data/backups/`; backups older than 30 days are pruned during later saves. Back up the `data/` directory separately and restrict access because it contains customer contact details.
- A retention sweep removes booking records and personal details after 365 days without an update, and sanitizes backup copies. The sweep runs at startup and at most once per day when the site receives a request. Legal, accounting, dispute, or security holds may require keeping specific records longer.
- The built-in server is intended for local use or a small trusted deployment. For a public multi-worker deployment, move booking persistence to a managed database and place the app behind an HTTPS reverse proxy with access controls and offsite backups.
- The catalog currently contains the values in `catalog.json`, including one unit per product. Verify every actual stock count and daily rate with the business before accepting live requests; update those values in `catalog.json` first. No stock or rate is inferred or certified by the app.

Product photos are remote product images and depend on the source hosts remaining available. Manufacturer reference URLs are retained in the catalog data. Inventory counts are set to one unit per item until the actual quantities are provided. Update `quantity` and `price` in `catalog.json` to verified stock counts and daily rates before accepting live bookings. Review the manufacturer links for exact package and model variants before publishing the catalog.


Bookings and enquiries: Cameramatrixrentals@gmail.com · WhatsApp: +256 704 738 156.
