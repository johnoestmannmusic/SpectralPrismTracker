import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import type { DirectoryEntry } from "@/host/types";
import { dirname, extname, isProjectPath } from "@/runtime/paths";
import { isCancel, isConfirm } from "../keys";
import { MarqueeText } from "./Marquee";
import type { Session } from "../session";

interface Props {
  session: Session;
  active: boolean;
  onClose: () => void;
  /** "open" picks a project file; "save" picks an output path. */
  mode?: "open" | "save";
  /** Called with the chosen path (open: project file; save: target file). */
  onSelect: (path: string) => void;
  /** Rows available to the overlay. */
  height: number;
  /** Columns available (for the breadcrumb marquee). */
  width?: number;
  /** Save mode: starting directory / filename. */
  initialDirectory?: string;
  initialFilename?: string;
}

/** "open" mode: directories plus selectable project files only. */
export function pickableEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return entries.filter(
    (entry) =>
      entry.isDirectory ||
      (!entry.name.startsWith(".") && isProjectPath(entry.path)),
  );
}

/** "save" mode: directories plus existing WAVs (so a file can be overwritten). */
export function saveEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return entries.filter(
    (entry) =>
      entry.isDirectory ||
      (!entry.name.startsWith(".") &&
        extname(entry.path).toLowerCase() === ".wav"),
  );
}

/** Joins a directory and a filename with `/` (hosts normalise as needed). */
export function joinOutputPath(directory: string, filename: string): string {
  if (!directory) return filename;
  if (directory.endsWith("/") || directory.endsWith("\\")) {
    return `${directory}${filename}`;
  }
  return `${directory}/${filename}`;
}

type RowKind = "parent" | "dir" | "file" | "save";
interface Row {
  name: string;
  path: string;
  kind: RowKind;
}

/**
 * Project file picker (FEAT-155) with a save mode (FEAT-158). "open" lists
 * directories and project files; "save" lists directories and existing WAVs
 * plus an editable filename, and returns the chosen output path.
 */
export function FilePicker({
  session,
  active,
  onClose,
  mode = "open",
  onSelect,
  height,
  width = 100,
  initialDirectory,
  initialFilename,
}: Props) {
  const [directory, setDirectory] = useState<string>(() => {
    if (initialDirectory) return initialDirectory;
    const projectPath = session.getState().projectPath;
    if (projectPath) {
      const dir = dirname(projectPath);
      if (dir) return dir;
    }
    return session.host.fs.resolvePath(".");
  });
  const [filename, setFilename] = useState(initialFilename ?? "output.wav");
  const [editingName, setEditingName] = useState(false);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const parent = useMemo(() => {
    const dir = dirname(directory);
    return dir && dir !== directory ? dir : null;
  }, [directory]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setMessage(null);
    void (async () => {
      const list = session.host.fs.listDirectory;
      if (!list) {
        if (!cancelled) {
          setEntries([]);
          setMessage("File browsing is not supported on this host.");
          setLoading(false);
        }
        return;
      }
      const listing = await list(directory);
      if (cancelled) return;
      setEntries(
        mode === "save" ? saveEntries(listing) : pickableEntries(listing),
      );
      setSelected(0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [directory, session, mode]);

  const rows: Row[] = useMemo(() => {
    const list: Row[] = [];
    if (parent) list.push({ name: "..", path: parent, kind: "parent" });
    for (const entry of entries) {
      list.push({
        name: entry.name,
        path: entry.path,
        kind: entry.isDirectory ? "dir" : "file",
      });
    }
    if (mode === "save") {
      list.push({
        name: filename,
        path: joinOutputPath(directory, filename),
        kind: "save",
      });
    }
    return list;
  }, [parent, entries, mode, filename, directory]);

  const clamped = Math.min(Math.max(selected, 0), Math.max(rows.length - 1, 0));
  const visible = Math.max(3, height - (mode === "save" ? 7 : 6));
  let start = 0;
  if (clamped >= visible) start = clamped - visible + 1;
  start = Math.min(start, Math.max(0, rows.length - visible));
  const window = rows.slice(start, start + visible);

  const choose = (row: Row | undefined) => {
    if (!row) return;
    if (row.kind === "parent" || row.kind === "dir") {
      setDirectory(row.path);
      return;
    }
    if (row.kind === "file") {
      if (mode === "save") setFilename(row.name);
      else onSelect(row.path);
      return;
    }
    // save row
    onSelect(joinOutputPath(directory, filename));
  };

  useInput(
    (char, key) => {
      // Inline filename entry (save mode) swallows keys while focused.
      if (editingName) {
        if (isCancel(char, key)) {
          setEditingName(false);
          return;
        }
        if (isConfirm(char, key)) {
          setEditingName(false);
          return;
        }
        if (key.backspace || key.delete) {
          setFilename((value) => value.slice(0, -1));
          return;
        }
        if (key.ctrl || key.meta || key.tab || key.upArrow || key.downArrow) {
          return;
        }
        if (char) setFilename((value) => value + char);
        return;
      }
      if (isCancel(char, key)) {
        onClose();
        return;
      }
      if (key.upArrow) {
        setSelected((value) => Math.max(0, Math.min(value, clamped) - 1));
        return;
      }
      if (key.downArrow) {
        setSelected((value) =>
          rows.length === 0
            ? 0
            : Math.min(rows.length - 1, Math.min(value, clamped) + 1),
        );
        return;
      }
      if (key.leftArrow || key.backspace) {
        if (parent) setDirectory(parent);
        return;
      }
      if (key.rightArrow && rows[clamped]?.kind === "dir") {
        setDirectory(rows[clamped]!.path);
        return;
      }
      if (mode === "save" && char === "n") {
        setEditingName(true);
        return;
      }
      if (mode === "save" && char === "s") {
        onSelect(joinOutputPath(directory, filename));
        return;
      }
      if (isConfirm(char, key)) {
        choose(rows[clamped]);
      }
    },
    { isActive: active },
  );

  const title = mode === "save" ? "Choose output file" : "Open project";
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      flexGrow={1}
    >
      <Text bold color="cyan">
        {title}
      </Text>
      <Text dimColor wrap="truncate-end">
        <Text color="green">dir:</Text>{" "}
        <MarqueeText
          dimColor
          width={Math.max(10, width - 8)}
          text={directory}
        />
      </Text>
      {mode === "save" ? (
        <Text>
          <Text color="green">name:</Text>{" "}
          <Text color={editingName ? "cyan" : undefined}>
            {filename}
            {editingName ? "▏" : ""}
          </Text>
          {editingName ? " · type · enter done" : " · n rename · s save"}
        </Text>
      ) : null}
      <Text dimColor wrap="truncate-end">
        {mode === "save"
          ? "↑↓ select · enter open dir/overwrite · ←/backspace up · n name · s save · x/esc cancel"
          : "↑↓ select · enter/→ open · ←/backspace up · z open · x/esc cancel · only .sptproj files shown"}
        {rows.length > visible
          ? ` · ${start + 1}-${Math.min(start + visible, rows.length)}/${rows.length}`
          : ""}
      </Text>
      <Box flexDirection="column">
        {loading ? (
          <Text dimColor>reading…</Text>
        ) : message ? (
          <Text color="yellow">{message}</Text>
        ) : rows.length === 0 ? (
          <Text dimColor>(empty — press ← to go up)</Text>
        ) : (
          window.map((row, offset) => {
            const index = start + offset;
            const cursor = index === clamped;
            let label: string;
            if (row.kind === "parent") label = "↑ ..";
            else if (row.kind === "dir") label = `▸ ${row.name}/`;
            else if (row.kind === "file") label = `  ${row.name}`;
            else label = `✓ Save as ${row.name}`;
            return (
              <Box key={`${row.kind}-${row.path}`}>
                <Text
                  color={cursor ? "black" : undefined}
                  backgroundColor={cursor ? "white" : undefined}
                  dimColor={row.kind === "dir" && row.name !== ".."}
                >
                  {` ${label}`}
                </Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
