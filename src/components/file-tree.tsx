import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

type Node = { name: string; path: string; children?: Node[] };

function buildTree(paths: string[]): Node[] {
  const root: Node = { name: "", path: "", children: [] };
  for (const p of [...paths].sort()) {
    let cur = root;
    p.split("/").forEach((part, i, arr) => {
      const path = arr.slice(0, i + 1).join("/");
      const isFile = i === arr.length - 1;
      let next = cur.children!.find((c) => c.name === part);
      if (!next) {
        next = isFile ? { name: part, path } : { name: part, path, children: [] };
        cur.children!.push(next);
      }
      cur = next;
    });
  }
  const sort = (nodes: Node[]): Node[] =>
    nodes
      .sort((a, b) => Number(!!b.children) - Number(!!a.children) || a.name.localeCompare(b.name))
      .map((n) => (n.children ? { ...n, children: sort(n.children) } : n));
  return sort(root.children!);
}

export function FileTree({
  files,
  active,
  onSelect,
}: {
  files: Record<string, string>;
  active: string;
  onSelect: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(Object.keys(files)), [files]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (p: string) =>
    setClosed((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const render = (nodes: Node[], depth: number) =>
    nodes.map((n) =>
      n.children ? (
        <div key={n.path}>
          <button
            onClick={() => toggle(n.path)}
            className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
            style={{ paddingLeft: 6 + depth * 12 }}
          >
            {closed.has(n.path) ? (
              <ChevronRight className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
            {closed.has(n.path) ? (
              <Folder className="size-3.5 text-primary/70" />
            ) : (
              <FolderOpen className="size-3.5 text-primary/70" />
            )}
            {n.name}
          </button>
          {!closed.has(n.path) && render(n.children, depth + 1)}
        </div>
      ) : (
        <button
          key={n.path}
          onClick={() => onSelect(n.path)}
          className={cn(
            "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left font-mono text-xs",
            active === n.path
              ? "bg-primary/15 text-primary"
              : "text-foreground/80 hover:bg-muted",
          )}
          style={{ paddingLeft: 20 + depth * 12 }}
        >
          <FileCode2 className="size-3.5 shrink-0" />
          <span className="truncate">{n.name}</span>
        </button>
      ),
    );

  return (
    <nav
      aria-label="ملفات المشروع"
      className="w-56 shrink-0 overflow-auto border-r border-border bg-card/40 p-1.5"
    >
      {render(tree, 0)}
    </nav>
  );
}
