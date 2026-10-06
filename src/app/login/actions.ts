"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSession } from "@/lib/session";

export type LoginState = { error?: string; username?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  let token: string;
  try {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return { error: "Неверный логин или пароль", username };
    }
    token = await signSession({ userId: user.id, username: user.username });
  } catch (err) {
    // Misconfiguration (DB unreachable, missing tables, no SESSION_SECRET): log it instead of
    // crashing the page, details are in the server logs and /api/health.
    console.error("Login failed:", err);
    return { error: "Ошибка сервера. Подробности в логах и на /api/health", username };
  }

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}
