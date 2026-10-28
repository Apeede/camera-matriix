const siteNavigation = document.querySelector(".site-navigation");
siteNavigation?.addEventListener("click", (event) => event.stopPropagation());
siteNavigation?.addEventListener("mousemove", (event) => event.stopPropagation());
siteNavigation?.addEventListener("touchstart", (event) => event.stopPropagation());
siteNavigation?.addEventListener("touchmove", (event) => event.stopPropagation());

const albumLinks = document.querySelector(".album-links");
albumLinks?.addEventListener("click", (event) => event.stopPropagation());
albumLinks?.addEventListener("wheel", (event) => event.stopPropagation());
albumLinks?.addEventListener("mousemove", (event) => event.stopPropagation());
albumLinks?.addEventListener("touchstart", (event) => event.stopPropagation());
albumLinks?.addEventListener("touchmove", (event) => event.stopPropagation());

document.querySelector(".academy-whatsapp-float")?.addEventListener("click", (event) => event.stopPropagation());
