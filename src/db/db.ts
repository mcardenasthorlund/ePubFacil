import Dexie, { type EntityTable } from 'dexie';
import JSZip from 'jszip';
import type { AssetRecord, ChapterRecord, FolderRecord, ProjectRecord } from '../types';

export class EpubFacilDB extends Dexie {
  projects!: EntityTable<ProjectRecord, 'id'>;
  chapters!: EntityTable<ChapterRecord, 'id'>;
  assets!: EntityTable<AssetRecord, 'id'>;
  folders!: EntityTable<FolderRecord, 'id'>;

  constructor() {
    super('EpubFacilDB');
    this.version(1).stores({
      projects: '++id, title, updatedAt, folderId',
      chapters: '++id, projectId, order',
      assets: '++id, projectId, fileName',
      folders: '++id, name, parentId, createdAt, updatedAt',
    });
  }
}

export const db = new EpubFacilDB();

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function getAllProjects(): Promise<ProjectRecord[]> {
  return await db.projects.orderBy('updatedAt').reverse().toArray();
}

export async function getProject(id: number): Promise<ProjectRecord | undefined> {
  return await db.projects.get(id);
}

export async function createProject(data: ProjectRecord): Promise<number> {
  return await db.projects.add(data);
}

export async function updateProject(id: number, patch: Partial<ProjectRecord>): Promise<void> {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() });
}

export async function deleteProject(id: number): Promise<void> {
  await db.transaction('rw', [db.projects, db.chapters, db.assets], async () => {
    await db.chapters.where('projectId').equals(id).delete();
    await db.assets.where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}

export async function countProjects(): Promise<number> {
  return await db.projects.count();
}

/** Duplicates a project together with all its chapters and image assets. */
export async function cloneProject(projectId: number): Promise<number> {
  const original = await getProject(projectId);
  if (!original) throw new Error('Libro no encontrado');
  const chapters = await getProjectChapters(projectId);
  const assets = await getProjectAssets(projectId);

  const { id, ...rest } = original;
  void id;
  const now = Date.now();
  const newId = await createProject({
    ...rest,
    title: `${original.title} (copia)`,
    createdAt: now,
    updatedAt: now,
  });
  if (chapters.length > 0) {
    await replaceProjectChapters(
      newId,
      chapters.map((c) => ({ order: c.order, title: c.title, html: c.html, include: c.include }))
    );
  }
  if (assets.length > 0) {
    await replaceProjectAssets(
      newId,
      assets.map((a) => ({ fileName: a.fileName, mime: a.mime, blob: a.blob, width: a.width, height: a.height }))
    );
  }
  return newId;
}

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

export async function getProjectChapters(projectId: number): Promise<ChapterRecord[]> {
  return await db.chapters.where('projectId').equals(projectId).sortBy('order');
}

export async function replaceProjectChapters(
  projectId: number,
  chapters: Omit<ChapterRecord, 'id' | 'projectId'>[]
): Promise<void> {
  await db.transaction('rw', db.chapters, async () => {
    await db.chapters.where('projectId').equals(projectId).delete();
    const records: ChapterRecord[] = chapters.map((c, index) => ({
      projectId,
      order: index,
      title: c.title,
      html: c.html,
      include: c.include,
    }));
    if (records.length > 0) {
      await db.chapters.bulkAdd(records);
    }
  });
}

// ---------------------------------------------------------------------------
// Assets (images)
// ---------------------------------------------------------------------------

export async function getProjectAssets(projectId: number): Promise<AssetRecord[]> {
  return await db.assets.where('projectId').equals(projectId).toArray();
}

export async function replaceProjectAssets(
  projectId: number,
  assets: Omit<AssetRecord, 'id' | 'projectId'>[]
): Promise<void> {
  await db.transaction('rw', db.assets, async () => {
    await db.assets.where('projectId').equals(projectId).delete();
    const records: AssetRecord[] = assets.map((a) => ({ ...a, projectId }));
    if (records.length > 0) {
      await db.assets.bulkAdd(records);
    }
  });
}

function extFromMime(mime: string): string {
  if (/jpe?g/i.test(mime)) return 'jpg';
  if (/gif/i.test(mime)) return 'gif';
  if (/webp/i.test(mime)) return 'webp';
  if (/svg/i.test(mime)) return 'svg';
  return 'png';
}

/** Next available image file name for a project (img-001.png, img-002.png…). */
async function nextAssetFileName(projectId: number, mime: string): Promise<string> {
  const existing = await getProjectAssets(projectId);
  let max = 0;
  for (const a of existing) {
    const m = /^img-(\d+)\./.exec(a.fileName);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `img-${String(max + 1).padStart(3, '0')}.${extFromMime(mime)}`;
}

/** Adds a single image asset to a project and returns the stored record. */
export async function addProjectAsset(projectId: number, blob: Blob, mime: string): Promise<AssetRecord> {
  const fileName = await nextAssetFileName(projectId, mime);
  const record: AssetRecord = { projectId, fileName, mime, blob };
  record.id = await db.assets.add(record);
  return record;
}

/** Deletes an image asset by its id (which may be a compound key tuple). */
export async function deleteProjectAsset(key: number): Promise<void> {
  await db.assets.delete(key);
}

/** Removes assets that are no longer referenced by any chapter. Returns the count removed. */
export async function pruneUnusedAssets(projectId: number, usedFileNames: Set<string>): Promise<number> {
  const assets = await getProjectAssets(projectId);
  const toDelete = assets
    .filter((a) => a.id != null && !usedFileNames.has(a.fileName))
    .map((a) => a.id as number);
  if (toDelete.length > 0) {
    await db.assets.bulkDelete(toDelete);
  }
  return toDelete.length;
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

export async function getAllFolders(): Promise<FolderRecord[]> {
  return await db.folders.toArray();
}

export async function addFolder(name: string, parentId?: number | null): Promise<number> {
  const now = Date.now();
  return await db.folders.add({
    name: name.trim() || 'Nueva carpeta',
    parentId: parentId ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function renameFolder(id: number, name: string): Promise<void> {
  await db.folders.update(id, { name: name.trim() || 'Nueva carpeta', updatedAt: Date.now() });
}

async function getAllFolderIdsUnder(folderId: number): Promise<number[]> {
  const all = await getAllFolders();
  const ids: number[] = [];
  const collect = (pid: number) => {
    all
      .filter((f) => f.parentId === pid)
      .forEach((f) => {
        if (f.id) {
          ids.push(f.id);
          collect(f.id);
        }
      });
  };
  collect(folderId);
  return ids;
}

export async function deleteFolder(folderId: number): Promise<void> {
  const folder = await db.folders.get(folderId);
  const parentId = folder?.parentId ?? null;
  const ids = [folderId, ...(await getAllFolderIdsUnder(folderId))];
  await db.transaction('rw', [db.folders, db.projects], async () => {
    await db.projects.where('folderId').anyOf(ids).modify({ folderId: parentId });
    await db.folders.bulkDelete(ids);
  });
}

export async function moveFolder(folderId: number, newParentId?: number | null): Promise<void> {
  await db.folders.update(folderId, { parentId: newParentId ?? null, updatedAt: Date.now() });
}

export async function moveProject(projectId: number, folderId?: number | null): Promise<void> {
  await db.projects.update(projectId, { folderId: folderId ?? null, updatedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

interface BackupManifest {
  app: string;
  version: number;
  exportedAt: string;
  folders: FolderRecord[];
  projects: Array<Omit<ProjectRecord, 'coverBlob'> & { tempKey: string }>;
  chapters: Array<ChapterRecord & { tempKey: string }>;
  assets: Array<Omit<AssetRecord, 'blob'> & { tempKey: string }>;
}

export async function exportFullBackup(): Promise<Blob> {
  const [projects, folders] = await Promise.all([getAllProjects(), getAllFolders()]);
  const zip = new JSZip();

  const manifest: BackupManifest = {
    app: 'ePubFacil',
    version: 1,
    exportedAt: new Date().toISOString(),
    folders,
    projects: [],
    chapters: [],
    assets: [],
  };

  for (const project of projects) {
    if (!project.id) continue;
    const tempKey = `project_${project.id}`;
    const { coverBlob, ...meta } = project;
    if (coverBlob) {
      zip.file(`covers/${tempKey}.bin`, coverBlob);
    }
    manifest.projects.push({ ...meta, tempKey });

    const chapters = await getProjectChapters(project.id);
    for (const ch of chapters) {
      manifest.chapters.push({ ...ch, tempKey });
    }

    const assets = await getProjectAssets(project.id);
    for (const asset of assets) {
      const path = `assets/${tempKey}/${asset.fileName}`;
      zip.file(path, asset.blob);
      const { blob, ...rest } = asset;
      manifest.assets.push({ ...rest, tempKey });
    }
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export async function restoreFullBackup(
  backupBlob: Blob
): Promise<{ projects: number; chapters: number; assets: number }> {
  const zip = await JSZip.loadAsync(backupBlob);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) {
    throw new Error('El archivo no es una copia de seguridad válida de ePubFacil (falta manifest.json).');
  }
  const manifest = JSON.parse(await manifestFile.async('string')) as BackupManifest;

  const folderIdMap = new Map<number, number>();
  const sortedFolders = [...(manifest.folders || [])].sort(
    (a, b) => (a.parentId != null ? 1 : 0) - (b.parentId != null ? 1 : 0)
  );
  for (const f of sortedFolders) {
    const parent = f.parentId != null ? folderIdMap.get(f.parentId) ?? null : null;
    const newId = await addFolder(f.name, parent);
    folderIdMap.set(f.id!, newId);
  }

  let projects = 0;
  let chapters = 0;
  let assets = 0;

  for (const meta of manifest.projects || []) {
    const { tempKey, id, ...rest } = meta;
    const coverFile = zip.file(`covers/${tempKey}.bin`);
    const coverBlob = coverFile ? await coverFile.async('blob') : undefined;

    const newProjectId = await createProject({
      ...(rest as Omit<ProjectRecord, 'id' | 'coverBlob'>),
      author: rest.author ?? '',
      language: rest.language ?? 'es',
      publisher: rest.publisher ?? '',
      series: rest.series ?? '',
      isbn: rest.isbn ?? '',
      rights: rest.rights ?? '',
      folderId: rest.folderId != null ? folderIdMap.get(rest.folderId as number) ?? null : null,
      coverBlob,
      createdAt: rest.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    } as ProjectRecord);
    projects++;

    const chs = (manifest.chapters || []).filter((c) => c.tempKey === tempKey);
    if (chs.length > 0) {
      await replaceProjectChapters(
        newProjectId,
        chs.map((c) => ({ order: c.order, title: c.title, html: c.html, include: c.include }))
      );
      chapters += chs.length;
    }

    const assetMetas = (manifest.assets || []).filter((a) => a.tempKey === tempKey);
    const restoredAssets: Omit<AssetRecord, 'id' | 'projectId'>[] = [];
    for (const a of assetMetas) {
      const file = zip.file(`assets/${tempKey}/${a.fileName}`);
      if (!file) continue;
      restoredAssets.push({
        fileName: a.fileName,
        mime: a.mime,
        width: a.width,
        height: a.height,
        blob: await file.async('blob'),
      });
    }
    if (restoredAssets.length > 0) {
      await replaceProjectAssets(newProjectId, restoredAssets);
      assets += restoredAssets.length;
    }
  }

  return { projects, chapters, assets };
}
