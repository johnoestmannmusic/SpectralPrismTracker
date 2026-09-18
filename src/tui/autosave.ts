import { projectToJson } from "@/core/project";
import { loadedSongFromProjectText, type IoResult } from "./io";
import type { Session } from "./session";

/** Path/identifier of the rolling autosave backup for this session's host. */
export function backupPath(session: Session): string {
  return session.host.config.backupPath();
}

/** Writes the live project to the backup file. Returns false when unwritable. */
export async function saveBackup(
  session: Session,
  filePath: string = backupPath(session),
): Promise<boolean> {
  const project = session.buildProjectFile();
  if (!project) return false;
  const json = projectToJson(project, true);
  const written = await session.host.fs.writeBytesSafe(
    filePath,
    new TextEncoder().encode(json),
  );
  return written.ok;
}

/** Reloads a backup project into the session. */
export async function restoreBackup(
  session: Session,
  filePath: string = backupPath(session),
): Promise<IoResult> {
  const text = await session.host.fs.readTextSafe(filePath);
  if (!text.ok) return { ok: false, error: text.error };
  try {
    const loaded = await loadedSongFromProjectText(text.value, session.host);
    await session.load(loaded);
    return {
      ok: true,
      message: `Restored backup from ${filePath}`,
      path: filePath,
    };
  } catch (error) {
    return { ok: false, error: `Cannot restore backup: ${String(error)}` };
  }
}
