/**
 * Browser stand-in for `node:path` (FEAT-175).
 *
 * Only the POSIX surface used by transitive dependencies (`stack-utils`,
 * `es-toolkit`) is implemented. Project code never imports this: it uses
 * `@/runtime/paths`, which is platform-free.
 */

export const sep = "/";
export const delimiter = ":";
export const posix = { sep, delimiter };

export function join(...parts: string[]): string {
  return normalize(parts.filter(Boolean).join("/"));
}

export function resolve(...parts: string[]): string {
  const joined = parts.filter(Boolean).join("/");
  return joined.startsWith("/") ? normalize(joined) : normalize(`/${joined}`);
}

export function normalize(input: string): string {
  const isAbsolute = input.startsWith("/");
  const out: string[] = [];
  for (const part of input.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  const result = out.join("/");
  if (isAbsolute) return `/${result}`;
  return result;
}

export function dirname(input: string): string {
  const index = input.lastIndexOf("/");
  if (index < 0) return ".";
  if (index === 0) return "/";
  return input.slice(0, index);
}

export function basename(input: string, ext?: string): string {
  const name = input.slice(input.lastIndexOf("/") + 1);
  if (ext && name.endsWith(ext)) return name.slice(0, -ext.length);
  return name;
}

export function extname(input: string): string {
  const name = basename(input);
  const index = name.lastIndexOf(".");
  if (index <= 0) return "";
  return name.slice(index);
}

export function isAbsolute(input: string): boolean {
  return input.startsWith("/");
}

export function relative(from: string, to: string): string {
  const fromParts = normalize(from).split("/").filter(Boolean);
  const toParts = normalize(to).split("/").filter(Boolean);
  let shared = 0;
  while (
    shared < fromParts.length &&
    shared < toParts.length &&
    fromParts[shared] === toParts[shared]
  ) {
    shared += 1;
  }
  return [
    ...fromParts.slice(shared).map(() => ".."),
    ...toParts.slice(shared),
  ].join("/");
}

export function parse(input: string) {
  const dir = dirname(input);
  const base = basename(input);
  const ext = extname(input);
  return {
    root: input.startsWith("/") ? "/" : "",
    dir,
    base,
    ext,
    name: ext ? base.slice(0, -ext.length) : base,
  };
}

export function format(parsed: {
  dir?: string;
  root?: string;
  base?: string;
  name?: string;
  ext?: string;
}): string {
  const base = parsed.base ?? `${parsed.name ?? ""}${parsed.ext ?? ""}`;
  if (parsed.dir) return join(parsed.dir, base);
  if (parsed.root) return join(parsed.root, base);
  return base;
}

export default {
  sep,
  delimiter,
  posix,
  join,
  resolve,
  normalize,
  dirname,
  basename,
  extname,
  isAbsolute,
  relative,
  parse,
  format,
};
