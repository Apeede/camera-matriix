(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const revealSelector = ".product-card, .sale-card, .steps > article, .seo-product, .seo-main > h1, .seo-main > p, .seo-main > h2, .seo-main > ul, .seo-main > ol";
  const markForReveal = (root = document) => {
    root.querySelectorAll?.(revealSelector).forEach((element, index) => {
      if (element.classList.contains("scroll-reveal")) return;
      element.classList.add("scroll-reveal");
      element.style.setProperty("--reveal-order", String(index % 6));
      observer?.observe(element);
    });
  };
  let observer;
  if ("IntersectionObserver" in window && !reducedMotion.matches) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.08, rootMargin: "0px 0px -36px 0px" });
  }
  markForReveal();
  if (observer) {
    const main = document.querySelector("main");
    if (main) new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.matches?.(revealSelector)) {
          node.classList.add("scroll-reveal");
          observer.observe(node);
        }
        markForReveal(node);
      }
    }))).observe(main, { childList: true, subtree: true });
  } else {
    document.querySelectorAll(revealSelector).forEach((element) => element.classList.add("is-revealed"));
  }

  const progress = document.createElement("div");
  progress.className = "page-scroll-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.append(progress);

  const backToTop = document.createElement("button");
  backToTop.className = "back-to-top";
  backToTop.type = "button";
  backToTop.setAttribute("aria-label", "Scroll to top");
  backToTop.innerHTML = '<span aria-hidden="true">↑</span>';
  document.body.append(backToTop);
  backToTop.addEventListener("click", () => {
    if (reducedMotion.matches) window.scrollTo(0, 0);
    else window.scrollTo({ top: 0, behavior: "smooth" });
  });

  let scheduled = false;
  const updateScrollUI = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = max > 0 ? window.scrollY / max : 0;
    progress.style.transform = `scaleX(${Math.min(1, Math.max(0, ratio))})`;
    backToTop.classList.toggle("is-visible", window.scrollY > 560);
    scheduled = false;
  };
  window.addEventListener("scroll", () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(updateScrollUI);
  }, { passive: true });
  window.addEventListener("resize", updateScrollUI, { passive: true });
  updateScrollUI();
})();
