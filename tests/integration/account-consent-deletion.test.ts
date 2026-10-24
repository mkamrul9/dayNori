import { expect, it } from 'vitest';
import {
  createAdminPool,
  createRuntimePool,
  withUserContext,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';

it('permits consent cleanup only for the current user, retaining cross-account RLS protection', async () => {
  const admin = createAdminPool();
  const runtime = createRuntimePool();
  const owner = crypto.randomUUID();
  const other = crypto.randomUUID();
  try {
    await new Migrator().migrate();
    await admin.query(
      `INSERT INTO app.profiles (id, display_name) VALUES ($1, 'Synthetic cleanup owner'), ($2, 'Synthetic other owner')`,
      [owner, other]
    );
    await admin.query(
      `INSERT INTO app.ai_consents (user_id, consent_version, provider_disclosure_version) VALUES ($1, 'test', 'test'), ($2, 'test', 'test')`,
      [owner, other]
    );
    await withUserContext(runtime, owner, async (client) => {
      expect(
        (await client.query('DELETE FROM app.ai_consents WHERE user_id = $1', [other])).rowCount
      ).toBe(0);
      expect(
        (await client.query('DELETE FROM app.ai_consents WHERE user_id = $1', [owner])).rowCount
      ).toBe(1);
    });
    expect(
      (await admin.query('SELECT user_id FROM app.ai_consents WHERE user_id = $1', [other]))
        .rowCount
    ).toBe(1);
  } finally {
    await admin.query('DELETE FROM app.profiles WHERE id = ANY($1::uuid[])', [[owner, other]]);
    await runtime.end();
    await admin.end();
  }
});
