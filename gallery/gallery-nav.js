const siteNavigation = document.querySelector(".site-navigation");
siteNavigation?.addEventListener("click", (event) => event.stopPropagation());
siteNavigation?.addEventListener("mousemove", (event) => event.stopPropagation());
siteNavigation?.addEventListener("touchstart", (event) => event.stopPropagation());
siteNavigation?.addEventListener("touchmove", (event) => event.stopPropagation());
