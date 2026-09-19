import { Box, Text, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import type { DirectoryEntry } from "@/host/types";
import { dirname, isProjectPath } from "@/runtime/paths";
import { isCancel, isConfirm } from "../keys";
import { MarqueeText } from "./Marquee";
import type { Session } from "../session";

interface Props {
  session: Session;
  active: boolean;
  onClose: () => void;
  /** Called with the chosen project path (host runs `/open`). */
  onOpen: (path: string) => void;
  /** Rows available to the overlay. */
  height: number;
  /** Columns available (for the breadcrumb marquee). */
  width?: number;
}

interface Row extends DirectoryEntry {
  isParent?: boolean;
}

/**
 * Project file picker (FEAT-155): a navigable directory tree filtered to
 * project files. Directories, a `..` row and the current path are always shown;
 * regular files are hidden unless they are `.sptproj` (or a legacy project).
 * Pure listing logic lives in {@link pickableEntries} so it is unit-testable.
 */
export function pickableEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return entries.filter(
    (entry) =>
      entry.isDirectory ||
      (!entry.name.startsWith(".") && isProjectPath(entry.path)),
  );
}

export function FilePicker({
  session,
  active,
  onClose,
  onOpen,
  height,
  width = 100,
}: Props) {
  const [directory, setDirectory] = useState<string>(() => {
    const projectPath = session.getState().projectPath;
    if (projectPath) {
      const dir = dirname(projectPath);
      if (dir) return dir;
    }
    return session.host.fs.resolvePath(".");
  });
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
      setEntries(pickableEntries(listing));
      setSelected(0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [directory, session]);

  const rows: Row[] = useMemo(() => {
    const list: Row[] = [];
    if (parent)
      list.push({
        name: "..",
        path: parent,
        isDirectory: true,
        isParent: true,
      });
    list.push(...entries);
    return list;
  }, [parent, entries]);

  const clamped = Math.min(Math.max(selected, 0), Math.max(rows.length - 1, 0));
  const visible = Math.max(3, height - 6);
  let start = 0;
  if (clamped >= visible) start = clamped - visible + 1;
  start = Math.min(start, Math.max(0, rows.length - visible));
  const window = rows.slice(start, start + visible);

  const choose = (row: Row | undefined, forceParent = false) => {
    if (!row) return;
    if (forceParent || row.isParent || row.isDirectory) {
      setDirectory(row.path);
      return;
    }
    onOpen(row.path);
  };

  useInput(
    (char, key) => {
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
      if (key.rightArrow && rows[clamped]?.isDirectory) {
        setDirectory(rows[clamped]!.path);
        return;
      }
      if (isConfirm(char, key)) {
        choose(rows[clamped]);
      }
    },
    { isActive: active },
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      paddingX={1}
      flexGrow={1}
    >
      <Text bold color="cyan">
        Open project
      </Text>
      <Text dimColor wrap="truncate-end">
        <Text color="green">dir:</Text>{" "}
        <MarqueeText
          dimColor
          width={Math.max(10, width - 8)}
          text={directory}
        />
      </Text>
      <Text dimColor wrap="truncate-end">
        ↑↓ select · enter/→ open · ←/backspace up · z open · x/esc cancel · only
        .sptproj files shown
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
          <Text dimColor>(no project files here — press ← to go up)</Text>
        ) : (
          window.map((row, offset) => {
            const index = start + offset;
            const cursor = index === clamped;
            const label = row.isDirectory ? (row.isParent ? "↑ .." : "▸") : " ";
            return (
              <Box key={`${row.path}-${row.isParent ? ".." : ""}`}>
                <Text
                  color={cursor ? "black" : undefined}
                  backgroundColor={cursor ? "white" : undefined}
                  dimColor={row.isDirectory && !row.isParent}
                >
                  {` ${label} ${row.name}${row.isDirectory && !row.isParent ? "/" : ""}`}
                </Text>
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
