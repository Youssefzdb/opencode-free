import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchModels, normalizeModelReport, sendChat } from "@/lib/opencode";
import { generateWithAgents } from "@/lib/agents";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("confirmed live models", () => {
  it("excludes unavailable, empty, overloaded and deprecated models even with HTTP 200", () => {
    const report = normalizeModelReport({
      tested_at: "2026-10-17T17:40:17.762Z",
      results: [
        { model: "beam-free", ok: true, content: "hello" },
        { model: "glm-5-free", ok: false, error: "unavailable" },
        { model: "nemotron-3-ultra-free", ok: false, gateway_status: 200, error: "overloaded" },
        { model: "ll-alpha-free", ok: false, error: "deprecated" },
        { model: "empty", ok: true, content: " " },
        { model: "contradictory", ok: true, content: "hello", error: "failed" },
      ],
    });
    expect(report.models.map((m) => m.id)).toEqual(["beam-free"]);
  });

  it("never treats an untested catalog as confirmation", () => {
    expect(() => normalizeModelReport({ models: [{ id: "beam-free" }] })).toThrow();
  });

  it("refresh uses POST opencodeTestModels and excludes catalog-only models", async () => {
    const mock = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            url.endsWith("opencodeTestModels")
              ? {
                  tested_at: "2026-10-17T17:40:17.762Z",
                  tested: 2,
                  results: [{ model: "beam-free", ok: true, content: "hello" }],
                }
              : {
                  models: [
                    { id: "beam-free", name: "Beam Free" },
                    { id: "broken", name: "Broken" },
                  ],
                },
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", mock);
    const report = await fetchModels();
    expect(mock.mock.calls[0]?.[0]).toContain("opencodeTestModels");
    expect(report.models.map((m) => m.id)).toEqual(["beam-free"]);
    expect(report.models[0]?.name).toBe("Beam Free");
  });

  it("retries the selected confirmed model without silently switching to an untested fallback", async () => {
    const bodies: { model: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ content: bodies.length === 1 ? "" : "ready" }), {
          status: 200,
        });
      }),
    );
    await sendChat({
      prompt: "test",
      model: "cat-jam-free",
      session: "test",
      history: [],
      stateless: true,
    });
    expect(bodies.map((b) => b.model)).toEqual(["cat-jam-free", "cat-jam-free"]);
  });
});

describe("actual multi-agent execution", () => {
  it("executes three specialists before frontend integration with all briefs", async () => {
    const prompts: { system: string; messages: { content: string }[] }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        prompts.push(body);
        const content = body.system.includes("final integrator")
          ? "Built.\n```tsx\nexport default function App(){return <button>Save</button>}\n```"
          : `Brief ${prompts.length}`;
        return new Response(JSON.stringify({ content }), { status: 200 });
      }),
    );
    const events: string[] = [];
    await generateWithAgents({
      prompt: "Build CRUD",
      session: "test",
      model: "beam-free",
      history: [],
      signal: new AbortController().signal,
      onEvent: (e) => events.push(`${e.id}:${e.status}`),
    });
    expect(prompts).toHaveLength(4);
    expect(events.filter((e) => e.endsWith(":done"))).toEqual([
      "design:done",
      "data:done",
      "media:done",
      "frontend:done",
    ]);
    expect(events.indexOf("frontend:running")).toBeGreaterThan(events.indexOf("media:done"));
    expect(prompts[3]?.messages[0]?.content).toContain("Brief 1");
    expect(prompts[3]?.messages[0]?.content).toContain("Brief 2");
    expect(prompts[3]?.messages[0]?.content).toContain("Brief 3");
  });
});
