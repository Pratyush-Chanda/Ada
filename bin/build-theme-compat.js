const esbuild = require("esbuild");

esbuild.buildSync({
  entryPoints: ["bin/theme-engine/theme-compat.js"],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "AdaThemeCompat",
  target: ["es2020"],
  outfile: "bin/theme-compat.js",
  minify: true,
  legalComments: "inline"
});

console.log("Built bin/theme-compat.js");
