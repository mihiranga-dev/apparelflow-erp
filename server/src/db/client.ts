import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env";
import * as schema from "./schema";

/**
 * Supabase's session pooler manages the actual Postgres connections — our
 * pool just holds a handful of TCP connections to the pooler.
 *
 * `max: 5` (was 5, stays 5) works fine in serverless: each warm function
 * instance keeps at most 5 connections open, and the pooler multiplexes
 * those into far fewer real Postgres connections. Supabase's free-tier
 * pooler cap is 60, which comfortably absorbs a dozen concurrent instances.
 *
 * `idle_timeout: 20` closes idle connections after 20 seconds, so a function
 * that goes cold releases its pool without waiting for a 60s default.
 */
const queryClient = postgres(env.DATABASE_URL, {
  prepare: false,
  max: 5,
  idle_timeout: 20,
});

export const db = drizzle(queryClient, { schema });
