// Restores a dump into the given database (e.g. Railway's public URL):
//   npm run db:restore -- "<target database url>" [chat_history.dump]
// Existing objects in the target are dropped and recreated.
import { spawnSync } from "node:child_process";

const [target, file = "chat_history.dump"] = process.argv.slice(2);
if (!target) {
  console.error('Usage: npm run db:restore -- "<target database url>" [chat_history.dump]');
  process.exit(1);
}
const { host, pathname } = new URL(target);
console.log(`Restoring ${file} -> ${host}${pathname}`);

const res = spawnSync(
  "pg_restore",
  ["--no-owner", "--no-acl", "--clean", "--if-exists", "--single-transaction", "-d", target, file],
  { stdio: "inherit" },
);
if (res.error) console.error(`Failed to run pg_restore: ${res.error.message}`);
process.exit(res.status ?? 1);
