import crypto from 'node:crypto';
import { generateKeyPair, SignJWT, exportJWK, type JSONWebKeySet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { buildServer, JwtVerifier } from '../../apps/api/src/index.js';
import { createAdminPool, createRuntimePool } from '../../apps/api/src/db/index.js';
import { Migrator } from '../../infra/supabase/migrator.js';
import { createApiClient, DaynoriApiClient } from '@daynori/api-client';
import {
  createSectionPayloadFromTemplate,
  createFallbackBlockRepresentation,
  isBlockSupported,
  getArchivedFieldValues,
} from '@daynori/domain';

describe('Phase 43: Custom Section Builder and Personal Templates (Integration Tests)', () => {
  let adminPool: Pool;
  let runtimePool: Pool;
  let migrator: Migrator;
  let server: ReturnType<typeof buildServer>;
  let baseUrl: string;

  let keyPair: Awaited<ReturnType<typeof generateKeyPair>>;
  let jwks: JSONWebKeySet;

  const issuer = 'https://auth.daynori.test';
  const audience = 'daynori-api';
  const kid = 'phase43-custom-builder-key';

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

    // 1. Run migrations including 00045_custom_section_templates.sql
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
        [userAId, 'Alice Builder', userBId, 'Bob Builder']
      );

      const wsARes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Alice Workspace', userAId]
      );
      workspaceAId = wsARes.rows[0]!.id;

      const wsBRes = await setupClient.query<{ id: string }>(
        `INSERT INTO app.workspaces (name, kind, owner_id) VALUES ($1, 'personal', $2) RETURNING id`,
        ['Bob Workspace', userBId]
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

  describe('Journey 1: Reading List Creation with Structured Fields & Folder Placement', () => {
    let readingListSectionId: string;
    let folderId: string;
    let record1Id: string;

    it('creates a Reading List section with text, date, and number fields', async () => {
      const createRes = await clientA.createCustomSection(workspaceAId, {
        name: 'Reading List',
        description: 'Track books and papers',
        icon: 'book',
        layoutMode: 'single_column',
        initialSchema: {
          version: 1,
          blocks: [
            {
              id: 'reading-collection',
              type: 'field_collection',
              title: 'Books & Articles',
              fields: [
                { id: 'title', label: 'Title', type: 'text', required: true, maxLength: 200 },
                { id: 'author', label: 'Author', type: 'text', required: false },
                { id: 'rating', label: 'Rating (1-5)', type: 'number', min: 1, max: 5 },
                { id: 'finish_date', label: 'Finished Date', type: 'date' },
              ],
            },
          ],
        },
      });

      expect(createRes.data.id).toBeDefined();
      expect(createRes.data.name).toBe('Reading List');
      expect(createRes.data.currentSchemaVersion).toBe(1);
      readingListSectionId = createRes.data.id;
    });

    it('creates and organizes entries in canonical folders', async () => {
      // 1. Create a folder in workspace A
      const folderRes = await clientA.createFolder(workspaceAId, { name: 'Software Engineering' });
      folderId = folderRes.data.id;

      // 2. Add an entry to Reading List in this folder
      const recRes = await clientA.createCustomSectionRecord(workspaceAId, readingListSectionId, {
        folderId,
        fieldValues: {
          title: 'Designing Data-Intensive Applications',
          author: 'Martin Kleppmann',
          rating: 5,
          finish_date: '2026-05-15',
        },
      });

      expect(recRes.data.id).toBeDefined();
      expect(recRes.data.folderId).toBe(folderId);
      expect(recRes.data.fieldValues['title']).toBe('Designing Data-Intensive Applications');
      expect(recRes.data.fieldValues['rating']).toBe(5);
      expect(recRes.data.schemaVersion).toBe(1);
      record1Id = recRes.data.id;
    });

    it('lists section records preserving canonical folder placement and values', async () => {
      const listRes = await clientA.listCustomSectionRecords(workspaceAId, readingListSectionId);
      expect(listRes.data).toHaveLength(1);
      const rec = listRes.data[0]!;
      expect(rec.id).toBe(record1Id);
      expect(rec.folderId).toBe(folderId);
      expect(rec.fieldValues['title']).toBe('Designing Data-Intensive Applications');
      expect(rec.fieldValues['author']).toBe('Martin Kleppmann');
    });
  });

  describe('Journey 2: Field Rename/Reorder Preserving Field IDs and Values', () => {
    let sectionId: string;
    let recordId: string;

    beforeAll(async () => {
      const sec = await clientA.createCustomSection(workspaceAId, {
        name: 'Project Inventory',
        initialSchema: {
          version: 1,
          blocks: [
            {
              id: 'inventory-col',
              type: 'field_collection',
              title: 'Items',
              fields: [
                { id: 'sku', label: 'SKU Code', type: 'text', required: true },
                { id: 'qty', label: 'Quantity', type: 'number', required: true },
              ],
            },
          ],
        },
      });
      sectionId = sec.data.id;

      const rec = await clientA.createCustomSectionRecord(workspaceAId, sectionId, {
        fieldValues: { sku: 'PROJ-001', qty: 42 },
      });
      recordId = rec.data.id;
    });

    it('renames and reorders fields in a new schema version while keeping stable field IDs', async () => {
      // Reorder: qty before sku, and rename label 'SKU Code' -> 'Product SKU'
      const newSchema = await clientA.createCustomSectionSchema(workspaceAId, sectionId, {
        blocks: [
          {
            id: 'inventory-col',
            type: 'field_collection',
            title: 'Items',
            fields: [
              { id: 'qty', label: 'Stock Quantity', type: 'number', required: true },
              { id: 'sku', label: 'Product SKU', type: 'text', required: true },
            ],
          },
        ],
      });

      expect(newSchema.data.version).toBe(2);
      expect(newSchema.data.blocks[0]!.type).toBe('field_collection');
      if (newSchema.data.blocks[0]!.type === 'field_collection') {
        expect(newSchema.data.blocks[0]!.fields[0]!.id).toBe('qty');
        expect(newSchema.data.blocks[0]!.fields[1]!.id).toBe('sku');
      }

      // Record field values are preserved completely
      const fetchedRec = await clientA.getCustomSectionRecord(workspaceAId, sectionId, recordId);
      expect(fetchedRec.data.fieldValues['sku']).toBe('PROJ-001');
      expect(fetchedRec.data.fieldValues['qty']).toBe(42);
      expect(fetchedRec.data.schemaVersion).toBe(2);
    });
  });

  describe('Journey 3: Personal Template Creation & Safe Reuse Without Leaking Records', () => {
    let savedTemplateId: string;

    it('saves a customized section structure as a personal template', async () => {
      const templatePayload = {
        name: 'Personal Reading Log Template',
        description: 'A template for tracking technical reading lists',
        icon: 'book-open',
        layoutMode: 'single_column' as const,
        schema: {
          version: 1,
          blocks: [
            {
              id: 'reading-col',
              type: 'field_collection' as const,
              title: 'Books',
              fields: [
                { id: 'title', label: 'Title', type: 'text' as const, required: true },
                { id: 'author', label: 'Author', type: 'text' as const },
                { id: 'pages', label: 'Pages Read', type: 'number' as const },
              ],
            },
          ],
        },
      };

      const res = await clientA.createCustomSectionTemplate(workspaceAId, templatePayload);
      expect(res.data.id).toBeDefined();
      expect(res.data.name).toBe('Personal Reading Log Template');
      expect(res.data.isStarter).toBe(false);
      savedTemplateId = res.data.id;
    });

    it('lists templates merging approved starter templates and personal saved templates', async () => {
      const listRes = await clientA.listCustomSectionTemplates(workspaceAId);
      expect(listRes.data.length).toBeGreaterThanOrEqual(3);

      const personal = listRes.data.find((t) => t.id === savedTemplateId);
      expect(personal).toBeDefined();
      expect(personal?.name).toBe('Personal Reading Log Template');
      expect(personal?.isStarter).toBe(false);

      const starter = listRes.data.find((t) => t.isStarter);
      expect(starter).toBeDefined();
    });

    it('reuses personal template to instantiate a new section without copying private records', async () => {
      const tmplRes = await clientA.getCustomSectionTemplate(workspaceAId, savedTemplateId);
      const sectionPayload = createSectionPayloadFromTemplate(tmplRes.data, '2026 Reading Goals');

      const newSection = await clientA.createCustomSection(workspaceAId, sectionPayload);
      expect(newSection.data.name).toBe('2026 Reading Goals');
      expect(newSection.data.currentSchemaVersion).toBe(1);

      // Verify the new section instance has ZERO records initially
      const records = await clientA.listCustomSectionRecords(workspaceAId, newSection.data.id);
      expect(records.data).toHaveLength(0);
    });

    it('enforces multi-tenant isolation on personal templates', async () => {
      // User B cannot get User A's personal template
      await expect(
        clientB.getCustomSectionTemplate(workspaceAId, savedTemplateId)
      ).rejects.toThrow();

      // User B's template list does not include User A's personal template
      const userBTemplates = await clientB.listCustomSectionTemplates(workspaceBId);
      const leaked = userBTemplates.data.find((t) => t.id === savedTemplateId);
      expect(leaked).toBeUndefined();
    });
  });

  describe('Journey 4: Study Hub Combining Software Files & Tasks (Canonical Sources Intact)', () => {
    let studySectionId: string;
    let fileBlockId: string;
    let taskBlockId: string;
    let seededFileId: string;
    let seededTaskId: string;

    beforeAll(async () => {
      const fRes = await clientA.createFolder(workspaceAId, { name: 'Software' });
      const softwareFolderId = fRes.data.id;

      const dbClient = await adminPool.connect();
      try {
        const fileId = crypto.randomUUID();
        await dbClient.query(
          `INSERT INTO app.items (id, workspace_id, kind, created_by) VALUES ($1, $2, 'file', $3)`,
          [fileId, workspaceAId, userAId]
        );
        await dbClient.query(
          `INSERT INTO app.file_items (
             id, workspace_id, folder_id, file_name, declared_mime_type, detected_mime_type,
             byte_size, sha256_checksum, object_path, quarantine_status, created_by
           ) VALUES ($1, $2, $3, 'architecture-diagram.pdf', 'application/pdf', 'application/pdf', 1048576, 'dummy-sha', $5, 'verified', $4)`,
          [fileId, workspaceAId, softwareFolderId, userAId, `vault/arch-${fileId}.pdf`]
        );
        seededFileId = fileId;
      } finally {
        dbClient.release();
      }

      // Seed task item
      const taskRes = await clientA.createTask(workspaceAId, {
        title: 'Implement Section Builder Pilot',
        priority: 'high',
      });
      seededTaskId = taskRes.data.id;

      // Create 'Study Hub' combining Software files and tasks
      fileBlockId = 'study-files-view';
      taskBlockId = 'study-tasks-view';

      const studySec = await clientA.createCustomSection(workspaceAId, {
        name: 'Study Hub',
        description: 'Software course files and upcoming tasks',
        layoutMode: 'two_column',
        initialSchema: {
          version: 1,
          blocks: [
            {
              id: fileBlockId,
              type: 'existing_record_view',
              title: 'Software Course Materials',
              targetKind: 'file',
              filter: { folderId: softwareFolderId },
              displayMode: 'list',
            },
            {
              id: taskBlockId,
              type: 'existing_record_view',
              title: 'Upcoming Assignments',
              targetKind: 'task',
              filter: { status: 'active' },
              displayMode: 'card',
            },
          ],
        },
      });
      studySectionId = studySec.data.id;
    });

    it('queries canonical Software files through the view block with genuine metadata', async () => {
      const viewRes = await clientA.queryExistingRecordView(
        workspaceAId,
        studySectionId,
        fileBlockId
      );

      expect(viewRes.data.length).toBeGreaterThanOrEqual(1);
      const fileItem = viewRes.data.find((f) => f.id === seededFileId);
      expect(fileItem).toBeDefined();
      expect(fileItem?.title).toBe('architecture-diagram.pdf');
      expect(fileItem?.targetKind).toBe('file');
      expect(fileItem?.referenceUri).toContain(seededFileId);
    });

    it('queries active tasks through the view block with genuine status and navigation URI', async () => {
      const viewRes = await clientA.queryExistingRecordView(
        workspaceAId,
        studySectionId,
        taskBlockId
      );

      expect(viewRes.data.length).toBeGreaterThanOrEqual(1);
      const taskItem = viewRes.data.find((t) => t.id === seededTaskId);
      expect(taskItem).toBeDefined();
      expect(taskItem?.title).toBe('Implement Section Builder Pilot');
      expect(taskItem?.status).toBe('todo');
      expect(taskItem?.referenceUri).toContain(seededTaskId);
    });

    it('removing custom section preserves canonical source files and tasks', async () => {
      // Delete the Study Hub section
      await clientA.deleteCustomSection(workspaceAId, studySectionId);

      // Verify canonical file and task STILL EXIST in the database!
      const dbClient = await adminPool.connect();
      try {
        const fileCheck = await dbClient.query(`SELECT id FROM app.file_items WHERE id = $1`, [
          seededFileId,
        ]);
        expect(fileCheck.rows).toHaveLength(1);

        const taskCheck = await dbClient.query(`SELECT id FROM app.tasks WHERE id = $1`, [
          seededTaskId,
        ]);
        expect(taskCheck.rows).toHaveLength(1);
      } finally {
        dbClient.release();
      }
    });
  });

  describe('Journey 5: Schema Evolution Preview, Cancellation, and Multi-Version Archive Recovery', () => {
    let sectionId: string;
    let recordId: string;

    beforeAll(async () => {
      const sec = await clientA.createCustomSection(workspaceAId, {
        name: 'Media Tracker',
        initialSchema: {
          version: 1,
          blocks: [
            {
              id: 'media-col',
              type: 'field_collection',
              title: 'Media Entries',
              fields: [
                { id: 'title', label: 'Title', type: 'text', required: true },
                { id: 'rating', label: 'Rating', type: 'text' },
              ],
            },
          ],
        },
      });
      sectionId = sec.data.id;

      const rec = await clientA.createCustomSectionRecord(workspaceAId, sectionId, {
        fieldValues: { title: 'Dune: Part Two', rating: 'Masterpiece 5/5' },
      });
      recordId = rec.data.id;
    });

    it('previews schema migration explaining affected records and archive preservation in plain language', async () => {
      const previewRes = await clientA.previewCustomSectionSchema(workspaceAId, sectionId, {
        blocks: [
          {
            id: 'media-col',
            type: 'field_collection',
            title: 'Media Entries',
            fields: [
              { id: 'title', label: 'Title', type: 'text', required: true },
              // rating type changed from text -> number (incompatible: requires archive)
              { id: 'rating', label: 'Rating', type: 'number', min: 1, max: 5 },
            ],
          },
        ],
      });

      expect(previewRes.data.affectedRecordCount).toBe(1);
      expect(previewRes.data.hasIncompatibleChanges).toBe(true);
      expect(previewRes.data.canMigrateSafely).toBe(true);
      expect(previewRes.data.affectedFields).toHaveLength(2);

      const ratingImpact = previewRes.data.affectedFields.find((f) => f.fieldId === 'rating');
      expect(ratingImpact).toBeDefined();
      expect(ratingImpact?.changeType).toBe('type_changed');
      expect(ratingImpact?.archivedNotice).toContain('archived safely');
    });

    it('applies text -> number migration and safely archives non-conforming text value', async () => {
      await clientA.createCustomSectionSchema(workspaceAId, sectionId, {
        blocks: [
          {
            id: 'media-col',
            type: 'field_collection',
            title: 'Media Entries',
            fields: [
              { id: 'title', label: 'Title', type: 'text', required: true },
              { id: 'rating', label: 'Rating', type: 'number', min: 1, max: 5 },
            ],
          },
        ],
      });

      const rec = await clientA.getCustomSectionRecord(workspaceAId, sectionId, recordId);
      expect(rec.data.schemaVersion).toBe(2);
      expect(rec.data.fieldValues['rating']).toBeUndefined(); // non-conforming text cannot fit in number

      // Archived value preserved!
      const archives = getArchivedFieldValues(rec.data, 'rating');
      expect(archives).toHaveLength(1);
      expect(archives[0]!.value).toBe('Masterpiece 5/5');
      expect(archives[0]!.previousFieldType).toBe('text');
      expect(archives[0]!.newFieldType).toBe('number');
    });

    it('applies number -> text migration with new value and verifies multi-version archive retention', async () => {
      // 1. Update record with a number rating
      const curr = await clientA.getCustomSectionRecord(workspaceAId, sectionId, recordId);
      await clientA.updateCustomSectionRecord(workspaceAId, sectionId, recordId, {
        expectedRevision: curr.data.revision,
        fieldValues: { title: 'Dune: Part Two', rating: 5 },
      });

      // 2. Migrate back to text
      await clientA.createCustomSectionSchema(workspaceAId, sectionId, {
        blocks: [
          {
            id: 'media-col',
            type: 'field_collection',
            title: 'Media Entries',
            fields: [
              { id: 'title', label: 'Title', type: 'text', required: true },
              { id: 'rating', label: 'Rating Review', type: 'text' },
            ],
          },
        ],
      });

      // 3. Migrate text -> date (repeated incompatible migration)
      await clientA.createCustomSectionSchema(workspaceAId, sectionId, {
        blocks: [
          {
            id: 'media-col',
            type: 'field_collection',
            title: 'Media Entries',
            fields: [
              { id: 'title', label: 'Title', type: 'text', required: true },
              { id: 'rating', label: 'Rating Date', type: 'date' },
            ],
          },
        ],
      });

      const finalRec = await clientA.getCustomSectionRecord(workspaceAId, sectionId, recordId);
      expect(finalRec.data.schemaVersion).toBe(4);

      // Verify ALL historical archive versions are preserved in append-only storage!
      const allArchives = getArchivedFieldValues(finalRec.data, 'rating');
      expect(allArchives.length).toBeGreaterThanOrEqual(2);

      // Original text archive exists
      const originalTextArch = allArchives.find((a) => a.value === 'Masterpiece 5/5');
      expect(originalTextArch).toBeDefined();

      // Number archive exists
      const numberArch = allArchives.find((a) => a.value === 5);
      expect(numberArch).toBeDefined();
    });
  });

  describe('Journey 6: Revoked Access, Module Enforcement & Unsupported Block Fallback', () => {
    it('rejects cross-workspace record queries and updates', async () => {
      const secA = await clientA.createCustomSection(workspaceAId, {
        name: 'Private Notes',
        initialSchema: {
          version: 1,
          blocks: [
            {
              id: 'col-private',
              type: 'field_collection',
              title: 'Notes',
              fields: [{ id: 'text', label: 'Note', type: 'text' }],
            },
          ],
        },
      });

      // User B cannot list records of Workspace A
      await expect(clientB.listCustomSectionRecords(workspaceAId, secA.data.id)).rejects.toThrow();

      // User B cannot create record in Workspace A
      await expect(
        clientB.createCustomSectionRecord(workspaceAId, secA.data.id, {
          fieldValues: { text: 'Unauthorized intrusion' },
        })
      ).rejects.toThrow();
    });

    it('handles unsupported newer block shapes with a read-only fallback preserving data', () => {
      const futureBlock = {
        id: 'block-ai-agent-v99',
        type: 'ai_smart_agent_block',
        title: 'Autonomous Research Assistant',
        version: 99,
        promptConfig: { model: 'future-ai-v2', autoExecute: true },
      };

      // 1. isBlockSupported rejects unknown block type
      expect(isBlockSupported(futureBlock)).toBe(false);

      // 2. createFallbackBlockRepresentation renders safe read-only fallback without discarding content
      const fallback = createFallbackBlockRepresentation(futureBlock);
      expect(fallback.isReadOnly).toBe(true);
      expect(fallback.unsupportedType).toBe('ai_smart_agent_block');
      expect(fallback.message).toContain('not supported by your current Daynori version');
      expect(fallback.rawData).toEqual(futureBlock);
    });
  });
});
