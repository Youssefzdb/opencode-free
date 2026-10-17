import { describe, expect, it } from "vitest";
import { extractFiles, mergeFiles, missingImports } from "@/lib/files";

describe("multi-file projects", () => {
  it("parses one fenced block per file path", () => {
    const r = extractFiles(
      "Done.\n```tsx src/App.tsx\nexport default function App(){}\n```\n```tsx src/components/Hero.tsx\nexport default 1\n```",
    );
    expect(Object.keys(r.files!)).toEqual(["src/App.tsx", "src/components/Hero.tsx"]);
    expect(r.text).toBe("Done.");
  });
  it("keeps unchanged files and applies deletions on edit", () => {
    const next = mergeFiles({ "src/App.tsx": "a", "src/x.ts": "x", "src/y.ts": "y" }, { "src/x.ts": "x2" }, ["src/y.ts"]);
    expect(next).toEqual({ "src/App.tsx": "a", "src/x.ts": "x2" });
  });
  it("reports imports that point to missing files", () => {
    expect(missingImports({ "src/App.tsx": 'import A from "./components/A";\nimport B from "@/lib/b";', "src/lib/b.ts": "" })).toEqual([
      "src/App.tsx → ./components/A",
    ]);
  });
});
