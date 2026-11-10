(() => {
  const PDF_WORKER_URL = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  function icon(name) {
    const source = window.feather?.icons?.[name];
    return source
      ? source.toSvg({ "aria-hidden": "true", "stroke-width": 1.8 })
      : "";
  }

  async function render(container, bytes, options = {}) {
    if (!window.pdfjsLib) throw new Error("Mozilla PDF.js did not load");
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;

    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
    const viewer = document.createElement("section");
    viewer.className = "ada-pdf-viewer";
    viewer.setAttribute("aria-label", "PDF document viewer");

    const toolbar = document.createElement("div");
    toolbar.className = "ada-pdf-toolbar";
    toolbar.setAttribute("role", "toolbar");
    const previous = document.createElement("button");
    previous.type = "button";
    previous.innerHTML = icon("chevron-left");
    previous.setAttribute("aria-label", "Previous page");
    const pageLabel = document.createElement("span");
    pageLabel.setAttribute("aria-live", "polite");
    const next = document.createElement("button");
    next.type = "button";
    next.innerHTML = icon("chevron-right");
    next.setAttribute("aria-label", "Next page");
    const zoomOut = document.createElement("button");
    zoomOut.type = "button";
    zoomOut.textContent = "−";
    zoomOut.setAttribute("aria-label", "Zoom out");
    const zoomLabel = document.createElement("span");
    zoomLabel.textContent = "100%";
    const zoomIn = document.createElement("button");
    zoomIn.type = "button";
    zoomIn.textContent = "+";
    zoomIn.setAttribute("aria-label", "Zoom in");
    toolbar.append(previous, pageLabel, next, zoomOut, zoomLabel, zoomIn);

    const pages = document.createElement("div");
    pages.className = "ada-pdf-pages";
    pages.setAttribute("role", "document");
    pages.setAttribute("aria-label", `${pdf.numPages} page PDF`);
    viewer.append(toolbar, pages);
    container.replaceChildren(viewer);

    const requestedPage = Number.parseInt(options.initialPage, 10);
    let currentPage = Number.isInteger(requestedPage)
      ? Math.max(1, Math.min(pdf.numPages, requestedPage))
      : 1;
    let zoom = 1;
    let pendingFrame = 0;
    const records = [];
    const updateControls = () => {
      pageLabel.textContent = `${currentPage} / ${pdf.numPages}`;
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
      previous.disabled = currentPage <= 1;
      next.disabled = currentPage >= pdf.numPages;
    };

    const renderPage = async (pageNumber) => {
      const record = records[pageNumber - 1];
      if (!record || record.rendered || record.rendering) return;
      record.rendering = true;
      try {
        const page = await pdf.getPage(pageNumber);
        const unscaled = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(240, pages.clientWidth - 44);
        const fitScale = Math.min(1.65, availableWidth / unscaled.width);
        const viewport = page.getViewport({ scale: fitScale * zoom });
        const outputScale = Math.max(1, window.devicePixelRatio || 1);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.ceil(viewport.width * outputScale);
        canvas.height = Math.ceil(viewport.height * outputScale);
        canvas.style.width = `${Math.ceil(viewport.width)}px`;
        canvas.style.height = `${Math.ceil(viewport.height)}px`;
        record.element.replaceChildren(canvas);
        await page.render({
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
        }).promise;
        record.rendered = true;
      } finally {
        record.rendering = false;
      }
    };

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const element = document.createElement("div");
      element.className = "ada-pdf-page";
      element.dataset.pageNumber = String(pageNumber);
      element.setAttribute("aria-label", `Page ${pageNumber}`);
      pages.appendChild(element);
      records.push({ element, rendered: false, rendering: false });
    }

    let observer;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pageNumber = Number(entry.target.dataset.pageNumber);
          currentPage = pageNumber;
          updateControls();
          renderPage(pageNumber).catch((error) => {
            entry.target.textContent = `Could not render page ${pageNumber}: ${error.message}`;
          });
        }
      }, { root: pages, rootMargin: "320px 0px", threshold: 0.01 });
      records.forEach((record) => observer.observe(record.element));
    }

    const goToPage = (pageNumber) => {
      currentPage = Math.max(1, Math.min(pdf.numPages, pageNumber));
      updateControls();
      const record = records[currentPage - 1];
      record.element.scrollIntoView({ behavior: "smooth", block: "start" });
      renderPage(currentPage).catch((error) => {
        record.element.textContent = `Could not render page ${currentPage}: ${error.message}`;
      });
    };

    previous.addEventListener("click", () => goToPage(currentPage - 1));
    next.addEventListener("click", () => goToPage(currentPage + 1));
    const setZoom = (value) => {
      zoom = Math.max(0.6, Math.min(2.5, value));
      const rerender = records.filter((record) => record.rendered);
      for (const record of records) {
        if (record.rendered) {
          record.rendered = false;
          record.element.replaceChildren();
        }
      }
      updateControls();
      Promise.all(rerender.map((record) => renderPage(Number(record.element.dataset.pageNumber)))).catch((error) => {
        records[currentPage - 1].element.textContent = `Could not render page ${currentPage}: ${error.message}`;
      });
      if (!rerender.length) renderPage(currentPage).catch((error) => {
        records[currentPage - 1].element.textContent = `Could not render page ${currentPage}: ${error.message}`;
      });
    };
    zoomOut.addEventListener("click", () => setZoom(zoom - 0.15));
    zoomIn.addEventListener("click", () => setZoom(zoom + 0.15));

    pages.addEventListener("scroll", () => {
      if (pendingFrame) cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(() => {
        const top = pages.getBoundingClientRect().top;
        const midpoint = top + pages.clientHeight * 0.35;
        let nearest = 1;
        let distance = Infinity;
        for (const record of records) {
          const rect = record.element.getBoundingClientRect();
          const nextDistance = Math.abs(rect.top - midpoint);
          if (nextDistance < distance) {
            distance = nextDistance;
            nearest = Number(record.element.dataset.pageNumber);
          }
        }
        currentPage = nearest;
        updateControls();
      });
    }, { passive: true });

    updateControls();
    records[currentPage - 1].element.scrollIntoView({ behavior: "auto", block: "start" });
    await renderPage(currentPage);
  }

  window.AdaPdfViewer = { render };
})();
