import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const PathSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^src\/[\w@.-]+(?:\/[\w@.-]+)*\.(?:tsx|ts|jsx|js|css|json)$/, "invalid path")
  .refine((p) => !p.includes(".."), "invalid path");

const BodySchema = z.object({
  project: z.string().regex(/^[\w-]{1,64}$/).default("default"),
  mode: z.enum(["replace", "merge"]).default("merge"),
  message: z.string().max(2000).default(""),
  files: z.record(PathSchema, z.string().max(300_000)).refine((f) => Object.keys(f).length <= 300),
  delete: z.array(PathSchema).max(300).default([]),
});

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(request: Request) {
  const token = process.env["BRIDGE_TOKEN"];
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(token && given && safeEqual(given, token));
}

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: CORS });

export const Route = createFileRoute("/api/public/bridge")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
        const project = new URL(request.url).searchParams.get("project") ?? "default";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("bridge_projects")
          .select("files, revision, updated_at")
          .eq("id", project)
          .maybeSingle();
        return json(data ?? { files: {}, revision: 0 });
      },
      POST: async ({ request }) => {
        if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const parsed = BodySchema.safeParse(raw);
        if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
        const body = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existing } = await supabaseAdmin
          .from("bridge_projects")
          .select("files, revision")
          .eq("id", body.project)
          .maybeSingle();
        const base =
          body.mode === "merge" && existing?.files && typeof existing.files === "object"
            ? (existing.files as Record<string, string>)
            : {};
        const files: Record<string, string> = { ...base, ...body.files };
        for (const p of body.delete) delete files[p];
        if (!files["src/App.tsx"])
          return json({ error: "Project must contain src/App.tsx" }, 400);
        const revision = (existing?.revision ?? 0) + 1;
        const { error } = await supabaseAdmin.from("bridge_projects").upsert({
          id: body.project,
          files,
          message: body.message,
          revision,
          updated_at: new Date().toISOString(),
        });
        if (error) return json({ error: "Save failed" }, 500);
        return json({ ok: true, project: body.project, revision, files: Object.keys(files) });
      },
    },
  },
});
