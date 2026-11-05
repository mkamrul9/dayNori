/** Local synthetic identity fixture + real PostgreSQL API + actual Next application. Not provider evidence. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { buildServer } from '../apps/api/dist/server.js';
import { createApiClient } from '../packages/api-client/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = path.join(root, 'artifacts/local/phase80');
fs.mkdirSync(local, { recursive: true });
const port = Number(process.env.DAYNORI_PHASE80_WEB_PORT || 3108);
const issuer = 'http://127.0.0.1:54321/auth/v1';
const pair = await generateKeyPair('RS256');
const publicKey = {
  ...(await exportJWK(pair.publicKey)),
  kid: 'phase80-local',
  alg: 'RS256',
  use: 'sig',
};
const sessions = new Map();
const accounts = ['a', 'b'].map((suffix) => ({
  id: crypto.randomUUID(),
  email: `phase80-${suffix}-${Date.now()}@example.test`,
  password: crypto.randomBytes(24).toString('hex'),
}));

async function session(account) {
  const access_token = await new SignJWT({
    role: 'authenticated',
    email: account.email,
    aal: 'aal1',
    session_id: crypto.randomUUID(),
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'phase80-local' })
    .setSubject(account.id)
    .setIssuer(issuer)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('8h')
    .sign(pair.privateKey);
  const refresh_token = crypto.randomBytes(32).toString('hex');
  const value = {
    access_token,
    refresh_token,
    token_type: 'bearer',
    expires_in: 28800,
    user: {
      id: account.id,
      email: account.email,
      user_metadata: { display_name: 'Phase 80 synthetic account' },
    },
  };
  sessions.set(access_token, { account, value });
  sessions.set(refresh_token, { account, value });
  return value;
}

const auth = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8192) {
      res.writeHead(413);
      res.end('{}');
      return;
    }
  }
  let input;
  try {
    input = body ? JSON.parse(body) : {};
  } catch {
    res.writeHead(400);
    res.end('{}');
    return;
  }
  const url = new URL(req.url, issuer);
  if (url.pathname.endsWith('/jwks.json')) {
    res.end(JSON.stringify({ keys: [publicKey] }));
    return;
  }
  if (url.pathname.endsWith('/token')) {
    const account =
      url.searchParams.get('grant_type') === 'refresh_token'
        ? sessions.get(input.refresh_token)?.account
        : accounts.find((a) => a.email === input.email && a.password === input.password);
    if (!account) {
      res.writeHead(400);
      res.end('{"error_description":"Invalid synthetic account"}');
      return;
    }
    res.end(JSON.stringify(await session(account)));
    return;
  }
  const token = req.headers.authorization?.replace(/^Bearer /i, '');
  if (url.pathname.endsWith('/user') && sessions.has(token)) {
    res.end(JSON.stringify(sessions.get(token).value.user));
    return;
  }
  if (url.pathname.endsWith('/logout')) {
    sessions.delete(token);
    res.end('{}');
    return;
  }
  res.writeHead(401);
  res.end('{"error":"unauthorized"}');
});
await new Promise((resolve) => auth.listen(54321, '127.0.0.1', resolve));
const api = buildServer({
  jwtConfig: { issuer, audience: 'authenticated', localJwks: { keys: [publicKey] } },
  rateLimitOptions: { maxRequests: 10000, windowMs: 60_000 },
});
await api.listen({ host: '127.0.0.1', port: 3001 });
for (const account of accounts) {
  const issued = await session(account);
  const client = createApiClient({ baseUrl: 'http://127.0.0.1:3001', token: issued.access_token });
  const provision = await client.provisionPersonalWorkspace({
    displayName: 'Phase 80 synthetic',
    timeZone: 'Asia/Dhaka',
  });
  account.workspaceId = provision.data.workspace.id;
  const prefs = await client.getUserPreferences();
  await client.updateUserPreferences({
    expectedRevision: prefs.data.revision,
    preferences: {
      onboarding: {
        version: 1,
        step: 'completed',
        completed: false,
        skipped: true,
        skippedAt: new Date().toISOString(),
        selectedInterests: [],
        createdSampleItemIds: [],
      },
    },
  });
}
// Synthetic credentials stay in an ignored test directory and are never logged.
fs.writeFileSync(
  path.join(local, 'accounts.json'),
  JSON.stringify({ accounts, webPort: port, authMethod: 'local-synthetic-provider' })
);
const next = spawn(
  process.execPath,
  [
    path.join(root, 'apps/web/node_modules/next/dist/bin/next'),
    process.argv.includes('--production') ? 'start' : 'dev',
    '-p',
    String(port),
  ],
  {
    cwd: path.join(root, 'apps/web'),
    env: {
      ...process.env,
      SUPABASE_AUTH_URL: 'http://127.0.0.1:54321',
      DAYNORI_API_URL: 'http://127.0.0.1:3001',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }
);
const log = fs.createWriteStream(path.join(local, 'next-server.log'));
next.stdout.pipe(log);
next.stderr.pipe(log);
console.log(
  JSON.stringify({
    phase: 80,
    webPort: port,
    apiPort: 3001,
    authMethod: 'local-synthetic-provider',
    database: 'configured-local-runtime',
    ready: true,
  })
);
async function close() {
  next.kill();
  await api.close();
  auth.close();
  log.end();
  process.exit(0);
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
next.on('exit', (code) => {
  if (code) {
    console.error('Next exited:', code);
    void close();
  }
});
