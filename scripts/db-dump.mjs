// Dumps $DATABASE_URL (from the environment or .env) into chat_history.dump:
//   npm run db:dump [-- out.dump]
// npm scripts don't load .env themselves, so a bare `pg_dump "$DATABASE_URL"` would
// silently fall back to the local default socket.
import "dotenv/config";
import { spawnSync } from "node:child_process";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (neither in the environment nor in .env)");
  process.exit(1);
}
const out = process.argv[2] ?? "chat_history.dump";
const { host, pathname } = new URL(url);
console.log(`Dumping ${host}${pathname} -> ${out}`);

const res = spawnSync("pg_dump", ["--no-owner", "--no-acl", "-Fc", "-f", out, url], { stdio: "inherit" });
if (res.error) console.error(`Failed to run pg_dump: ${res.error.message}`);
process.exit(res.status ?? 1);
