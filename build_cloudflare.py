#!/usr/bin/env python3
"""Build the public files from the existing local Python-rendered pages."""

from __future__ import annotations

import json
import html
import os
from pathlib import Path
import re
import shutil
import socket
import ssl
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.error import URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
STATIC_FILES = (
    "index.html",
    "product.html",
    "admin.html",
    "styles.css",
    "scroll-effects.js",
    "app.js",
    "product.js",
    "admin.js",
    "catalog.json",
    "buy.html",
    "buy.js",
    "buy-catalog.json",
    "buy-item.html",
    "buy-item.js",
    "sale-enquiry-drawer.js",
    "faq.html",
    "hero-videos.js",
    "academy.css",
    "academy.js",
)
ACADEMY_PATHS = (
    "training",
    "photography-videography",
    "partnerships",
    "about",
    "contact",
    "gallery",
)
SEO_PATHS = (
    "/rentals.html",
    "/camera-rentals-kampala.html",
    "/lens-rentals-kampala.html",
    "/lighting-audio-rentals.html",
    "/how-to-rent.html",
    "/about.html",
    "/contact.html",
    "/privacy-policy.html",
    "/cookie-policy.html",
    "/terms.html",
    "/refund-policy.html",
)


def fetch_page(base_url: str, path: str) -> bytes:
    with urlopen(base_url + path, timeout=15) as response:
        return response.read()


def open_drive_url(request: Request, timeout: int):
    system_cert = Path("/etc/ssl/cert.pem")
    context = ssl.create_default_context(cafile=str(system_cert) if system_cert.exists() else None)
    return urlopen(request, timeout=timeout, context=context)


def build_gallery_manifest() -> bytes:
    albums = json.loads((ROOT / "gallery" / "albums.json").read_text(encoding="utf-8"))
    events = []
    for album in albums:
        title, folder = album["title"], album["folder"]
        request = Request(
            f"https://drive.google.com/embeddedfolderview?id={folder}#grid",
            headers={"User-Agent": "Mozilla/5.0 CinematrixAcademy/1.0"},
        )
        with open_drive_url(request, timeout=30) as response:
            source = response.read().decode("utf-8", errors="replace")
        photos = []
        entries = re.finditer(
            r'<div class="flip-entry" id="entry-([^"]+)"[\s\S]*?<div class="flip-entry-title">([\s\S]*?)</div>',
            source,
        )
        for entry in entries:
            photo_id, raw_name = entry.groups()
            name = html.unescape(re.sub(r"<[^>]+>", "", raw_name)).strip()
            if not re.search(r"\.(?:jpe?g|png|heic|webp|gif|avif)$", name, re.IGNORECASE):
                continue
            next_entry = source.find('<div class="flip-entry"', entry.end())
            item_html = source[entry.start():next_entry if next_entry >= 0 else len(source)]
            preview_match = re.search(r'<div class="flip-entry-thumb"><img src="([^"]+)', item_html)
            preview = html.unescape(preview_match.group(1)) if preview_match else ""
            photos.append({"id": photo_id, "name": name, "preview": preview})
        events.append({"title": title, "folder": folder, "photos": photos})

    if not events or any(not event["photos"] for event in events):
        raise RuntimeError("Could not build a complete photo manifest for every Academy gallery folder.")
    return json.dumps(events, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

def write_gallery_image_paths(manifest: bytes) -> None:
    events = json.loads(manifest)
    paths = list(dict.fromkeys(
        photo["src"]
        for event in events
        for photo in event["photos"]
        if photo.get("src")
    ))
    source = "window.galleryImagePaths = " + json.dumps(paths, ensure_ascii=False, separators=(",", ":")) + ";\n"
    for output in (ROOT / "gallery" / "gallery-image-paths.js", PUBLIC / "gallery" / "gallery-image-paths.js"):
        output.write_text(source, encoding="utf-8")

def download_gallery_photo(photo: dict, output_dir: Path) -> None:
    output = output_dir / f"{photo['id']}.jpg"
    if output.exists() and output.stat().st_size > 1000:
        photo["src"] = f"/gallery-images/{photo['id']}.jpg"
        return
    preview = photo.get("preview", "")
    if not preview:
        raise RuntimeError(f"No Drive preview URL for gallery photo {photo['id']}.")
    if re.search(r"=s\d+$", preview):
        preview = re.sub(r"=s\d+$", "=w640", preview)
    last_error = None
    for attempt in range(4):
        try:
            request = Request(preview, headers={"User-Agent": "Mozilla/5.0 CinematrixAcademy/1.0"})
            with open_drive_url(request, timeout=90) as response:
                content_type = response.headers.get("Content-Type", "")
                data = response.read()
            if not content_type.startswith("image/") or len(data) < 1000:
                raise RuntimeError(f"Drive preview download failed for photo {photo['id']}.")
            output.write_bytes(data)
            photo["src"] = f"/gallery-images/{photo['id']}.jpg"
            return
        except Exception as error:
            last_error = error
            time.sleep(min(2 ** attempt, 8))
    raise RuntimeError(f"Could not download gallery photo {photo['id']} after retries: {last_error}")


def bundle_gallery_photos(events: list[dict], output_dir: Path) -> bytes:
    output_dir.mkdir(parents=True, exist_ok=True)
    photos = [photo for event in events for photo in event["photos"]]
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(download_gallery_photo, photo, output_dir) for photo in photos]
        for index, future in enumerate(as_completed(futures), start=1):
            future.result()
            if index % 100 == 0 or index == len(futures):
                print(f"Bundled {index}/{len(futures)} Academy gallery photos.")
    return json.dumps(events, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def main() -> int:
    if PUBLIC.exists():
        shutil.rmtree(PUBLIC)
    PUBLIC.mkdir(parents=True)

    for filename in STATIC_FILES:
        shutil.copy2(ROOT / filename, PUBLIC / filename)
    shutil.copytree(ROOT / "assets", PUBLIC / "assets")
    for path in ACADEMY_PATHS:
        shutil.copytree(ROOT / path, PUBLIC / path)
    gallery_manifest = build_gallery_manifest()
    events = json.loads(gallery_manifest)
    gallery_manifest = bundle_gallery_photos(events, ROOT / ".gallery-image-cache")
    local_gallery_images = ROOT / "gallery-images"
    if local_gallery_images.exists():
        shutil.rmtree(local_gallery_images)
    shutil.copytree(ROOT / ".gallery-image-cache", local_gallery_images)
    shutil.copytree(ROOT / ".gallery-image-cache", PUBLIC / "gallery-images")
    (ROOT / "gallery-manifest.json").write_bytes(gallery_manifest)
    (PUBLIC / "gallery-manifest.json").write_bytes(gallery_manifest)
    write_gallery_image_paths(gallery_manifest)

    staging = ROOT / ".academy-staging"
    if staging.exists():
        shutil.rmtree(staging)
    shutil.copytree(ROOT / "training", staging)
    shutil.copytree(ROOT / "training", staging / "training")
    for path in ACADEMY_PATHS[1:]:
        shutil.copytree(ROOT / path, staging / path)
    shutil.copy2(ROOT / "academy.css", staging / "academy.css")
    shutil.copy2(ROOT / "academy.js", staging / "academy.js")
    (staging / "gallery-manifest.json").write_bytes(gallery_manifest)
    shutil.copytree(PUBLIC / "gallery-images", staging / "gallery-images")
    (staging / "assets").mkdir()
    for filename in ("logo-01.png", "favicon-01.png"):
        shutil.copy2(ROOT / "assets" / filename, staging / "assets" / filename)
    (staging / "assets" / "hero").mkdir(parents=True)
    shutil.copy2(ROOT / "assets" / "hero" / "Sony camera cgI.jpeg", staging / "assets" / "hero" / "Sony camera cgI.jpeg")
    for page in staging.rglob("*.html"):
        content = page.read_text(encoding="utf-8")
        content = content.replace('<meta name="theme-color"', '<meta name="robots" content="noindex, nofollow"><meta name="theme-color"', 1)
        page.write_text(content, encoding="utf-8")

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    base_url = f"http://127.0.0.1:{port}"
    process_env = os.environ.copy()
    process_env["PUBLIC_BASE_URL"] = process_env.get("PUBLIC_BASE_URL", "").strip() or "https://www.cinematrix.store"
    server = subprocess.Popen(
        [sys.executable, str(ROOT / "server.py"), "--host", "127.0.0.1", "--port", str(port)],
        cwd=ROOT,
        env=process_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(100):
            if server.poll() is not None:
                raise RuntimeError("The local page renderer stopped before the static build completed.")
            try:
                fetch_page(base_url, "/")
                break
            except (URLError, TimeoutError):
                time.sleep(0.1)
        else:
            raise RuntimeError("The local page renderer did not start in time.")

        for path in SEO_PATHS:
            (PUBLIC / path.lstrip("/")).write_bytes(fetch_page(base_url, path))

        products = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
        for product in products:
            path = f"/gear/{product['id']}"
            output = PUBLIC / "gear" / product["id"] / "index.html"
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(fetch_page(base_url, path))
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()

    print(f"Built {PUBLIC.relative_to(ROOT)} for Cloudflare Workers.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
