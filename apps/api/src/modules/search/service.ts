import type { PoolClient } from 'pg';
import type { SearchQuery, SearchResultItem } from '@daynori/contracts';
import { extractSearchSnippet, buildFolderPath } from '@daynori/domain';

interface ProfilePreferences {
  journalPreviewHidden?: boolean;
  suppressBodySnippets?: boolean;
}

export async function executeSearch(
  client: PoolClient,
  workspaceId: string,
  userId: string,
  query: SearchQuery
): Promise<{
  data: SearchResultItem[];
  totalCount: number;
}> {
  // 1. Fetch user preferences to enforce privacy rules for journal previews
  const prefResult = await client.query<{ preferences: ProfilePreferences }>(
    `SELECT preferences FROM app.profiles WHERE id = $1;`,
    [userId]
  );
  const userPrefs = prefResult.rows[0]?.preferences || {};
  const shouldRedactJournal =
    userPrefs.suppressBodySnippets !== false || userPrefs.journalPreviewHidden !== false;

  // 2. Fetch all folders in workspace to compute canonical breadcrumbs
  const folderRows = await client.query<{ id: string; name: string; parent_id: string | null }>(
    `SELECT id, name, parent_id FROM app.folders WHERE workspace_id = $1;`,
    [workspaceId]
  );
  const folderMap = new Map<string, { id: string; name: string; parentId: string | null }>();
  for (const f of folderRows.rows) {
    folderMap.set(f.id, { id: f.id, name: f.name, parentId: f.parent_id });
  }

  // 3. Build parameterized query
  const q = (query.q || '').trim();
  const params: unknown[] = [workspaceId];
  let paramIdx = 2;

  const whereClauses: string[] = [
    `i.workspace_id = $1`,
    // Invariant: strict vault exclusion - no vault rows or aggregate counts
    `i.security_scope != 'vault'`,
  ];

  // Trash filtering: exclude trash unless explicitly included
  if (!query.includeArchived) {
    whereClauses.push(`i.deleted_at IS NULL`);
  }

  // Folder filtering
  if (query.folderId) {
    whereClauses.push(`(i.folder_id = $${paramIdx} OR i.id = $${paramIdx})`);
    params.push(query.folderId);
    paramIdx++;
  }

  // Date filtering
  if (query.startDate) {
    whereClauses.push(`i.created_at >= $${paramIdx}`);
    params.push(query.startDate);
    paramIdx++;
  }
  if (query.endDate) {
    whereClauses.push(`i.created_at <= $${paramIdx}`);
    params.push(query.endDate);
    paramIdx++;
  }

  // Type filtering
  if (query.types && query.types.length > 0 && !query.types.includes('all')) {
    const typeConditions: string[] = [];
    for (const t of query.types) {
      if (t === 'note') {
        typeConditions.push(`(i.kind = 'note' AND (n.purpose IS NULL OR n.purpose = 'standard'))`);
      } else if (t === 'knowledge') {
        typeConditions.push(
          `(i.kind = 'note' AND n.purpose IN ('guide', 'cheatsheet', 'reference'))`
        );
      } else if (t === 'task') {
        typeConditions.push(`i.kind IN ('todo', 'task')`);
      } else if (t === 'journal') {
        typeConditions.push(`i.kind = 'journal_entry'`);
      } else if (t === 'file') {
        typeConditions.push(`i.kind = 'file_item'`);
      } else if (t === 'folder') {
        typeConditions.push(`i.kind = 'folder'`);
      }
    }
    if (typeConditions.length > 0) {
      whereClauses.push(`(${typeConditions.join(' OR ')})`);
    }
  }

  // Tag filtering
  if (query.tagNames && query.tagNames.length > 0) {
    const lowerTags = query.tagNames.map((t) => t.toLowerCase());
    whereClauses.push(`
      EXISTS (
        SELECT 1 FROM app.item_tags it_filter
        JOIN app.tags tg_filter ON tg_filter.workspace_id = it_filter.workspace_id AND tg_filter.id = it_filter.tag_id
        WHERE it_filter.workspace_id = i.workspace_id 
          AND it_filter.item_id = i.id 
          AND tg_filter.deleted_at IS NULL
          AND lower(tg_filter.name) = ANY($${paramIdx})
      )
    `);
    params.push(lowerTags);
    paramIdx++;
  }

  // Text search conditions
  if (q) {
    const qLikeParam = `$${paramIdx}`;
    params.push(`%${q}%`);
    paramIdx++;

    const qTsParam = `$${paramIdx}`;
    params.push(q);
    paramIdx++;

    whereClauses.push(`(
      -- Note title, body, or FTS
      (i.kind = 'note' AND (
        n.title ILIKE ${qLikeParam}
        OR n.plain_text ILIKE ${qLikeParam}
        OR to_tsvector('simple', n.title || ' ' || n.plain_text) @@ plainto_tsquery('simple', ${qTsParam})
      ))
      OR
      -- Task title, details, or FTS
      (i.kind IN ('todo', 'task') AND (
        t.title ILIKE ${qLikeParam}
        OR t.details ILIKE ${qLikeParam}
        OR to_tsvector('simple', t.title || ' ' || COALESCE(t.details, '')) @@ plainto_tsquery('simple', ${qTsParam})
      ))
      OR
      -- Journal title, plain text, or FTS
      (i.kind = 'journal_entry' AND (
        j.title ILIKE ${qLikeParam}
        OR j.plain_text ILIKE ${qLikeParam}
        OR to_tsvector('simple', COALESCE(j.title, '') || ' ' || j.plain_text) @@ plainto_tsquery('simple', ${qTsParam})
      ))
      OR
      -- File item name or FTS
      (i.kind = 'file_item' AND (
        f.file_name ILIKE ${qLikeParam}
        OR to_tsvector('simple', f.file_name) @@ plainto_tsquery('simple', ${qTsParam})
      ))
      OR
      -- Folder name
      (i.kind = 'folder' AND (
        fld.name ILIKE ${qLikeParam}
      ))
      OR
      -- Matching tag names on item
      EXISTS (
        SELECT 1 FROM app.item_tags it_match
        JOIN app.tags tg_match ON tg_match.workspace_id = it_match.workspace_id AND tg_match.id = it_match.tag_id
        WHERE it_match.workspace_id = i.workspace_id 
          AND it_match.item_id = i.id 
          AND tg_match.deleted_at IS NULL
          AND tg_match.name ILIKE ${qLikeParam}
      )
    )`);
  } else if (
    !query.types?.length &&
    !query.folderId &&
    !query.tagNames?.length &&
    !query.startDate &&
    !query.endDate
  ) {
    // If empty query and no specific filters, return empty results
    return { data: [], totalCount: 0 };
  }

  // Stable ordering: match relevance (title match first), then updated_at DESC, then id ASC
  const orderClause = q
    ? `
      ORDER BY 
        CASE 
          WHEN (n.title ILIKE $${paramIdx - 2} OR t.title ILIKE $${paramIdx - 2} OR j.title ILIKE $${paramIdx - 2} OR f.file_name ILIKE $${paramIdx - 2} OR fld.name ILIKE $${paramIdx - 2}) THEN 1
          ELSE 2
        END ASC,
        i.updated_at DESC,
        i.id ASC
    `
    : `ORDER BY i.updated_at DESC, i.id ASC`;

  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;

  const limitParam = `$${paramIdx}`;
  params.push(limit);
  paramIdx++;

  const offsetParam = `$${paramIdx}`;
  params.push(offset);
  paramIdx++;

  const sql = `
    SELECT 
      i.id,
      i.kind,
      i.folder_id,
      i.security_scope,
      i.created_at,
      i.updated_at,
      i.deleted_at,
      n.title AS note_title,
      n.plain_text AS note_plain_text,
      n.purpose AS note_purpose,
      t.title AS task_title,
      t.details AS task_details,
      t.tags AS task_tags,
      j.title AS journal_title,
      j.plain_text AS journal_plain_text,
      j.entry_date AS journal_entry_date,
      j.tags AS journal_tags,
      f.file_name AS file_name,
      f.declared_mime_type AS file_mime_type,
      f.byte_size AS file_byte_size,
      fld.name AS folder_name,
      ARRAY(
        SELECT tg.name 
        FROM app.item_tags it_agg
        JOIN app.tags tg ON tg.workspace_id = it_agg.workspace_id AND tg.id = it_agg.tag_id
        WHERE it_agg.workspace_id = i.workspace_id AND it_agg.item_id = i.id AND tg.deleted_at IS NULL
      ) AS item_tags,
      COUNT(*) OVER() AS full_count
    FROM app.items i
    LEFT JOIN app.notes n ON n.workspace_id = i.workspace_id AND n.id = i.id
    LEFT JOIN app.tasks t ON t.workspace_id = i.workspace_id AND t.id = i.id
    LEFT JOIN app.journal_entries j ON j.workspace_id = i.workspace_id AND j.id = i.id
    LEFT JOIN app.file_items f ON f.workspace_id = i.workspace_id AND f.id = i.id
    LEFT JOIN app.folders fld ON fld.workspace_id = i.workspace_id AND fld.id = i.id
    WHERE ${whereClauses.join(' AND ')}
    ${orderClause}
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  interface SearchDbRow {
    id: string;
    kind: string;
    folder_id: string | null;
    security_scope: string;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
    note_title: string | null;
    note_plain_text: string | null;
    note_purpose: string | null;
    task_title: string | null;
    task_details: string | null;
    task_tags: string[] | null;
    journal_title: string | null;
    journal_plain_text: string | null;
    journal_entry_date: string | null;
    journal_tags: string[] | null;
    file_name: string | null;
    file_mime_type: string | null;
    file_byte_size: string | number | null;
    folder_name: string | null;
    item_tags: string[] | null;
    full_count: string | number;
  }

  const result = await client.query<SearchDbRow>(sql, params);

  const totalCount = result.rows.length > 0 ? Number(result.rows[0]?.full_count || 0) : 0;

  const data: SearchResultItem[] = result.rows.map((row) => {
    let displayType: SearchResultItem['displayType'] = 'note';
    let title = '';
    let bodyText = '';
    const tags: string[] = [...(row.item_tags || [])];
    let metadata: Record<string, unknown> | undefined;

    if (row.kind === 'note') {
      const isKnowledge = row.note_purpose && row.note_purpose !== 'standard';
      displayType = isKnowledge ? 'knowledge' : 'note';
      title = row.note_title || 'Untitled Note';
      bodyText = row.note_plain_text || '';
      metadata = { purpose: row.note_purpose || 'standard' };
    } else if (row.kind === 'todo' || row.kind === 'task') {
      displayType = 'task';
      title = row.task_title || 'Untitled Task';
      bodyText = row.task_details || '';
      if (row.task_tags) tags.push(...row.task_tags);
    } else if (row.kind === 'journal_entry') {
      displayType = 'journal';
      title = row.journal_title || `Reflection (${row.journal_entry_date || ''})`;
      bodyText = shouldRedactJournal ? '[Private journal entry]' : row.journal_plain_text || '';
      metadata = { entryDate: row.journal_entry_date };
      if (row.journal_tags) tags.push(...row.journal_tags);
    } else if (row.kind === 'file_item') {
      displayType = 'file';
      title = row.file_name || 'File';
      const sizeKb = (Number(row.file_byte_size || 0) / 1024).toFixed(1);
      bodyText = `${row.file_mime_type || 'application/octet-stream'} (${sizeKb} KB)`;
      metadata = {
        byteSize: Number(row.file_byte_size || 0),
        mimeType: row.file_mime_type,
      };
    } else if (row.kind === 'folder') {
      displayType = 'folder';
      title = row.folder_name || 'Folder';
      bodyText = 'Folder';
    }

    const folderPath = buildFolderPath(row.folder_id, folderMap);
    const snippet =
      displayType === 'journal' && shouldRedactJournal
        ? '[Private journal entry]'
        : extractSearchSnippet(bodyText, q);

    return {
      id: row.id,
      kind: row.kind,
      displayType,
      title,
      snippet,
      folderId: row.folder_id,
      folderPath,
      tags: Array.from(new Set(tags)),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
      metadata,
    };
  });

  return {
    data,
    totalCount,
  };
}
