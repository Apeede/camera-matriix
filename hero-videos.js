(() => {
  const hero = document.querySelector("[data-video-hero]");
  if (!hero) return;
  const video = hero.querySelector(".hero-background-video");
  const titleFirst = hero.querySelector("[data-video-title-first]");
  const titleSecond = hero.querySelector("[data-video-title-second]");
  const kicker = hero.querySelector("[data-video-kicker]");
  const subtitle = hero.querySelector("[data-video-subtitle]");
  const sources = (hero.dataset.videoSources || "").split("|").filter(Boolean);
  if (!video || !titleFirst || !titleSecond || !kicker || !subtitle || !sources.length) return;

  const messages = hero.classList.contains("buy-video-hero") ? [
    { kicker: "CAMERA MATRIX · GEAR FOR SALE", first: "Camera gear for", second: "your next story.", subtitle: "Explore cameras and production equipment selected for creators in Kampala." },
    { kicker: "TOOLS FOR BOLD IDEAS", first: "Find your next", second: "creative edge.", subtitle: "Compare cameras and gear from Camera Matrix, with specifications and UGX prices in one place." },
    { kicker: "GOOD GEAR, BUILT FOR YOUR WORK", first: "Invest in what", second: "you want to make.", subtitle: "Browse professional cameras and production gear available to buy in Kampala." },
    { kicker: "THE NEXT CHAPTER STARTS HERE", first: "Your vision.", second: "Your gear.", subtitle: "Explore gear for sale and contact Camera Matrix about current stock and package details." },
  ] : [
    { kicker: "GOOD GEAR. GREAT STORIES.", first: "Camera gear rentals", second: "for every story.", subtitle: "Find the cameras, lenses and production gear that help you bring your next idea to life in Kampala." },
    { kicker: "MADE FOR YOUR NEXT BIG IDEA", first: "Create more.", second: "Get it in focus.", subtitle: "Build a kit for your next shoot with cameras, lenses and production tools from Camera Matrix." },
    { kicker: "YOUR CREATIVE WORK STARTS HERE", first: "From first frame", second: "to final cut.", subtitle: "Get the gear and support your production needs, from the first setup to the final scene." },
    { kicker: "GOOD GEAR, RIGHT HERE IN KAMPALA", first: "Make the moment", second: "mean more.", subtitle: "Explore camera and production gear rentals for films, events, portraits and everything in between." },
  ];

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const failedSources = new Set();
  let sourceIndex = 0;

  const showMessage = (index) => {
    const message = messages[index % messages.length];
    kicker.textContent = message.kicker;
    titleFirst.textContent = message.first;
    titleSecond.textContent = message.second;
    subtitle.textContent = message.subtitle;
    hero.classList.remove("hero-copy-refresh");
    void titleFirst.offsetWidth;
    hero.classList.add("hero-copy-refresh");
  };

  const play = async () => {
    if (reducedMotion.matches || document.hidden) return;
    try {
      await video.play();
      hero.classList.remove("is-video-unavailable");
    } catch {
      hero.classList.add("is-video-unavailable");
    }
  };

  const loadSource = (nextIndex) => {
    sourceIndex = (nextIndex + sources.length) % sources.length;
    showMessage(sourceIndex);
    video.pause();
    video.src = sources[sourceIndex];
    video.load();
    play();
  };

  video.addEventListener("ended", () => {
    failedSources.clear();
    loadSource(sourceIndex + 1);
  });

  video.addEventListener("error", () => {
    failedSources.add(sourceIndex);
    if (failedSources.size >= sources.length) {
      hero.classList.add("is-video-unavailable");
      return;
    }
    let nextIndex = (sourceIndex + 1) % sources.length;
    while (failedSources.has(nextIndex)) nextIndex = (nextIndex + 1) % sources.length;
    loadSource(nextIndex);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) video.pause();
    else play();
  });
  reducedMotion.addEventListener("change", (event) => {
    if (event.matches) video.pause();
    else play();
  });

  video.preload = "auto";
  loadSource(0);
  if (reducedMotion.matches) hero.classList.add("is-video-unavailable");
})();
