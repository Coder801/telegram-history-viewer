"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <main className="flex min-h-dvh items-center justify-center bg-tg-bg px-4">
      <form action={action} className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-tg-panel p-8 shadow-xl">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-tg-accent text-4xl">💬</div>
        <h1 className="text-center text-xl font-semibold text-tg-text">Chat History</h1>
        <input
          name="username"
          defaultValue={state.username}
          placeholder="Логин"
          autoComplete="username"
          required
          className="rounded-xl border border-tg-border bg-tg-bg px-4 py-3 text-tg-text outline-none focus:border-tg-accent"
        />
        <input
          name="password"
          type="password"
          placeholder="Пароль"
          autoComplete="current-password"
          required
          className="rounded-xl border border-tg-border bg-tg-bg px-4 py-3 text-tg-text outline-none focus:border-tg-accent"
        />
        {state.error && <p className="text-sm text-red-400">{state.error}</p>}
        <button
          disabled={pending}
          className="rounded-xl bg-tg-accent py-3 font-medium text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {pending ? "Вход…" : "Войти"}
        </button>
      </form>
    </main>
  );
}
