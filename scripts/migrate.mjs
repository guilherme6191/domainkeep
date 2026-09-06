// Runs supabase/migrations/*.sql in name order over DIRECT_URL; the pooled
// connection cannot run this DDL. Migrations are written to be re-runnable.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

function loadEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
        .map((line) => {
          const at = line.indexOf("=");
          return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
        }),
    );
  } catch {
    return {};
  }
}

const env = { ...loadEnv(".env.local"), ...process.env };
const url = env.DIRECT_URL;

if (!url) {
  console.error("Set DIRECT_URL in .env.local before running migrations.");
  process.exit(1);
}

// Re-runs emit "already exists" notices; silence them.
const sql = postgres(url, {
  prepare: false,
  ssl: "require",
  max: 1,
  onnotice: () => {},
});
const dir = "supabase/migrations";

try {
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    await sql.unsafe(readFileSync(join(dir, file), "utf8")).simple();
    console.log(`applied ${file}`);
  }
} finally {
  await sql.end();
}
