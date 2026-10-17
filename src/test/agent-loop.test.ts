import { describe, expect, it } from "vitest";
import { checkProject, parseToolCalls } from "@/lib/agent-loop";

describe("agent tool calls", () => {
  it("parses self-closing and body tool tags", () => {
    const r = parseToolCalls(
      'Creating files.\n<tool name="list_files"/>\n<tool name="write_file" path="src/App.tsx">\nexport default function App(){return null}\n</tool>',
    );
    expect(r.thought).toBe("Creating files.");
    expect(r.calls.map((c) => c.name)).toEqual(["list_files", "write_file"]);
    expect(r.calls[1]!.args["path"]).toBe("src/App.tsx");
    expect(r.calls[1]!.body).toBe("export default function App(){return null}");
  });
  it("blocks finishing while imports are unresolved", () => {
    expect(checkProject({ "src/App.tsx": 'import X from "./X";\nexport default function App(){}' })).toEqual([
      "Unresolved import: src/App.tsx → ./X",
    ]);
  });
});
