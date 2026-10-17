/** Virtual project file system helpers: parse multi-file AI output and serialize it back. */
export type ProjectFiles = Record<string, string>;
export const ENTRY = "src/App.tsx";

const PATH_RE = /^[\w@.-]+(?:\/[\w@.-]+)*\.(?:tsx|ts|jsx|js|css|json)$/;

export function normalizePath(raw: string): string | null {
  let p = raw.trim().replace(/^["'`]|["'`]$/g, "").replace(/\\/g, "/");
  p = p.replace(/^\.?\//, "");
  if (!p.startsWith("src/")) p = `src/${p}`;
  if (p.includes("..") || p.length > 160 || !PATH_RE.test(p)) return null;
  return p;
}

/**
 * Extracts every fenced code block that names a file, e.g.
 * ```tsx src/components/Navbar.tsx   or   ```tsx file="src/x.ts"   or a first-line `// file: path`.
 * Falls back to a single unnamed block as src/App.tsx.
 */
export function extractFiles(content: string): {
  text: string;
  files: ProjectFiles | null;
  deleted: string[];
} {
  const re = /```([^\n`]*)\n([\s\S]*?)```/g;
  const files: ProjectFiles = {};
  const deleted: string[] = [];
  let firstUnnamed: string | null = null;
  let text = content;
  for (const m of content.matchAll(re)) {
    const info = (m[1] ?? "").trim();
    let body = m[2] ?? "";
    let path: string | null = null;
    const del = info.match(/^\w*\s*DELETE\s+(\S+)/i);
    if (del?.[1]) {
      const p = normalizePath(del[1]);
      if (p) deleted.push(p);
      text = text.replace(m[0], "");
      continue;
    }
    const fromInfo = info.match(/(?:file(?:name)?=|path=)?["']?([\w@./-]+\.(?:tsx|ts|jsx|js|css|json))["']?/);
    if (fromInfo?.[1]) path = normalizePath(fromInfo[1]);
    if (!path) {
      const head = body.match(/^\s*(?:\/\/|\/\*)\s*(?:file|path)\s*:\s*([\w@./-]+)\s*(?:\*\/)?\s*\n/i);
      if (head?.[1]) {
        path = normalizePath(head[1]);
        if (path) body = body.slice(head[0].length);
      }
    }
    text = text.replace(m[0], "");
    if (path) files[path] = body.trim() + "\n";
    else if (firstUnnamed === null && /^(tsx|jsx|ts|typescript|js|javascript|react)?$/i.test(info))
      firstUnnamed = body.trim() + "\n";
  }
  if (!files[ENTRY] && firstUnnamed) files[ENTRY] = firstUnnamed;
  return { text: text.trim(), files: Object.keys(files).length ? files : null, deleted };
}

/** Applies changed files and deletions on top of the previous project. */
export function mergeFiles(base: ProjectFiles, changed: ProjectFiles, deleted: string[] = []) {
  const next: ProjectFiles = { ...base, ...changed };
  for (const p of deleted) if (p !== ENTRY) delete next[p];
  return next;
}

/** Lists local imports that do not resolve to a project file. */
export function missingImports(files: ProjectFiles): string[] {
  const missing: string[] = [];
  const exts = ["", ".tsx", ".ts", ".jsx", ".js", "/index.tsx", "/index.ts"];
  for (const [path, src] of Object.entries(files)) {
    for (const m of src.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']((?:\.{1,2}\/|@\/)[^"']+)["']/g)) {
      const spec = m[1]!;
      let base: string;
      if (spec.startsWith("@/")) base = "src/" + spec.slice(2);
      else {
        const parts = path.split("/");
        parts.pop();
        for (const seg of spec.split("/")) {
          if (seg === "." || !seg) continue;
          if (seg === "..") parts.pop();
          else parts.push(seg);
        }
        base = parts.join("/");
      }
      if (!exts.some((e) => files[base + e] !== undefined)) missing.push(`${path} → ${spec}`);
    }
  }
  return missing;
}

export function serializeFiles(files: ProjectFiles): string {
  return Object.entries(files)
    .map(([p, c]) => `\`\`\`${p.split(".").pop()} ${p}\n${c.trimEnd()}\n\`\`\``)
    .join("\n\n");
}

export function totalLines(files: ProjectFiles): number {
  return Object.values(files).reduce((n, c) => n + c.split("\n").length, 0);
}
