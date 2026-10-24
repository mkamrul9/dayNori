import type { ClientBase } from 'pg';

/** Historical migrations retain their checksums; fixture credentials never leave a committed transaction. */
export async function secureCorePreviewRoles(
  client: ClientBase,
  runtimePassword: string
): Promise<void> {
  if (!/^[a-f0-9]{64}$/.test(runtimePassword))
    throw new Error('Expected a generated preview credential');
  // Bind values before constructing role DDL; never interpolate caller-supplied SQL.
  await client.query("SELECT set_config('daynori.preview_runtime_password', $1, true)", [
    runtimePassword,
  ]);
  await client.query(`DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_runtime') THEN
      EXECUTE format('ALTER ROLE daynori_runtime LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS', current_setting('daynori.preview_runtime_password'));
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_billing') THEN
      ALTER ROLE daynori_billing NOLOGIN PASSWORD NULL;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'daynori_worker') THEN
      ALTER ROLE daynori_worker NOLOGIN PASSWORD NULL;
    END IF;
  END $$`);
}
