const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const binSource = path.join(root, "bin");
const binDestination = path.join(publicDir, "bin");
const excludedBinPaths = new Set(["admins.json", "build-theme-compat.js", "theme-engine"]);

function copyDirectory(source, destination, filter) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true, filter });
}

fs.mkdirSync(publicDir, { recursive: true });
copyDirectory(binSource, binDestination, (sourcePath) => {
  const relativePath = path.relative(binSource, sourcePath).split(path.sep).join("/");
  return !excludedBinPaths.has(relativePath);
});
copyDirectory(path.join(root, "community"), path.join(publicDir, "community"));
copyDirectory(path.join(root, "office-addin"), path.join(publicDir, "office-addin"));

for (const file of ["index.html", "favicon.png", "files.json", "manifest.json", "offline.html", "installer.html", "service-worker.js"]) {
  fs.copyFileSync(path.join(root, file), path.join(publicDir, file));
}

console.log("Prepared Next.js public assets.");
