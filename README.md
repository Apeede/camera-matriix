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
- Choose dates to check inventory, add equipment, and submit a booking request with your name and email.
- Booking requests are saved in `data/bookings.json` and reduce availability for overlapping dates.
- The request is not paid or confirmed automatically; the rental operator must follow up.

Product photos are remote product images and depend on the source hosts remaining available. Manufacturer reference URLs are retained in the catalog data. Inventory counts are set to one unit per item until the actual quantities are provided. Review the manufacturer links for exact package and model variants before publishing the catalog.


Bookings and enquiries: Cameramatrixrentals@gmail.com · WhatsApp: +256 704 738 156.
