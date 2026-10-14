import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import {
  createAdminPool,
  createRuntimePool,
  withTenantContext,
  withNoContext,
  inspectConnectionRole,
  listWorkspaces,
  updateWorkspace,
  addMembership,
  removeMembership,
  createItem,
  getItem,
  listItems,
  updateItem,
  deleteItem,
  recordAuditEvent,
  listAuditEvents,
  createStorageObject,
  getStorageObject,
  listStorageObjects,
  createWorkspace,
  getRuntimeDatabaseConfig,
} from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';

describe('Phase 07: PostgreSQL Tenant Isolation and RLS Foundations', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;

  const testSuffix = crypto.randomUUID().slice(0, 8);
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();
  const workspace1Id = crypto.randomUUID();
  const workspace2Id = crypto.randomUUID();

  beforeAll(async () => {
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    // Ensure migrations are executed cleanly
    migrator = new Migrator();
    await migrator.migrate();

    // Create baseline profiles and workspaces using admin connection
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query(
        `INSERT INTO app.profiles (id, display_name)
         VALUES ($1, $2), ($3, $4)
         ON CONFLICT (id) DO NOTHING;`,
        [user1Id, `User One ${testSuffix}`, user2Id, `User Two ${testSuffix}`]
      );

      await adminClient.query(
        `INSERT INTO app.workspaces (id, name, kind, owner_id)
         VALUES ($1, $2, 'personal', $3), ($4, $5, 'personal', $6)
         ON CONFLICT (id) DO NOTHING;`,
        [workspace1Id, `WS 1 ${testSuffix}`, user1Id, workspace2Id, `WS 2 ${testSuffix}`, user2Id]
      );

      await adminClient.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner'), ($3, $4, 'owner')
         ON CONFLICT (workspace_id, user_id) DO NOTHING;`,
        [workspace1Id, user1Id, workspace2Id, user2Id]
      );
    } finally {
      adminClient.release();
    }
  });

  afterAll(async () => {
    // Clean up test data
    const adminClient = await adminPool.connect();
    try {
      await adminClient.query('DELETE FROM app.workspaces WHERE id IN ($1, $2);', [
        workspace1Id,
        workspace2Id,
      ]);
      await adminClient.query('DELETE FROM app.profiles WHERE id IN ($1, $2);', [user1Id, user2Id]);
    } catch {
      // Ignore cleanup error if already deleted
    } finally {
      adminClient.release();
    }

    await migrator.close();
    await runtimePool.end();
    await adminPool.end();
  }, 30000);

  describe('1. Role Privilege Boundaries & Migration Ledger Protections', () => {
    it('verifies that the runtime role is non-superuser and cannot bypass RLS', async () => {
      const client = await runtimePool.connect();
      try {
        const roleInfo = await inspectConnectionRole(client);
        expect(roleInfo.currentUser).toBe('daynori_runtime');
        expect(roleInfo.isSuperuser).toBe(false);
        expect(roleInfo.bypassesRls).toBe(false);
      } finally {
        client.release();
      }
    });

    it('denies the runtime role from reading or mutating the migration ledger', async () => {
      // Direct SELECT on schema_migrations must fail
      await expect(
        withNoContext(runtimePool, async (client) => {
          return client.query('SELECT * FROM app.schema_migrations;');
        })
      ).rejects.toThrow(/permission denied for table schema_migrations/i);

      // Direct INSERT on schema_migrations must fail
      await expect(
        withNoContext(runtimePool, async (client) => {
          return client.query(
            "INSERT INTO app.schema_migrations (version, name, checksum) VALUES ('99999', 'fake', 'fake');"
          );
        })
      ).rejects.toThrow(/permission denied for table schema_migrations/i);
    });

    it('verifies that schema migrations table tracks applied migrations and is idempotent', async () => {
      const secondRun = await migrator.migrate();
      expect(secondRun.applied.length).toBe(0);
      expect(secondRun.skipped.length).toBeGreaterThanOrEqual(5);
    });

    it('executes concurrent migrations safely with advisory lock serialization', async () => {
      const migratorA = new Migrator();
      const migratorB = new Migrator();
      try {
        const [resA, resB] = await Promise.all([migratorA.migrate(), migratorB.migrate()]);
        expect(resA.applied.length).toBe(0);
        expect(resB.applied.length).toBe(0);
      } finally {
        await migratorA.close();
        await migratorB.close();
      }
    });

    it('reproduces an empty dedicated database from zero with all migrations', async () => {
      const scratchDb = `daynori_scratch_${Date.now()}`;
      const adminClient = await adminPool.connect();
      try {
        await adminClient.query(`CREATE DATABASE ${scratchDb};`);

        const scratchMigrator = new Migrator({ database: scratchDb });
        try {
          const result = await scratchMigrator.migrate();
          expect(result.applied.length).toBeGreaterThanOrEqual(6);
          expect(result.skipped.length).toBe(0);

          // Verify schema_migrations table populated
          const client = await scratchMigrator['pool'].connect();
          try {
            const appliedList = await scratchMigrator.getAppliedMigrations(client);
            expect(appliedList.length).toBeGreaterThanOrEqual(6);
          } finally {
            client.release();
          }
        } finally {
          await scratchMigrator.close();
        }
      } finally {
        await adminClient.query(`DROP DATABASE IF EXISTS ${scratchDb};`);
        adminClient.release();
      }
    }, 30000);
  });

  describe('2. Membership Privilege Escalation & Bootstrap Defense', () => {
    it('REGRESSION: strictly rejects self-enrollment into another user workspace via spoofed context', async () => {
      // User 2 connects using workspace1Id as context and attempts to insert themselves as owner/member
      await expect(
        withTenantContext(
          runtimePool,
          { userId: user2Id, workspaceId: workspace1Id },
          async (client) => {
            return addMembership(client, {
              workspaceId: workspace1Id,
              userId: user2Id,
              role: 'owner',
            });
          }
        )
      ).rejects.toThrow(/violates row-level security policy for table "workspace_memberships"/i);
    });

    it('permits initial owner bootstrap only for legitimate creator of a brand new workspace', async () => {
      const newWsId = crypto.randomUUID();

      // User 1 creates a new personal workspace
      await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          await createWorkspace(client, {
            id: newWsId,
            name: 'User 1 Secondary Workspace',
            kind: 'personal',
            ownerId: user1Id,
          });

          // In same atomic flow, User 1 inserts initial owner membership
          const mem = await addMembership(client, {
            workspaceId: newWsId,
            userId: user1Id,
            role: 'owner',
          });
          expect(mem.workspace_id).toBe(newWsId);
          expect(mem.user_id).toBe(user1Id);
          expect(mem.role).toBe('owner');
        }
      );

      // Now User 2 tries to self-enroll as owner in User 1's new workspace -> must fail!
      await expect(
        withTenantContext(
          runtimePool,
          { userId: user2Id, workspaceId: newWsId },
          async (client) => {
            return addMembership(client, {
              workspaceId: newWsId,
              userId: user2Id,
              role: 'owner',
            });
          }
        )
      ).rejects.toThrow(/violates row-level security policy/i);

      // Clean up secondary workspace
      const adminClient = await adminPool.connect();
      try {
        await adminClient.query('DELETE FROM app.workspaces WHERE id = $1;', [newWsId]);
      } finally {
        adminClient.release();
      }
    });
  });

  describe('3. Cross-Tenant Item Isolation', () => {
    let item1Id: string;

    it('allows User 1 to create an item in Workspace 1', async () => {
      const item = await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          return createItem(client, {
            workspaceId: workspace1Id,
            kind: 'note',
            createdBy: user1Id,
            displayOrder: 1,
          });
        }
      );

      expect(item).toBeDefined();
      expect(item.workspace_id).toBe(workspace1Id);
      expect(item.created_by).toBe(user1Id);
      item1Id = item.id;
    });

    it('prevents User 2 in Workspace 2 from reading User 1 item via getItem', async () => {
      const readItem = await withTenantContext(
        runtimePool,
        { userId: user2Id, workspaceId: workspace2Id },
        async (client) => {
          return getItem(client, workspace1Id, item1Id);
        }
      );

      expect(readItem).toBeNull();
    });

    it('prevents User 2 in Workspace 2 from listing Workspace 1 items', async () => {
      const items = await withTenantContext(
        runtimePool,
        { userId: user2Id, workspaceId: workspace2Id },
        async (client) => {
          return listItems(client, workspace1Id);
        }
      );

      expect(items).toEqual([]);
    });

    it('prevents User 2 from updating User 1 item even if specifying workspace1Id', async () => {
      const updated = await withTenantContext(
        runtimePool,
        { userId: user2Id, workspaceId: workspace2Id },
        async (client) => {
          return updateItem(client, workspace1Id, item1Id, {
            displayOrder: 999,
          });
        }
      );

      expect(updated).toBeNull();
    });

    it('prevents User 2 from deleting User 1 item', async () => {
      const deleted = await withTenantContext(
        runtimePool,
        { userId: user2Id, workspaceId: workspace2Id },
        async (client) => {
          return deleteItem(client, workspace1Id, item1Id);
        }
      );

      expect(deleted).toBe(false);

      // Verify item still exists for User 1
      const stillThere = await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          return getItem(client, workspace1Id, item1Id);
        }
      );
      expect(stillThere).not.toBeNull();
      expect(stillThere?.id).toBe(item1Id);
    });

    it('rejects cross-tenant inserts (User 2 attempting to insert into Workspace 1)', async () => {
      await expect(
        withTenantContext(
          runtimePool,
          { userId: user2Id, workspaceId: workspace2Id },
          async (client) => {
            return createItem(client, {
              workspaceId: workspace1Id, // Spoofed workspace
              kind: 'todo',
              createdBy: user2Id,
            });
          }
        )
      ).rejects.toThrow();
    });
  });

  describe('4. Relational Composite Foreign Key Integrity & Folder Deletion', () => {
    it('physically rejects cross-workspace folder hierarchies even if RLS were bypassed', async () => {
      // User 1 creates folder in WS 1
      const folder = await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          return createItem(client, {
            workspaceId: workspace1Id,
            kind: 'folder',
            createdBy: user1Id,
          });
        }
      );

      // User 2 creates item in WS 2 trying to point folderId to folder in WS 1
      await expect(
        withTenantContext(
          runtimePool,
          { userId: user2Id, workspaceId: workspace2Id },
          async (client) => {
            return createItem(client, {
              workspaceId: workspace2Id,
              folderId: folder.id, // Foreign folder in WS 1
              kind: 'note',
              createdBy: user2Id,
            });
          }
        )
      ).rejects.toThrow(/foreign key|violates foreign key constraint/i);
    });

    it('sets folder_id to NULL on parent folder deletion while preserving workspace_id', async () => {
      let folderId: string;
      let childItemId: string;

      // User 1 creates parent folder and child item
      await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          const folder = await createItem(client, {
            workspaceId: workspace1Id,
            kind: 'folder',
            createdBy: user1Id,
          });
          folderId = folder.id;

          const child = await createItem(client, {
            workspaceId: workspace1Id,
            folderId: folder.id,
            kind: 'note',
            createdBy: user1Id,
          });
          childItemId = child.id;
        }
      );

      // User 1 deletes parent folder
      await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          const deleted = await deleteItem(client, workspace1Id, folderId);
          expect(deleted).toBe(true);
        }
      );

      // Verify child item still exists, with folder_id NULL and workspace_id unchanged
      await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          const child = await getItem(client, workspace1Id, childItemId);
          expect(child).not.toBeNull();
          expect(child?.folder_id).toBeNull();
          expect(child?.workspace_id).toBe(workspace1Id);
        }
      );
    });
  });

  describe('5. Anonymous and Context-Free Denial', () => {
    it('returns zero rows and denies queries executed without tenant context', async () => {
      const items = await withNoContext(runtimePool, async (client) => {
        const res = await client.query('SELECT * FROM app.items;');
        return res.rows;
      });
      expect(items).toEqual([]);

      const workspaces = await withNoContext(runtimePool, async (client) => {
        const res = await client.query('SELECT * FROM app.workspaces;');
        return res.rows;
      });
      expect(workspaces).toEqual([]);

      const auditEvents = await withNoContext(runtimePool, async (client) => {
        const res = await client.query('SELECT * FROM app.audit_events;');
        return res.rows;
      });
      expect(auditEvents).toEqual([]);
    });
  });

  describe('6. Membership Revocation Cutoff and Role Enforcement', () => {
    const guestUserId = crypto.randomUUID();

    beforeAll(async () => {
      const adminClient = await adminPool.connect();
      try {
        await adminClient.query(
          `INSERT INTO app.profiles (id, display_name) VALUES ($1, $2) ON CONFLICT DO NOTHING;`,
          [guestUserId, `Guest ${testSuffix}`]
        );
      } finally {
        adminClient.release();
      }
    });

    it('enforces that viewer role cannot insert or update items', async () => {
      // Add guest as viewer in WS 1
      await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          return addMembership(client, {
            workspaceId: workspace1Id,
            userId: guestUserId,
            role: 'viewer',
          });
        }
      );

      // Viewer attempts to create item -> must fail RLS
      await expect(
        withTenantContext(
          runtimePool,
          { userId: guestUserId, workspaceId: workspace1Id },
          async (client) => {
            return createItem(client, {
              workspaceId: workspace1Id,
              kind: 'note',
              createdBy: guestUserId,
            });
          }
        )
      ).rejects.toThrow();

      // Viewer attempts to update workspace name -> must fail
      const updated = await withTenantContext(
        runtimePool,
        { userId: guestUserId, workspaceId: workspace1Id },
        async (client) => {
          return updateWorkspace(client, workspace1Id, { name: 'Hacked Name' });
        }
      );
      expect(updated).toBeNull();
    });

    it('immediately cuts off access when membership is removed', async () => {
      // Guest can read workspace list while a member
      const memberWorkspaces = await withTenantContext(
        runtimePool,
        { userId: guestUserId, workspaceId: workspace1Id },
        async (client) => {
          return listWorkspaces(client);
        }
      );
      expect(memberWorkspaces.some((w) => w.id === workspace1Id)).toBe(true);

      // Owner removes guest membership
      await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          return removeMembership(client, workspace1Id, guestUserId);
        }
      );

      // Now guest queries for WS 1 return nothing
      const postRevocation = await withTenantContext(
        runtimePool,
        { userId: guestUserId, workspaceId: workspace1Id },
        async (client) => {
          return listWorkspaces(client);
        }
      );
      expect(postRevocation.some((w) => w.id === workspace1Id)).toBe(false);
    });
  });

  describe('7. Connection Pool Reuse and Forced Connection Identity Reset', () => {
    let smallPool: Pool;

    beforeAll(() => {
      // Force connection reuse by configuring a pool with max: 1 connection
      const cfg = getRuntimeDatabaseConfig();
      smallPool = new Pool({ ...cfg, max: 1 });
    });

    afterAll(async () => {
      await smallPool.end();
    });

    it('proves zero identity leakage across pooled connections after COMMIT on max:1 pool', async () => {
      // Transaction 1: User 1
      await withTenantContext(
        smallPool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          const res = await client.query(
            "SELECT current_setting('app.current_user_id', true) as u, current_setting('app.current_workspace_id', true) as w;"
          );
          expect(res.rows[0]?.u).toBe(user1Id);
          expect(res.rows[0]?.w).toBe(workspace1Id);
        }
      );

      // Connection is released to the max:1 pool. Next query on the EXACT SAME physical connection without context:
      await withNoContext(smallPool, async (client) => {
        const userRes = await client.query(
          "SELECT current_setting('app.current_user_id', true) as u;"
        );
        const wsRes = await client.query(
          "SELECT current_setting('app.current_workspace_id', true) as w;"
        );
        expect(userRes.rows[0]?.u).toBeFalsy();
        expect(wsRes.rows[0]?.w).toBeFalsy();
      });

      // Next transaction for User 2 on the same physical connection:
      await withTenantContext(
        smallPool,
        { userId: user2Id, workspaceId: workspace2Id },
        async (client) => {
          const res = await client.query(
            "SELECT current_setting('app.current_user_id', true) as u, current_setting('app.current_workspace_id', true) as w;"
          );
          expect(res.rows[0]?.u).toBe(user2Id);
          expect(res.rows[0]?.w).toBe(workspace2Id);
        }
      );
    });

    it('proves zero identity leakage across pooled connections after ROLLBACK on max:1 pool', async () => {
      try {
        await withTenantContext(
          smallPool,
          { userId: user1Id, workspaceId: workspace1Id },
          async (client) => {
            await client.query("SELECT current_setting('app.current_user_id', true);");
            throw new Error('Simulated application crash');
          }
        );
      } catch (err) {
        expect((err as Error).message).toBe('Simulated application crash');
      }

      // Check the exact same connection immediately after rollback
      await withNoContext(smallPool, async (client) => {
        const userRes = await client.query(
          "SELECT current_setting('app.current_user_id', true) as u;"
        );
        const wsRes = await client.query(
          "SELECT current_setting('app.current_workspace_id', true) as w;"
        );
        expect(userRes.rows[0]?.u).toBeFalsy();
        expect(wsRes.rows[0]?.w).toBeFalsy();
      });
    });
  });

  describe('8. Storage and Audit Event Isolation', () => {
    it('isolates audit events by workspace', async () => {
      await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          return recordAuditEvent(client, {
            workspaceId: workspace1Id,
            actorId: user1Id,
            action: 'item.created',
            resourceType: 'item',
            resourceId: crypto.randomUUID(),
            details: { test: true },
          });
        }
      );

      // User 2 cannot list User 1 audit events
      const user2Audits = await withTenantContext(
        runtimePool,
        { userId: user2Id, workspaceId: workspace2Id },
        async (client) => {
          return listAuditEvents(client, workspace1Id);
        }
      );
      expect(user2Audits).toEqual([]);
    });

    it('isolates storage object metadata by workspace', async () => {
      const obj = await withTenantContext(
        runtimePool,
        { userId: user1Id, workspaceId: workspace1Id },
        async (client) => {
          return createStorageObject(client, {
            workspaceId: workspace1Id,
            ownerId: user1Id,
            objectPath: 'documents/private-plan.pdf',
            byteSize: 1024,
            mimeType: 'application/pdf',
          });
        }
      );

      expect(obj.workspace_id).toBe(workspace1Id);

      // User 2 in WS 2 cannot read or list this storage object
      const user2Read = await withTenantContext(
        runtimePool,
        { userId: user2Id, workspaceId: workspace2Id },
        async (client) => {
          return getStorageObject(
            client,
            workspace1Id,
            'private_assets',
            'documents/private-plan.pdf'
          );
        }
      );
      expect(user2Read).toBeNull();

      const user2List = await withTenantContext(
        runtimePool,
        { userId: user2Id, workspaceId: workspace2Id },
        async (client) => {
          return listStorageObjects(client, workspace1Id);
        }
      );
      expect(user2List).toEqual([]);
    });
  });
});
