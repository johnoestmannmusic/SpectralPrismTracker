import path from "node:path";
import { projectToJson } from "@/core/project";
import { configDir } from "@/runtime/config";
import { readTextSafe, writeBytesSafe } from "@/runtime/files";
import { loadedSongFromProjectText, type IoResult } from "./io";
import type { Session } from "./session";

/** Path of the rolling autosave backup (`<config dir>/backup.lmpjson`). */
export function backupPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(configDir(env), "backup.lmpjson");
}

/** Writes the live project to the backup file. Returns false when unwritable. */
export async function saveBackup(
  session: Session,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const project = session.buildProjectFile();
  if (!project) return false;
  const json = projectToJson(project, true);
  const written = await writeBytesSafe(
    backupPath(env),
    new TextEncoder().encode(json),
  );
  return written.ok;
}

/** Reloads a backup project into the session. */
export async function restoreBackup(
  session: Session,
  filePath: string = backupPath(),
): Promise<IoResult> {
  const text = await readTextSafe(filePath);
  if (!text.ok) return { ok: false, error: text.error };
  try {
    const loaded = await loadedSongFromProjectText(text.value);
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
