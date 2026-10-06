import { NextResponse } from "next/server";

/** Parses an optional integer query param; returns undefined when absent, NaN-safe. */
export function intParam(params: URLSearchParams, name: string): number | undefined {
  const value = params.get(name);
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isSafeInteger(n) ? n : undefined;
}

export const badRequest = (error: string) => NextResponse.json({ error }, { status: 400 });
