import { createClient } from 'npm:@supabase/supabase-js@2.108.2';
import { synchronizeAccess } from './synchronize.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'POST only.' });
  const authorization = req.headers.get('Authorization');
  if (!authorization) return json(401, { error: 'Missing authorization.' });
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  if (
    !body ||
    typeof body.user_id !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(body.user_id) ||
    (body.retry !== true && typeof body.active !== 'boolean')
  )
    return json(400, { error: 'Expected an account and status.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } =
    body.retry === true
      ? await asCaller.rpc('retry_user_access_sync', { p_id: body.user_id })
      : await asCaller.rpc('request_user_access', {
          p_id: body.user_id,
          p_active: body.active,
          p_fields: body.fields ?? {},
        });
  if (error) return json(403, { error: error.message });

  // The owner-authorized RPC commits access restrictions and durable work.
  // Auth outages leave that work pending; never undo a deactivation on error.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000) }),
    },
  });
  try {
    const synced = await synchronizeAccess(admin, body.user_id);
    return json(200, { ok: true, pending: !synced });
  } catch {
    return json(200, { ok: true, pending: true });
  }
});
