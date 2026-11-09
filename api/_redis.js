import { Redis } from '@upstash/redis';

/* Reads the env vars Vercel's Upstash integration actually injected.
   KV_RWST_API_URL is unusual — if that's what's on the dashboard, use it.
   The fallback to KV_REST_API_URL keeps it working if the name is fixed later. */
const url   = process.env.KV_RWST_API_URL || process.env.KV_REST_API_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.KV_RWST_API_TOKEN;

if (!url || !token) {
  console.error('Redis env vars missing. url=' + (url ? 'set' : 'MISSING') +
                ' token=' + (token ? 'set' : 'MISSING'));
}

export const redis = new Redis({ url, token });
