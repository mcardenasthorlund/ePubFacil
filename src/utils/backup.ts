import { exportFullBackup, restoreFullBackup } from '../db/db';
import { downloadBlob } from './share';

/** Downloads a full backup ZIP of the local library. */
export async function downloadBackup(): Promise<{ projects: number }> {
  const blob = await exportFullBackup();
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `epubfacil-backup-${stamp}.zip`);
  return { projects: 0 };
}

/** Restores the library from a backup ZIP chosen by the user. */
export async function restoreFromBackup(file: File): Promise<{ projects: number; chapters: number; assets: number }> {
  return await restoreFullBackup(file);
}
