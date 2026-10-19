import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  APPROVED_SECTION_TEMPLATES,
  createFallbackBlockRepresentation,
  isBlockSupported,
} from '@daynori/domain';

describe('Phase 42: Safe Custom Section Schemas & Renderer Contracts (Integration Tests)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase42-custom-sections-key';

  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let tokenUserA: string;
  let tokenUserB: string;
  let clientA: DaynoriApiClient;
  let clientB: DaynoriApiClient;

  let workspaceAId: string;
  let workspaceBId: string;

  async function createToken(userId: string): Promise<string> {
    return new SignJWT({
      sub: userId,
      aud: audience,
      iss: issuer,
      role: 'authenticated',
      aal: 'aal1',
      session_id: crypto.randomUUID(),
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(keyPair.privateKey);
  }

  beforeAll(async () => {
    adminPool = createAdminPool();
    runtimePool = createRuntimePool();

    // 1. Run migrations up to current
    migrator = new Migrator();
    await migrator.migrate();

    // 2. Setup JWT Key Pair & Tokens
    keyPair = await generateKeyPair('RS256');
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.kid = kid;
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    jwks = { keys: [publicJwk] };

    const verifier = new JwtVerifier({
      issuer,
      audience,
      localJwks: jwks,
    });

    const safeLogger = new (await import('../../apps/api/src/plugins/logger.js')).SafeLogger(
      (entry) => {
        if (entry.level === 'error') {
          console.error('SERVER ERROR:', JSON.stringify(entry));
        }
      }
    );

    server = buildServer({
      jwtVerifier: verifier,
      runtimePool,
      logger: safeLogger,
      rateLimitOptions: { windowMs: 60000, maxRequests: 50000 },
    });

    await server.listen({ port: 0, host: '127.0.0.1' });
    const addr = server.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind server port');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    tokenUserA = await createToken(userAId);
    tokenUserB = await createToken(userBId);

    clientA = createApiClient({ baseUrl, token: tokenUserA });
    clientB = createApiClient({ baseUrl, token: tokenUserB });

    // 3. Provision profiles and personal workspaces
    const setupClient = await adminPool.connect();
    try {
      await setupClient.query(
        `INSERT INTO app.profiles (id, display_name) VALUES ($1, $2), ($3, $4) ON CONFLICT (id) DO NOTHING`,
        [userAId, 'Alice Customizer', userBId, 'Bob Customizer']
      );

      const wsARes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Alice Custom Workspace', userAId]
      );
      workspaceAId = wsARes.rows[0]!.id;

      const wsBRes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Bob Custom Workspace', userBId]
      );
      workspaceBId = wsBRes.rows[0]!.id;

      await setupClient.query(
        `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
        [workspaceAId, userAId, workspaceBId, userBId]
      );
    } finally {
      setupClient.release();
    }
  });

  afterAll(async () => {
    if (server) await server.close();
    if (runtimePool) await runtimePool.end();
    if (adminPool) await adminPool.end();
  });

  describe('1. Custom Section Creation & Both Approved Block Families', () => {
    it('creates a custom section with a Field Collection block (Reading List)', async () => {
      const template = APPROVED_SECTION_TEMPLATES.READING_LIST;
      const res = await clientA.createCustomSection(workspaceAId, {
        name: template.name,
        description: template.description,
        icon: '📚',
        layoutMode: template.layoutMode,
        initialSchema: template.schema,
      });

      expect(res.data.id).toBeDefined();
      expect(res.data.name).toBe('Reading List');
      expect(res.data.description).toBe(template.description);
      expect(res.data.currentSchemaVersion).toBe(1);
      expect(res.data.layoutMode).toBe('single_column');
      expect(res.data.status).toBe('active');
      expect(res.data.revision).toBe(1);
      expect(res.data.currentSchema?.blocks).toHaveLength(1);
      expect(res.data.currentSchema?.blocks[0]!.type).toBe('field_collection');
    });

    it('creates a custom section with an Existing-Record View block (Study Hub)', async () => {
      const template = APPROVED_SECTION_TEMPLATES.STUDY_DASHBOARD;
      const res = await clientA.createCustomSection(workspaceAId, {
        name: template.name,
        description: template.description,
        icon: '🎓',
        layoutMode: template.layoutMode,
        initialSchema: template.schema,
      });

      expect(res.data.id).toBeDefined();
      expect(res.data.name).toBe('Study & Research Hub');
      expect(res.data.layoutMode).toBe('two_column');
      expect(res.data.currentSchemaVersion).toBe(1);
      expect(res.data.currentSchema?.blocks).toHaveLength(2);
      expect(res.data.currentSchema?.blocks[0]!.type).toBe('existing_record_view');
      expect(res.data.currentSchema?.blocks[1]!.type).toBe('existing_record_view');
    });

    it('lists custom sections for a workspace in rank order', async () => {
      const list = await clientA.listCustomSections(workspaceAId);
      expect(list.data.length).toBeGreaterThanOrEqual(2);
      const names = list.data.map((s) => s.name);
      expect(names).toContain('Reading List');
      expect(names).toContain('Study & Research Hub');
    });
  });

  describe('2. Structured Record Validation & Field Enforcement', () => {
    let readingSectionId: string;

    beforeAll(async () => {
      const list = await clientA.listCustomSections(workspaceAId);
      const section = list.data.find((s) => s.name === 'Reading List');
      if (!section) throw new Error('Reading List section not found');
      readingSectionId = section.id;
    });

    it('creates a valid structured record with all typed fields', async () => {
      const record = await clientA.createCustomSectionRecord(workspaceAId, readingSectionId, {
        fieldValues: {
          title: 'Designing Data-Intensive Applications',
          author: 'Martin Kleppmann',
          completed: [
            { id: 'ch-1', text: 'Part 1: Foundations', completed: true },
            { id: 'ch-2', text: 'Part 2: Distributed Data', completed: false },
          ],
          finish_date: '2026-05-01',
          rating: 5,
          url: 'https://dataintensive.net',
        },
      });

      expect(record.data.id).toBeDefined();
      expect(record.data.sectionId).toBe(readingSectionId);
      expect(record.data.schemaVersion).toBe(1);
      expect(record.data.fieldValues.title).toBe('Designing Data-Intensive Applications');
      expect(record.data.fieldValues.author).toBe('Martin Kleppmann');
      expect(Array.isArray(record.data.fieldValues.completed)).toBe(true);
      expect((record.data.fieldValues.completed as unknown[]).length).toBe(2);
      expect(record.data.fieldValues.rating).toBe(5);
      expect(record.data.fieldValues.url).toBe('https://dataintensive.net');
      expect(record.data.revision).toBe(1);
    });

    it('rejects record creation when a required field is missing', async () => {
      let errorCaught = false;
      try {
        await clientA.createCustomSectionRecord(workspaceAId, readingSectionId, {
          fieldValues: {
            author: 'Unknown Author',
            completed: false,
          },
        });
      } catch {
        errorCaught = true;
      }
      expect(errorCaught).toBe(true);
    });

    it('rejects record creation with unsafe script injection or malicious protocols', async () => {
      // 1. Script injection in text field
      let xssCaught = false;
      try {
        await clientA.createCustomSectionRecord(workspaceAId, readingSectionId, {
          fieldValues: {
            title: '<script>alert("pwned")</script>',
          },
        });
      } catch {
        xssCaught = true;
      }
      expect(xssCaught).toBe(true);

      // 2. javascript: protocol in URL field
      let badProtocolCaught = false;
      try {
        await clientA.createCustomSectionRecord(workspaceAId, readingSectionId, {
          fieldValues: {
            title: 'Malicious Book',
            url: 'javascript:stealTokens()',
          },
        });
      } catch {
        badProtocolCaught = true;
      }
      expect(badProtocolCaught).toBe(true);
    });
  });

  describe('3. Schema Versioning & Safe Field Evolution (Zero Data Loss)', () => {
    let sectionId: string;
    let recordId: string;

    beforeAll(async () => {
      // Create a section with v1 schema: fields [name, notes, score]
      const section = await clientA.createCustomSection(workspaceAId, {
        name: 'Evolution Test Section',
        initialSchema: {
          version: 1,
          blocks: [
            {
              id: 'fields',
              type: 'field_collection',
              title: 'Tracker',
              fields: [
                { id: 'name', label: 'Name', type: 'text', required: true },
                { id: 'notes', label: 'Original Notes', type: 'text', required: false },
                { id: 'score', label: 'Score', type: 'number', required: false },
              ],
            },
          ],
        },
      });
      sectionId = section.data.id;

      // Create a record under v1
      const rec = await clientA.createCustomSectionRecord(workspaceAId, sectionId, {
        fieldValues: {
          name: 'Important Research Item',
          notes: 'This note must not be lost upon schema update!',
          score: 85,
        },
      });
      recordId = rec.data.id;
    });

    it('creates schema version 2 removing "notes" and changing "score" to text, safely preserving values in archivedValues', async () => {
      // Create v2 schema: "notes" removed, "score" changed to text, "verified" checklist added
      const newSchema = await clientA.createCustomSectionSchema(workspaceAId, sectionId, {
        blocks: [
          {
            id: 'fields',
            type: 'field_collection',
            title: 'Tracker V2',
            fields: [
              { id: 'name', label: 'Name', type: 'text', required: true },
              { id: 'score', label: 'Score Text', type: 'text', required: false }, // Type changed!
              { id: 'verified', label: 'Verified', type: 'checklist', defaultChecked: true }, // Added!
              // 'notes' is removed!
            ],
          },
        ],
      });

      expect(newSchema.data.version).toBe(2);

      // Verify the section's currentSchemaVersion is updated to 2
      const updatedSection = await clientA.getCustomSection(workspaceAId, sectionId);
      expect(updatedSection.data.currentSchemaVersion).toBe(2);

      // Verify record values were automatically migrated without data loss
      const migratedRecord = await clientA.getCustomSectionRecord(workspaceAId, sectionId, recordId);
      expect(migratedRecord.data.schemaVersion).toBe(2);
      expect(migratedRecord.data.fieldValues.name).toBe('Important Research Item');
      expect(migratedRecord.data.fieldValues.verified).toEqual([]);

      // The removed "notes" field MUST be preserved in archivedValues!
      expect(migratedRecord.data.archivedValues.notes).toBeDefined();
      const archivedNotes = migratedRecord.data.archivedValues.notes as {
        value: unknown;
        reason: string;
      };
      expect(archivedNotes.value).toBe('This note must not be lost upon schema update!');
      expect(archivedNotes.reason).toBe('field_removed');

      // The type-changed "score" field MUST be preserved in archivedValues!
      expect(migratedRecord.data.archivedValues.score).toBeDefined();
      const archivedScore = migratedRecord.data.archivedValues.score as {
        value: unknown;
        reason: string;
      };
      expect(archivedScore.value).toBe(85);
      expect(archivedScore.reason).toBe('type_changed');
    });

    it('retrieves immutable historical schema versions by version number', async () => {
      const v1 = await clientA.getCustomSectionSchema(workspaceAId, sectionId, 1);
      expect(v1.data.version).toBe(1);
      expect(v1.data.blocks[0]!.type).toBe('field_collection');

      const v2 = await clientA.getCustomSectionSchema(workspaceAId, sectionId, 2);
      expect(v2.data.version).toBe(2);
    });
  });

  describe('4. Optimistic Concurrency Control (409 Conflict)', () => {
    let sectionId: string;
    let recordId: string;

    beforeAll(async () => {
      const section = await clientA.createCustomSection(workspaceAId, {
        name: 'Concurrency Section',
        initialSchema: {
          version: 1,
          blocks: [
            {
              id: 'fields',
              type: 'field_collection',
              title: 'Items',
              fields: [{ id: 'title', label: 'Title', type: 'text', required: true }],
            },
          ],
        },
      });
      sectionId = section.data.id;

      const record = await clientA.createCustomSectionRecord(workspaceAId, sectionId, {
        fieldValues: { title: 'Initial Title' },
      });
      recordId = record.data.id;
    });

    it('rejects section update with 409 conflict when expectedRevision does not match', async () => {
      let conflictCaught = false;
      try {
        await clientA.updateCustomSection(workspaceAId, sectionId, {
          name: 'Stale Update',
          expectedRevision: 999,
        });
      } catch {
        conflictCaught = true;
      }
      expect(conflictCaught).toBe(true);
    });

    it('rejects record update with 409 conflict when expectedRevision does not match', async () => {
      let conflictCaught = false;
      try {
        await clientA.updateCustomSectionRecord(workspaceAId, sectionId, recordId, {
          fieldValues: { title: 'Conflict Attempt' },
          expectedRevision: 999,
        });
      } catch {
        conflictCaught = true;
      }
      expect(conflictCaught).toBe(true);
    });
  });

  describe('5. Cross-Tenant Isolation & Security Boundaries', () => {
    let aliceSectionId: string;
    let aliceRecordId: string;

    beforeAll(async () => {
      const sec = await clientA.createCustomSection(workspaceAId, {
        name: 'Alice Secret Section',
        initialSchema: {
          version: 1,
          blocks: [
            {
              id: 'fields',
              type: 'field_collection',
              title: 'Classified',
              fields: [{ id: 'secret', label: 'Secret', type: 'text' }],
            },
          ],
        },
      });
      aliceSectionId = sec.data.id;

      const rec = await clientA.createCustomSectionRecord(workspaceAId, aliceSectionId, {
        fieldValues: { secret: 'super-confidential-memo' },
      });
      aliceRecordId = rec.data.id;
    });

    it('prevents User B from accessing, modifying, or deleting Alice custom sections and records', async () => {
      // 1. Bob cannot get Alice's section
      let getSecCaught = false;
      try {
        await clientB.getCustomSection(workspaceBId, aliceSectionId);
      } catch {
        getSecCaught = true;
      }
      expect(getSecCaught).toBe(true);

      // 2. Bob cannot update Alice's section
      let updateSecCaught = false;
      try {
        await clientB.updateCustomSection(workspaceBId, aliceSectionId, {
          name: 'Hacked Name',
          expectedRevision: 1,
        });
      } catch {
        updateSecCaught = true;
      }
      expect(updateSecCaught).toBe(true);

      // 3. Bob cannot access Alice's records
      let getRecCaught = false;
      try {
        await clientB.getCustomSectionRecord(workspaceBId, aliceSectionId, aliceRecordId);
      } catch {
        getRecCaught = true;
      }
      expect(getRecCaught).toBe(true);

      // 4. Bob cannot delete Alice's records
      let deleteRecCaught = false;
      try {
        await clientB.deleteCustomSectionRecord(workspaceBId, aliceSectionId, aliceRecordId);
      } catch {
        deleteRecCaught = true;
      }
      expect(deleteRecCaught).toBe(true);
    });
  });

  describe('6. Workspace Deletion Cascade & Sync Change Emission', () => {
    it('cascades deletion of custom sections, schemas, and records when workspace is deleted', async () => {
      const poolClient = await adminPool.connect();
      try {
        // 1. Create temporary disposable workspace
        const tempWs = await poolClient.query<{ id: string }>(
          `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ('Temp Custom Ws', 'room', $1) RETURNING id`,
          [userAId]
        );
        const tempWsId = tempWs.rows[0]!.id;

        await poolClient.query(
          `INSERT INTO app.workspace_memberships (workspace_id, user_id, role) VALUES ($1, $2, 'owner')`,
          [tempWsId, userAId]
        );

        // 2. Create custom section and record in temporary workspace
        const section = await clientA.createCustomSection(tempWsId, {
          name: 'Temp Section',
          initialSchema: {
            version: 1,
            blocks: [
              {
                id: 'fields',
                type: 'field_collection',
                title: 'Data',
                fields: [{ id: 'val', label: 'Value', type: 'text' }],
              },
            ],
          },
        });
        const sectionId = section.data.id;

        const rec = await clientA.createCustomSectionRecord(tempWsId, sectionId, {
          fieldValues: { val: 'test' },
        });
        const recordId = rec.data.id;

        // Verify entities exist
        const secCheckBefore = await poolClient.query(
          `SELECT id FROM app.custom_sections WHERE id = $1`,
          [sectionId]
        );
        expect(secCheckBefore.rowCount).toBe(1);

        const recCheckBefore = await poolClient.query(
          `SELECT id FROM app.custom_section_records WHERE id = $1`,
          [recordId]
        );
        expect(recCheckBefore.rowCount).toBe(1);

        // 3. Delete workspace
        await poolClient.query(`DELETE FROM app.workspaces WHERE id = $1`, [tempWsId]);

        // 4. Verify cascade deletion
        const secCheckAfter = await poolClient.query(
          `SELECT id FROM app.custom_sections WHERE id = $1`,
          [sectionId]
        );
        expect(secCheckAfter.rowCount).toBe(0);

        const schemaCheckAfter = await poolClient.query(
          `SELECT id FROM app.custom_section_schemas WHERE section_id = $1`,
          [sectionId]
        );
        expect(schemaCheckAfter.rowCount).toBe(0);

        const recCheckAfter = await poolClient.query(
          `SELECT id FROM app.custom_section_records WHERE id = $1`,
          [recordId]
        );
        expect(recCheckAfter.rowCount).toBe(0);
      } finally {
        poolClient.release();
      }
    });

    it('emits change events for custom sections and records in app.changes', async () => {
      const poolClient = await adminPool.connect();
      try {
        const changes = await poolClient.query(
          `SELECT entity_type, is_tombstone FROM app.changes
           WHERE workspace_id = $1 AND entity_type IN ('custom_section', 'custom_section_record')`,
          [workspaceAId]
        );
        expect(changes.rowCount).toBeGreaterThanOrEqual(2);
        const types = changes.rows.map((r: { entity_type: string }) => r.entity_type);
        expect(types).toContain('custom_section');
        expect(types).toContain('custom_section_record');
      } finally {
        poolClient.release();
      }
    });
  });

  describe('7. Fallback Representation Contract', () => {
    it('correctly creates fallback representation for future or unsupported block formats', () => {
      const futureBlock = {
        id: 'future-kanban-1',
        type: 'future_kanban_board',
        title: 'Sprint Board',
        columns: ['To Do', 'In Progress', 'Done'],
      };

      expect(isBlockSupported(futureBlock)).toBe(false);

      const fallback = createFallbackBlockRepresentation(futureBlock);
      expect(fallback.type).toBe('fallback');
      expect(fallback.unsupportedType).toBe('future_kanban_board');
      expect(fallback.title).toBe('Sprint Board');
      expect(fallback.rawData).toEqual(futureBlock);
      expect(fallback.message).toContain('not supported');
    });
  });
});
