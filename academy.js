const academyMenu = document.querySelector(".academy-menu");
const academyNav = document.querySelector(".academy-nav");

academyMenu?.addEventListener("click", () => {
  const open = academyMenu.getAttribute("aria-expanded") !== "true";
  academyMenu.setAttribute("aria-expanded", String(open));
  academyMenu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
  academyNav?.classList.toggle("is-open", open);
});

document.querySelectorAll("[data-email-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const fields = new FormData(form);
    const subject = String(fields.get("subject") || form.dataset.subject || "Cinematrix Academy enquiry");
    const message = [...fields.entries()]
      .filter(([name]) => name !== "subject")
      .map(([name, value]) => `${name.replaceAll("_", " ")}: ${String(value).trim()}`)
      .join("\n");
    const email = `mailto:Cameramatrixrentals@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.location.href = email;

    const status = form.querySelector("[data-form-status]");
    if (status) status.textContent = "Your email app should open with this message ready. Send it there to complete your request.";
  });
});

const orbitCanvas = document.querySelector("[data-orbit-canvas]");

if (orbitCanvas) {
  const context = orbitCanvas.getContext("2d", { alpha: false });
  const albumButtons = [...document.querySelectorAll("[data-orbit-album]")];
  const progress = document.querySelector("[data-orbit-progress]");
  const progressBar = document.querySelector("[data-orbit-progress-bar]");
  const progressPercent = document.querySelector("[data-orbit-percent]");
  const progressLabel = document.querySelector(".orbit-progress-copy span");
  const focusLabel = document.querySelector("[data-orbit-focus]");
  const albumLink = document.querySelector("[data-orbit-album-link]");
  const albumCount = document.querySelector("[data-orbit-count]");
  const imageCache = new Map();
  let events = albumButtons.map((button) => ({
    title: button.dataset.orbitAlbum,
    folder: button.dataset.orbitFolder,
    photos: [{ id: button.dataset.orbitCover, name: button.dataset.orbitAlbum }],
  }));
  let sources = [];
  let activeEvent = 0;
  let loadGeneration = 0;
  const orbit = {
    width: 0,
    height: 0,
    dpr: 1,
    angleX: 0,
    angleY: 0,
    targetX: 0,
    targetY: 0,
    pointerX: -100,
    pointerY: -100,
    hovered: null,
    expanded: null,
    tiles: [],
    frame: 0,
    dragX: 0,
    dragY: 0,
  };
  const gridSize = 16;

  function resizeOrbit() {
    const bounds = orbitCanvas.getBoundingClientRect();
    orbit.width = Math.max(1, bounds.width);
    orbit.height = Math.max(1, bounds.height);
    orbit.dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    orbitCanvas.width = Math.round(orbit.width * orbit.dpr);
    orbitCanvas.height = Math.round(orbit.height * orbit.dpr);
    context.setTransform(orbit.dpr, 0, 0, orbit.dpr, 0, 0);
    const radius = Math.max(orbit.width, orbit.height) / 2;
    const tileSize = radius / (gridSize / 6);
    orbit.tiles = [];

    for (let row = 0; row < gridSize; row++) {
      for (let column = 0; column < gridSize; column++) {
        orbit.tiles.push({
          row,
          column,
          albumIndex: (row * gridSize + column) % sources.length,
          xAngle: Math.PI * 2 / gridSize * column,
          yAngle: Math.PI * 2 / gridSize * row,
          x: 0,
          y: 0,
          size: tileSize,
          scale: 0,
          visible: false,
        });
      }
    }
  }

  function getPhotoSource(photo) {
    if (!imageCache.has(photo.id)) {
      const image = new Image();
      image.decoding = "async";
      imageCache.set(photo.id, { ...photo, image, loading: false, loaded: false });
    }
    return imageCache.get(photo.id);
  }

  function loadPhoto(source) {
    if (source.loaded) return Promise.resolve(true);
    if (source.loading) return source.loading;
    source.loading = new Promise((resolve) => {
      const image = source.image;
      image.onload = () => {
        source.loaded = true;
        source.loading = false;
        resolve(true);
      };
      image.onerror = () => {
        source.loading = false;
        source.failed = true;
        resolve(false);
      };
      image.src = source.src || `/gallery-images/${source.id}.jpg`;
    });
    return source.loading;
  }

  async function selectEvent(index) {
    const event = events[index];
    if (!event) return;
    activeEvent = index;
    loadGeneration++;
    const generation = loadGeneration;
    sources = event.photos.map(getPhotoSource);
    resizeOrbit();
    orbit.expanded = null;
    orbit.targetX = 0;
    orbit.targetY = 0;
    albumLink.href = `https://drive.google.com/drive/folders/${event.folder}?usp=sharing`;
    albumLink.setAttribute("aria-label", `Open the full ${event.title} photo album in Google Drive`);
    albumButtons.forEach((button, buttonIndex) => button.setAttribute("aria-pressed", String(buttonIndex === index)));
    albumCount.textContent = `${sources.length} PHOTOS`;
    focusLabel.textContent = `${event.title.toUpperCase()} · LOADING PHOTOS`;
    progress.classList.remove("is-hidden");
    progressLabel.textContent = `LOADING ${event.title.toUpperCase()}`;
    progressPercent.textContent = "0%";
    progressBar.style.width = "0%";
    const priorityIndexes = [...orbit.tiles]
      .filter((tile) => Math.sin(tile.yAngle) <= 0 && Math.cos(tile.xAngle) <= 0)
      .map((tile) => {
        const distance = Math.min(Math.hypot(Math.sin(tile.xAngle), Math.cos(tile.yAngle)), 1);
        return { albumIndex: tile.albumIndex, scale: Math.pow(1 - Math.pow(distance, 3), 3) };
      })
      .sort((first, second) => second.scale - first.scale)
      .map((tile) => tile.albumIndex)
      .filter((index, position, indexes) => indexes.indexOf(index) === position);
    const initialIndexes = priorityIndexes.slice(0, Math.min(16, priorityIndexes.length));
    let loaded = 0;
    let failed = 0;
    let next = 0;
    const worker = async () => {
      while (next < initialIndexes.length && generation === loadGeneration) {
        const source = sources[initialIndexes[next++]];
        if (await loadPhoto(source)) loaded++;
        else failed++;
        if (generation !== loadGeneration) return;
        const percent = Math.round(next / initialIndexes.length * 100);
        progressPercent.textContent = `${percent}%`;
        progressBar.style.width = `${percent}%`;
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (generation !== loadGeneration) return;
    progressLabel.textContent = failed ? `${loaded} OF ${initialIndexes.length} PREVIEWS READY` : `${loaded} PREVIEWS READY`;
    window.setTimeout(() => {
      if (generation === loadGeneration) progress.classList.add("is-hidden");
    }, 250);

  }

  function toggleExpanded(tile) {
    if (!tile || !sources[tile.albumIndex].image.naturalWidth) return;
    orbit.expanded = orbit.expanded?.tile === tile ? null : { tile, started: performance.now() };
  }

  function drawFrame() {
    orbit.frame = requestAnimationFrame(drawFrame);
    orbit.angleX += (orbit.targetX - orbit.angleX) * 0.075;
    orbit.angleY += (orbit.targetY - orbit.angleY) * 0.075;
    context.fillStyle = "#01012a";
    context.fillRect(0, 0, orbit.width, orbit.height);
    context.save();
    context.translate(orbit.width / 2, orbit.height / 2);
    if (!sources.length) {
      context.restore();
      return;
    }
    const radius = Math.max(orbit.width, orbit.height) / 2;
    orbit.hovered = null;
    for (const tile of orbit.tiles) {
      tile.x = Math.sin(tile.xAngle + orbit.angleX) * radius;
      tile.y = Math.cos(tile.yAngle + orbit.angleY) * radius;
      const distance = Math.min(Math.hypot(tile.x, tile.y) / radius, 1);
      tile.scale = Math.pow(1 - Math.pow(distance, 3), 3);
      tile.visible = Math.sin(tile.yAngle + orbit.angleY) <= 0 && Math.cos(tile.xAngle + orbit.angleX) <= 0 && tile.scale > 0.025;
      if (!tile.visible) continue;
      const source = sources[tile.albumIndex];
      if (!source.image.complete && !source.loading && !source.failed) loadPhoto(source);
      if (!source.image.complete || !source.image.naturalWidth) continue;
      const size = tile.size * tile.scale;
      const x = tile.x - size / 2;
      const y = tile.y - size / 2;
      const imageSize = Math.min(source.image.naturalWidth, source.image.naturalHeight);
      const imageX = (source.image.naturalWidth - imageSize) / 2;
      const imageY = (source.image.naturalHeight - imageSize) / 2;

      context.globalAlpha = Math.min(0.94, 0.24 + tile.scale * 0.9);
      context.drawImage(source.image, imageX, imageY, imageSize, imageSize, x, y, size, size);
      context.globalAlpha = 1;
      context.strokeStyle = "rgba(51,222,244,.12)";
      context.lineWidth = 1;
      context.strokeRect(x, y, size, size);

      const pointerX = orbit.pointerX - orbit.width / 2;
      const pointerY = orbit.pointerY - orbit.height / 2;
      if (tile.scale > 0.12 && pointerX >= x && pointerX <= x + size && pointerY >= y && pointerY <= y + size) {
        orbit.hovered = tile;
        context.strokeStyle = "#fe296d";
        context.lineWidth = Math.max(1, tile.scale * 4);
        context.strokeRect(x, y, size, size);
      }
    }

    if (orbit.expanded) {
      const { tile, started } = orbit.expanded;
      const image = sources[tile.albumIndex].image;
      const elapsed = performance.now() - started;
      const imageScale = Math.min(orbit.width * 0.86 / image.naturalWidth, orbit.height * 0.76 / image.naturalHeight);
      const imageWidth = image.naturalWidth * imageScale;
      const imageHeight = image.naturalHeight * imageScale;
      const imageX = -imageWidth / 2;
      const imageY = -imageHeight / 2;
      context.fillStyle = "rgba(1,1,42,.86)";
      context.fillRect(-orbit.width / 2, -orbit.height / 2, orbit.width, orbit.height);
      const stripHeight = Math.max(6, Math.round(imageHeight / 36));
      const reveal = Math.min(elapsed / 650, 1);

      for (let y = 0; y < imageHeight; y += stripHeight) {
        const height = Math.min(stripHeight, imageHeight - y);
        const phase = y / Math.max(imageHeight, 1);
        const jitter = (1 - reveal) * Math.sin(elapsed * 0.025 + phase * 28) * orbit.width * 0.18;
        const offset = jitter + (1 - reveal) * (Math.random() - 0.5) * orbit.width * 0.12;
        context.drawImage(image, 0, y / imageScale, image.naturalWidth, height / imageScale, imageX + offset, imageY + y, imageWidth, height);
      }

      context.strokeStyle = "rgba(51,222,244,.75)";
      context.lineWidth = 1;
      context.strokeRect(imageX, imageY, imageWidth, imageHeight);
    }

    context.restore();
    if (orbit.hovered) {
      const source = sources[orbit.hovered.albumIndex];
      focusLabel.textContent = `${events[activeEvent].title} · ${source.name} · CLICK TO EXPAND`;
      orbitCanvas.style.cursor = "zoom-in";
    } else {
      focusLabel.textContent = events[activeEvent]?.title.toUpperCase() || "MOVE THROUGH THE FRAME";
      orbitCanvas.style.cursor = "grab";
    }
  }

  function setPointer(event) {
    const bounds = orbitCanvas.getBoundingClientRect();
    orbit.pointerX = event.clientX - bounds.left;
    orbit.pointerY = event.clientY - bounds.top;
  }

  orbitCanvas.addEventListener("pointermove", (event) => {
    setPointer(event);
    if (event.buttons) {
      orbit.targetX += (event.clientX - orbit.dragX) * 0.006;
      orbit.targetY += (event.clientY - orbit.dragY) * 0.006;
    }
    orbit.dragX = event.clientX;
    orbit.dragY = event.clientY;
  });
  orbitCanvas.addEventListener("pointerleave", () => {
    orbit.pointerX = -100;
    orbit.pointerY = -100;
  });
  orbitCanvas.addEventListener("pointerdown", (event) => {
    orbit.dragX = event.clientX;
    orbit.dragY = event.clientY;
    orbitCanvas.setPointerCapture(event.pointerId);
  });
  orbitCanvas.addEventListener("click", () => {
    if (orbit.hovered) toggleExpanded(orbit.hovered);
  });
  window.addEventListener("wheel", (event) => {
    event.preventDefault();
    orbit.angleX += event.deltaX * 0.0005;
    orbit.angleY += event.deltaY * 0.0005;
    orbit.targetX = orbit.angleX;
    orbit.targetY = orbit.angleY;
  }, { passive: false });
  orbitCanvas.addEventListener("keydown", (event) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      orbit.pointerX = orbit.width / 2;
      orbit.pointerY = orbit.height / 2;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") orbit.targetX += event.key === "ArrowRight" ? 0.32 : -0.32;
      if (event.key === "ArrowUp" || event.key === "ArrowDown") orbit.targetY += event.key === "ArrowDown" ? 0.32 : -0.32;
    }
    if (event.key === "Enter" && orbit.hovered) toggleExpanded(orbit.hovered);
  });
  albumButtons.forEach((button, index) => button.addEventListener("click", () => selectEvent(index)));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") orbit.expanded = null;
  });
  window.addEventListener("resize", resizeOrbit);

  resizeOrbit();
  drawFrame();
  fetch("/gallery-manifest.json")
    .then((response) => {
      if (!response.ok) throw new Error("Gallery manifest unavailable.");
      return response.json();
    })
    .then((manifest) => {
      events = albumButtons.map((button) => manifest.find((event) => event.folder === button.dataset.orbitFolder)).filter(Boolean);
      if (events.length !== albumButtons.length) throw new Error("Gallery manifest is incomplete.");
      selectEvent(0);
    })
    .catch(() => {
      selectEvent(0);
      progressLabel.textContent = "USING EVENT COVER PHOTO";
    });
}
