/**
 * Real tool-calling agent loop on top of the OpenCode text protocol.
 * The model emits <tool …> tags; every tag is actually executed against the
 * virtual project file system, and results are fed back until it calls `finish`.
 */
import { sendChat, type HistoryItem } from "./opencode";
import {
  ENTRY,
  extractFiles,
  missingImports,
  normalizePath,
  totalLines,
  type ProjectFiles,
} from "./files";

export type ToolName =
  | "list_files"
  | "read_file"
  | "write_file"
  | "edit_file"
  | "delete_file"
  | "check_project"
  | "finish";

export type ToolCall = {
  id: string;
  name: ToolName | string;
  args: Record<string, string>;
  status: "running" | "done" | "error";
  output?: string;
  durationMs?: number;
};

export type LoopEvent =
  | { type: "thought"; id: string; text: string }
  | { type: "tool"; call: ToolCall }
  | { type: "files"; files: ProjectFiles };

export const AGENT_SYSTEM = `You are an autonomous senior React engineer working inside a virtual project file system. You build professional MULTI-FILE React + TypeScript + Tailwind apps (8-25 focused files: src/App.tsx, src/components/*, src/components/ui/*, src/features/* or src/pages/*, src/hooks/*, src/lib/*, src/data/*, src/types.ts).

IMPORTANT: You have NO native tools, no shell and no real filesystem here. Never invoke function/tool calling. Instead you write ACTION TAGS as plain text in your final answer; the host app parses and executes them and sends you the results.
Each reply: one short sentence describing what you do next (user's language), then one or more action tags as plain text. Action tag syntax (exact):
<action name="list_files"/>
<action name="read_file" path="src/components/Navbar.tsx"/>
<action name="write_file" path="src/components/Navbar.tsx">
FULL FILE CONTENT
</action>
<action name="edit_file" path="src/App.tsx">
<<<<<<< SEARCH
exact existing lines
=======
replacement lines
>>>>>>> REPLACE
</action>
<action name="delete_file" path="src/old.tsx"/>
<action name="check_project"/>
<action name="finish">1-3 sentence summary for the user</action>

Rules:
- You will receive real tool results after each reply. Read files before editing ones you have not seen. Prefer edit_file for small changes to existing files.
- Write complete, working code: no placeholders, TODOs or ellipses. Every visible action must work (state, CRUD, forms, filters, navigation via state). Persist mock data in localStorage with guarded JSON parsing.
- src/App.tsx must export default function App(). Import local files via relative paths or the @/ alias (= src/). Never import a file you have not written. No circular imports.
- Packages: react, lucide-react (only real icon names) and browser-safe npm packages from esm.sh. No Node APIs, servers or router libraries. Styling: Tailwind utilities only. Images: real images.unsplash.com/photo-* URLs with onError fallbacks.
- Respect the user's language and RTL when appropriate; responsive mobile layout; accessible labels.
- Before finish, call check_project and fix every reported problem. Never claim work you did not do through tools.`;

const PLAIN_TEXT_PREFIX =
  "This is a standalone text answer request. There is NO repository or workspace on your side. DO NOT call any native tools, inspect directories, or write files yourself. Answer directly in your final message with plain-text <action> tags; the host executes them.";

const uid = () => Math.random().toString(36).slice(2, 10);
const TAG_RE =
  /<(tool|action)\s+name="([\w-]+)"((?:\s+[\w-]+="[^"]*")*)\s*(?:\/>|>([\s\S]*?)<\/\1>)/g;

export function parseToolCalls(content: string): {
  thought: string;
  calls: Array<{ name: string; args: Record<string, string>; body: string }>;
} {
  const calls: Array<{ name: string; args: Record<string, string>; body: string }> = [];
  for (const m of content.matchAll(TAG_RE)) {
    const args: Record<string, string> = {};
    for (const a of (m[3] ?? "").matchAll(/([\w-]+)="([^"]*)"/g)) args[a[1]!] = a[2]!;
    calls.push({ name: m[2]!, args, body: (m[4] ?? "").replace(/^\n/, "").replace(/\n$/, "") });
  }
  let thought = content.replace(TAG_RE, "").trim();
  // Fallback: a model that answers with fenced files instead of tags still gets real writes.
  if (!calls.length) {
    const fenced = extractFiles(content);
    if (fenced.files) {
      for (const [path, body] of Object.entries(fenced.files))
        calls.push({ name: "write_file", args: { path }, body });
      for (const path of fenced.deleted) calls.push({ name: "delete_file", args: { path }, body: "" });
      thought = fenced.text;
    }
  }
  return { thought, calls };
}

function applyEdit(src: string, body: string): { out: string; applied: number; failed: number } {
  const blocks = [...body.matchAll(/<{5,}\s*SEARCH\n([\s\S]*?)\n={5,}\n([\s\S]*?)\n?>{5,}\s*REPLACE/g)];
  let out = src;
  let applied = 0;
  let failed = 0;
  for (const b of blocks) {
    const search = b[1] ?? "";
    if (search && out.includes(search)) {
      out = out.replace(search, b[2] ?? "");
      applied++;
    } else failed++;
  }
  return { out, applied, failed };
}

export function checkProject(files: ProjectFiles): string[] {
  const problems: string[] = [];
  if (!files[ENTRY]) problems.push(`${ENTRY} is missing`);
  else if (!/export\s+default\s/.test(files[ENTRY])) problems.push(`${ENTRY} has no default export`);
  for (const m of missingImports(files)) problems.push(`Unresolved import: ${m}`);
  for (const [p, c] of Object.entries(files))
    if (/\/\/\s*\.\.\.|TODO|\{\/\*\s*\.\.\./.test(c)) problems.push(`${p} contains placeholder/TODO`);
  return problems;
}

type Options = {
  prompt: string;
  session: string;
  model: string;
  history: HistoryItem[];
  files: ProjectFiles;
  signal: AbortSignal;
  maxSteps?: number;
  onEvent: (e: LoopEvent) => void;
};

export async function runAgentLoop(opts: Options): Promise<{
  files: ProjectFiles;
  summary: string;
  changed: boolean;
}> {
  const files: ProjectFiles = { ...opts.files };
  let changed = false;
  const listing = Object.keys(files).length
    ? `Existing project files:\n${Object.entries(files)
        .map(([p, c]) => `- ${p} (${c.split("\n").length} lines)`)
        .join("\n")}`
    : "The project is empty.";
  const convo: HistoryItem[] = [
    ...opts.history,
    { role: "user", content: `Task: ${opts.prompt}\n\n${listing}\n\nReply now with plain-text action tags.` },
  ];
  const maxSteps = opts.maxSteps ?? 14;
  let nudges = 0;

  for (let step = 0; step < maxSteps; step++) {
    opts.signal.throwIfAborted();
    const last = convo[convo.length - 1]!;
    const res = await sendChat({
      prompt: `${PLAIN_TEXT_PREFIX}\n\n${last.content}`,
      history: convo.slice(0, -1),
      session: opts.session,
      model: opts.model,
      signal: opts.signal,
      system: AGENT_SYSTEM,
      stateless: true,
    });
    opts.signal.throwIfAborted();
    const { thought, calls } = parseToolCalls(res.content || "");
    if (thought) opts.onEvent({ type: "thought", id: uid(), text: thought });

    // Keep the model's own turn in context, but compress large file bodies.
    convo.push({
      role: "assistant",
      content: (res.content || "").replace(
        /(<(?:tool|action)\s+name="write_file"[^>]*>)([\s\S]*?)(<\/(?:tool|action)>)/g,
        (_m, a: string, body: string, c: string) => `${a}[${body.split("\n").length} lines written]${c}`,
      ),
    });

    if (!calls.length) {
      if (++nudges > 2) break;
      convo.push({
        role: "user",
        content:
          'Tool error: no tool tags found. Act only through <action name="…"> tags as specified, and call finish when done.',
      });
      continue;
    }

    const results: string[] = [];
    let finished: string | null = null;
    for (const c of calls) {
      const call: ToolCall = { id: uid(), name: c.name, args: c.args, status: "running" };
      opts.onEvent({ type: "tool", call: { ...call } });
      const t0 = performance.now();
      let output = "";
      let ok = true;
      const path = c.args["path"] ? normalizePath(c.args["path"]) : null;
      switch (c.name) {
        case "list_files":
          output = Object.keys(files).length
            ? Object.entries(files)
                .map(([p, v]) => `${p} (${v.split("\n").length} lines)`)
                .join("\n")
            : "(empty project)";
          break;
        case "read_file":
          if (path && files[path] !== undefined) output = files[path];
          else ((ok = false), (output = `File not found: ${c.args["path"] ?? ""}`));
          break;
        case "write_file":
          if (!path) ((ok = false), (output = `Invalid path: ${c.args["path"] ?? ""}`));
          else if (!c.body.trim()) ((ok = false), (output = "Empty content"));
          else {
            const existed = files[path] !== undefined;
            files[path] = c.body.trimEnd() + "\n";
            changed = true;
            output = `${existed ? "Updated" : "Created"} ${path} (${files[path].split("\n").length} lines)`;
          }
          break;
        case "edit_file":
          if (!path || files[path] === undefined)
            ((ok = false), (output = `File not found: ${c.args["path"] ?? ""}`));
          else {
            const r = applyEdit(files[path], c.body);
            if (!r.applied) ((ok = false), (output = "No SEARCH block matched; read_file first and copy exact lines."));
            else {
              files[path] = r.out;
              changed = true;
              output = `Edited ${path}: ${r.applied} change(s) applied${r.failed ? `, ${r.failed} not matched` : ""}`;
            }
          }
          break;
        case "delete_file":
          if (!path || files[path] === undefined) ((ok = false), (output = "File not found"));
          else if (path === ENTRY) ((ok = false), (output = "Cannot delete the entry file"));
          else {
            delete files[path];
            changed = true;
            output = `Deleted ${path}`;
          }
          break;
        case "check_project": {
          const problems = checkProject(files);
          output = problems.length
            ? `${problems.length} problem(s):\n${problems.join("\n")}`
            : `OK — ${Object.keys(files).length} files, ${totalLines(files)} lines, all imports resolve.`;
          ok = !problems.length;
          break;
        }
        case "finish": {
          const problems = checkProject(files);
          if (problems.length) {
            ok = false;
            output = `Cannot finish yet:\n${problems.join("\n")}`;
          } else {
            finished = c.body.trim() || "تم.";
            output = "Finished";
          }
          break;
        }
        default:
          ok = false;
          output = `Unknown tool: ${c.name}`;
      }
      const done: ToolCall = {
        ...call,
        status: ok ? "done" : "error",
        output: output.length > 4000 ? output.slice(0, 4000) + "\n…" : output,
        durationMs: performance.now() - t0,
      };
      opts.onEvent({ type: "tool", call: done });
      results.push(`[${c.name}${c.args["path"] ? ` ${c.args["path"]}` : ""}] ${ok ? "ok" : "error"}\n${output}`);
    }
    if (changed) opts.onEvent({ type: "files", files: { ...files } });
    if (finished !== null) return { files, summary: finished, changed };
    convo.push({ role: "user", content: `Tool results:\n\n${results.join("\n\n")}\n\nContinue: reply with plain-text action tags (finish when done). });
  }
  const problems = checkProject(files);
  if (!changed) throw new Error("لم ينفّذ الوكيل أي تعديل على الملفات؛ أعد المحاولة.");
  if (problems.length) throw new Error(`توقف الوكيل قبل إصلاح المشاكل:\n${problems.slice(0, 6).join("\n")}`);
  return { files, summary: "انتهت خطوات الوكيل.", changed };
}
