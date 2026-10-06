/**
 * Creates a user or resets their password.
 *
 *   npm run user:create -- <username> <password>
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { db } from "../src/db";
import { users } from "../src/db/schema";

async function main() {
  const [username, password] = process.argv.slice(2);
  if (!username || !password) {
    console.error("Usage: npm run user:create -- <username> <password>");
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .insert(users)
    .values({ username, passwordHash })
    .onConflictDoUpdate({ target: users.username, set: { passwordHash } });
  console.log(`User "${username}" saved`);
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
