(() => {
  const SLOW_LOAD_MS = 4000;
  const dashboard = document.getElementById("adaThemeDashboard");
  const status = document.getElementById("adaThemeStatus");
  const warning = document.getElementById("adaThemeLoadWarning");
  const retryButton = document.getElementById("adaThemeRetry");
  const refreshButton = document.getElementById("adaThemeRefresh");
  const skipButton = document.getElementById("adaThemeSkip");
  let loadingPromise = null;
  let loadingTimer = null;
  let pendingScript = null;
  let rejectPendingScript = null;
  let attemptId = 0;
  let skipped = false;

  function setStatus(message, isError = false) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function showWarning(message) {
    if (warning) warning.hidden = false;
    if (message) setStatus(message, true);
  }

  function hideWarning() {
    if (warning) warning.hidden = true;
  }

  function loadScript(source, isReady, currentAttempt) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = source;
      script.async = false;
      pendingScript = script;
      rejectPendingScript = reject;
      script.onload = () => {
        if (pendingScript === script) pendingScript = null;
        if (rejectPendingScript === reject) rejectPendingScript = null;
        if (currentAttempt !== attemptId) {
          resolve(false);
          return;
        }
        if (isReady()) resolve(true);
        else reject(new Error(`Theme asset loaded without initializing: ${source}`));
      };
      script.onerror = () => {
        if (pendingScript === script) pendingScript = null;
        if (rejectPendingScript === reject) rejectPendingScript = null;
        script.remove();
        reject(new Error(`Could not load theme asset: ${source}`));
      };
      document.head.appendChild(script);
    });
  }

  function cancelLoading() {
    attemptId += 1;
    if (loadingTimer !== null) window.clearTimeout(loadingTimer);
    loadingTimer = null;
    const script = pendingScript;
    const reject = rejectPendingScript;
    pendingScript = null;
    rejectPendingScript = null;
    loadingPromise = null;
    if (script) script.remove();
    if (reject) reject(new Error("Theme loading was cancelled."));
  }

  function loadThemeAssets() {
    if (window.AdaThemeCompat && window.__adaThemeRuntimeReady) return Promise.resolve(true);
    if (loadingPromise) return loadingPromise;

    const currentAttempt = ++attemptId;
    hideWarning();
    setStatus("Loading theme tools…");
    loadingTimer = window.setTimeout(() => {
      if (currentAttempt === attemptId) {
        showWarning("Theme tools are taking longer than usual. A slow or interrupted connection may be delaying them.");
      }
    }, SLOW_LOAD_MS);

    loadingPromise = (async () => {
      try {
        if (!window.AdaThemeCompat) {
          const compatibilityLoaded = await loadScript(
            "/bin/theme-compat.js",
            () => Boolean(window.AdaThemeCompat),
            currentAttempt
          );
          if (!compatibilityLoaded) return false;
        }
        if (currentAttempt !== attemptId) return false;

        if (!window.__adaThemeRuntimeReady) {
          const runtimeLoaded = await loadScript(
            "/bin/theme-runtime.js",
            () => Boolean(window.__adaThemeRuntimeReady),
            currentAttempt
          );
          if (!runtimeLoaded) return false;
        }
        if (currentAttempt !== attemptId) return false;
        hideWarning();
        return true;
      } catch (error) {
        if (currentAttempt === attemptId) {
          showWarning(error.message);
          console.error(error);
        }
        return false;
      } finally {
        if (currentAttempt === attemptId) {
          if (loadingTimer !== null) window.clearTimeout(loadingTimer);
          loadingTimer = null;
          loadingPromise = null;
        }
      }
    })();

    return loadingPromise;
  }

  function openDashboard() {
    if (skipped) return;
    if (dashboard) {
      dashboard.classList.add("active");
      dashboard.setAttribute("aria-hidden", "false");
    }

    loadThemeAssets().then((loaded) => {
      if (!loaded || skipped) return;
      const openLoadedDashboard = window.openThemeDashboard;
      if (openLoadedDashboard !== openDashboard) openLoadedDashboard();
    });
  }

  function skipThemes() {
    skipped = true;
    cancelLoading();
    hideWarning();
    document.querySelectorAll("[data-ada-theme-launcher]").forEach((launcher) => {
      launcher.hidden = true;
    });
    if (dashboard) {
      dashboard.classList.remove("active");
      dashboard.setAttribute("aria-hidden", "true");
    }
  }

  window.openThemeDashboard = openDashboard;

  retryButton?.addEventListener("click", () => {
    cancelLoading();
    openDashboard();
  });
  refreshButton?.addEventListener("click", () => window.location.reload());
  skipButton?.addEventListener("click", skipThemes);
})();
