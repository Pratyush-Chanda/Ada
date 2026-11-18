import Script from "next/script";

export const metadata = {
  title: "Ada",
  description: "A familiar workspace for your documents.",
  manifest: "/manifest.json",
  icons: { icon: "/favicon.png" }
};

const themeBootstrap = `(() => {
  let preference = "system";
  try { preference = localStorage.getItem("ada-theme-mode") || "system"; } catch (_) {}
  if (!["system", "light", "dark"].includes(preference)) preference = "system";
  const mode = preference === "system"
    ? (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : preference;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.dataset.themeMode = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = mode === "dark" ? "#131314" : "#f8f9fa";
})();`;

const mathJaxBootstrap = `window.MathJax = {
  tex: {
    inlineMath: [["\\\\(", "\\\\)"]],
    displayMath: [["\\\\[", "\\\\]"]],
    packages: {"[+]": ["ams", "boldsymbol"]}
  },
  svg: { fontCache: "global" },
  startup: { typeset: false },
  options: { ignoreHtmlClass: "tikz-source" }
};`;

const appScripts = [
  "/bin/modern-auth.js",
  "/bin/gh-proxy.js",
  "/bin/theme-loader.js",
  "https://cdn.jsdelivr.net/npm/feather-icons@4.29.2/dist/feather.min.js",
  "/bin/file-search.js?v=13",
  "/bin/app.js?v=25",
  "/bin/markdown.js?v=19",
  "/bin/admin-terminal.js",
  "/bin/auth.js?v=19",
  "/bin/upload.js?v=19",
  "/bin/mobile.js?v=23"
];

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="recaptcha-sitekey" content="6LcxfwktAAAAAFr3FmBO5LHM3m_j33369aSsOsOf" />
        <meta name="theme-color" content="#f8f9fa" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="/bin/style.css?v=24" />
        <Script id="ada-theme-bootstrap" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
        <Script id="ada-mathjax-config" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: mathJaxBootstrap }} />
        <Script src="/bin/vendor-loader.js" strategy="beforeInteractive" />
        {appScripts.map((src) => <Script key={src} src={src} strategy="afterInteractive" />)}
        <Script
          src="https://www.google.com/recaptcha/api.js?render=6LcxfwktAAAAAFr3FmBO5LHM3m_j33369aSsOsOf"
          strategy="lazyOnload"
        />
        <Script id="ada-feather-init" strategy="afterInteractive" dangerouslySetInnerHTML={{
          __html: `const replaceAdaIcons = () => window.feather?.replace({ "stroke-width": 1.8 });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", replaceAdaIcons, { once: true });
else replaceAdaIcons();`
        }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
