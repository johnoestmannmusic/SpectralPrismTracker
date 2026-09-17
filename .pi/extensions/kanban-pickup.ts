/**
 * kanban-pickup — move a KANBAN.md card into a bin (default: In Progress).
 *
 * Purpose: whenever the agent starts work on a feature/bug card, it should
 * call `kanban_pickup` with that card's id so the board reflects reality
 * without a separate manual `kanban_manage` move. The tool edits the same
 * `KANBAN.md` the KANBAN-MANAGE tool owns, preserving the canonical layout:
 *
 *   # Project Kanban
 *
 *   ## Features
 *
 *   ### FEAT-1 — Title
 *   - priority: ...
 *
 *   ## In Progress
 *   ...
 *
 * Cards are moved to the *top* of the target bin and their `updated:` date is
 * stamped, matching KANBAN-MANAGE's behaviour.
 */

import {
  type ExtensionAPI,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const BINS = [
  "Features",
  "Bugs",
  "In Progress",
  "Blocked",
  "Implemented",
  "Archived",
] as const;

type Bin = (typeof BINS)[number];

const BIN_HEADER =
  /^##\s+(Features|Bugs|In Progress|Blocked|Implemented|Archived)\s*$/;
const CARD_HEADER = /^###\s+(\S+)\s+—/;

/** Accepts "in progress", "in-progress", "progress", "wip", etc. */
function normalizeBin(input: string | undefined): Bin {
  const raw = (input ?? "In Progress")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");
  const aliases: Record<string, Bin> = {
    feature: "Features",
    features: "Features",
    bug: "Bugs",
    bugs: "Bugs",
    "in progress": "In Progress",
    inprogress: "In Progress",
    progress: "In Progress",
    wip: "In Progress",
    active: "In Progress",
    blocked: "Blocked",
    implemented: "Implemented",
    done: "Implemented",
    archived: "Archived",
    archive: "Archived",
  };
  const normalized = aliases[raw];
  if (!normalized) {
    throw new Error(
      `Unknown bin "${input}". Expected one of: ${BINS.join(", ")}`,
    );
  }
  return normalized;
}

function today(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function trimTrailingBlanks(lines: string[]): string[] {
  const out = lines.slice();
  while (out.length > 1 && out[out.length - 1]!.trim() === "") out.pop();
  return out;
}

interface ParsedBoard {
  preamble: string[];
  bins: Record<Bin, string[][]>;
}

function parseBoard(lines: string[]): ParsedBoard {
  const headers: Array<{ name: Bin; index: number }> = [];
  lines.forEach((line, index) => {
    const match = BIN_HEADER.exec(line);
    if (match) headers.push({ name: match[1] as Bin, index });
  });
  if (headers.length === 0) {
    throw new Error(
      "KANBAN.md has no bin headers (## Features, ## In Progress, ...)",
    );
  }

  const preamble = lines.slice(0, headers[0]!.index);
  const bins = Object.fromEntries(
    BINS.map((bin) => [bin, [] as string[][]]),
  ) as Record<Bin, string[][]>;

  headers.forEach((header, position) => {
    const end =
      position + 1 < headers.length
        ? headers[position + 1]!.index
        : lines.length;
    let current: string[] | null = null;
    for (const line of lines.slice(header.index + 1, end)) {
      if (/^###\s/.test(line)) {
        if (current) bins[header.name].push(current);
        current = [line];
      } else if (current) {
        current.push(line);
      }
    }
    if (current) bins[header.name].push(current);
  });

  return { preamble, bins };
}

function serializeBoard(board: ParsedBoard): string {
  const out = trimTrailingBlanks(board.preamble);
  out.push("");
  for (const bin of BINS) {
    out.push(`## ${bin}`);
    out.push("");
    for (const card of board.bins[bin]) {
      out.push(...trimTrailingBlanks(card));
      out.push("");
    }
  }
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out.join("\n") + "\n";
}

function stampUpdated(card: string[]): string[] {
  const updated = `- updated: ${today()}`;
  const index = card.findIndex((line) => /^- updated:/.test(line));
  if (index >= 0) {
    const next = card.slice();
    next[index] = updated;
    return next;
  }
  const createdIndex = card.findIndex((line) => /^- created:/.test(line));
  const next = card.slice();
  next.splice(createdIndex >= 0 ? createdIndex + 1 : 1, 0, updated);
  return next;
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "kanban_pickup",
    label: "Kanban Pickup",
    description:
      "Move a KANBAN.md card into a bin (default: In Progress) and stamp its updated date. " +
      "Call this when starting work on a feature or bug card so the board is accurate.",
    promptSnippet:
      "Move a KANBAN.md card to In Progress when you start working on it (before implementation)",
    promptGuidelines: [
      "Call kanban_pickup with a card's id (e.g. FEAT-13) as the first action when you start work on that feature or bug, so KANBAN.md shows it as In Progress; kanban_manage remains the tool for creating, editing, and completing cards.",
    ],
    parameters: Type.Object({
      id: Type.String({
        description: "Card id to pick up, e.g. FEAT-13 or BUG-2.",
      }),
      to: Type.Optional(
        StringEnum(BINS, {
          description: "Bin to move the card into. Defaults to In Progress.",
        }),
      ),
      path: Type.Optional(
        Type.String({
          description:
            "Path to the kanban file. Defaults to KANBAN.md in the cwd.",
        }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const target = normalizeBin(params.to);
      const rawPath = (params.path ?? "KANBAN.md").replace(/^@/, "");
      const absolutePath = resolve(ctx.cwd, rawPath);

      return withFileMutationQueue(absolutePath, async () => {
        let contents: string;
        try {
          contents = await readFile(absolutePath, "utf8");
        } catch {
          throw new Error(`Kanban file not found: ${absolutePath}`);
        }

        const board = parseBoard(contents.split("\n"));
        const wanted = params.id.trim().toUpperCase();

        let source: Bin | null = null;
        let index = -1;
        outer: for (const bin of BINS) {
          const cards = board.bins[bin];
          for (let i = 0; i < cards.length; i++) {
            const match = CARD_HEADER.exec(cards[i]![0]!);
            if (match && match[1]!.toUpperCase() === wanted) {
              source = bin;
              index = i;
              break outer;
            }
          }
        }
        if (!source)
          throw new Error(`Card ${params.id} not found in ${rawPath}`);

        const card = stampUpdated(board.bins[source]![index]!);
        if (source !== target) {
          board.bins[source]!.splice(index, 1);
          board.bins[target]!.unshift(card);
        } else {
          board.bins[source]![index] = card;
        }

        const next = serializeBoard(board);
        if (next !== contents) await writeFile(absolutePath, next, "utf8");

        const text =
          source === target
            ? `${wanted} is already in ${target}; refreshed its updated date.`
            : `Moved ${wanted} from ${source} to ${target}.`;
        return {
          content: [{ type: "text", text }],
          details: { id: wanted, from: source, to: target },
        };
      });
    },
  });
}
