import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-static";

const sourceHtml = readFileSync(join(process.cwd(), "index.html"), "utf8");
const bodyMatch = sourceHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
if (!bodyMatch) throw new Error("Could not locate the Ada application body in index.html.");

const markup = bodyMatch[1].replace(/<script\b[\s\S]*?<\/script\s*>/gi, "");

export default function HomePage() {
  return (
    <div
      id="adaNextLegacyShell"
      style={{ display: "contents" }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
