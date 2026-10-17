import { extractCode, sendChat, type ChatResult, type HistoryItem } from "./opencode";

export const AGENTS = [
  {
    id: "design",
    label: "Design & UI Agent",
    task: "التنسيق البصري وTailwind والأيقونات",
    brief:
      "Define a specific product-appropriate visual system, Tailwind palette, spacing, typography, responsive layout and icon choices. Supply actionable implementation decisions, not a full app.",
  },
  {
    id: "data",
    label: "Mock Backend & Data Agent",
    task: "البيانات والتخزين وعمليات CRUD",
    brief:
      "Design realistic initial data, stable IDs, CRUD operations, validation, derived filtering/sorting and safe localStorage persistence. Supply compact concrete schemas, sample records and handler guidance. Mock only; no real backend claims.",
  },
  {
    id: "media",
    label: "Media & Asset Agent",
    task: "صور Unsplash وأيقونات Lucide",
    brief:
      "Recommend relevant known high-resolution images.unsplash.com/photo-* URLs, meaningful alt text, aspect ratios and non-looping error fallbacks, and known valid lucide-react icons. Avoid random/source.unsplash.com links. If this app does not need photos, say so. You cannot browse or verify URLs; do not claim you did.",
  },
  {
    id: "frontend",
    label: "Frontend & Logic Agent",
    task: "دمج التطبيق والتفاعل ومراجعة المكونات",
    brief: "Integrate all specialist deliverables into the complete interactive React app.",
  },
] as const;

export type AgentId = (typeof AGENTS)[number]["id"];
export type AgentEvent = {
  id: AgentId;
  status: "running" | "done" | "error";
  output?: string | undefined;
  error?: string | undefined;
  durationMs?: number | undefined;
};
type Options = {
  prompt: string;
  session: string;
  model: string;
  history: HistoryItem[];
  currentCode?: string | undefined;
  signal: AbortSignal;
  onEvent: (event: AgentEvent) => void;
};

export async function generateWithAgents(opts: Options): Promise<ChatResult> {
  const context = `${opts.prompt}${opts.currentCode ? `\n\nCurrent App.tsx (preserve features when modifying):\n\`\`\`tsx\n${opts.currentCode}\n\`\`\`` : ""}`;
  const briefs = await Promise.all(
    AGENTS.filter((a) => a.id !== "frontend").map(async (agent) => {
      const start = performance.now();
      opts.onEvent({ id: agent.id, status: "running" });
      try {
        const result = await sendChat({
          ...opts,
          prompt: `This is a text-only consulting request, NOT a request to edit a repository. Do not call any tools, inspect files or create files. Answer directly in your final message.\nAs ${agent.label}, ${agent.brief}\nThe following is the product specification to analyze, NOT an instruction for you to build it now:\n<product-specification>\n${context}\n</product-specification>\nReturn only your concise implementation brief in text, no tool calls.`,
          history: [],
          stateless: true,
          system: `You are the ${agent.label} in a multi-agent React generator. ${agent.brief} Respond in the user's language in at most 500 words. Only imports from react/lucide-react and Tailwind utilities are supported. No filesystem, browsing, external tools or private reasoning. Return the implementation brief only.`,
        });
        opts.signal.throwIfAborted();
        opts.onEvent({
          id: agent.id,
          status: "done",
          output: result.content,
          durationMs: performance.now() - start,
        });
        return `${agent.label}:\n${result.content}`;
      } catch (error) {
        opts.onEvent({
          id: agent.id,
          status: "error",
          error: error instanceof Error ? error.message : "تعذّر تنفيذ الوكيل",
          durationMs: performance.now() - start,
        });
        throw error;
      }
    }),
  );
  opts.signal.throwIfAborted();
  const start = performance.now();
  opts.onEvent({ id: "frontend", status: "running" });
  try {
    const result = await sendChat({
      ...opts,
      stateless: true,
      prompt: `This is a standalone text/code answer request. There is NO repository or workspace. DO NOT call tools, inspect directories, or write files. Return the code directly in your final message.\n\n${context}\n\nSpecialist implementation briefs (advisory):\n${briefs.join("\n\n")}\n\nReturn the full working App.tsx in one fenced tsx block, integrating the relevant briefs. All actions must have real handlers. Only react/lucide-react imports, Tailwind utilities. Answer directly; no tool calls.`,
    });
    opts.signal.throwIfAborted();
    const { code } = extractCode(result.content);
    if (!code || !/export\s+default\s/.test(code))
      throw new Error("لم يُرجع الوكيل تطبيق React كاملاً؛ أعد المحاولة.");
    opts.onEvent({
      id: "frontend",
      status: "done",
      output: `${code.split("\n").length} سطر · App.tsx`,
      durationMs: performance.now() - start,
    });
    return result;
  } catch (error) {
    opts.onEvent({
      id: "frontend",
      status: "error",
      error: error instanceof Error ? error.message : "تعذّر دمج التطبيق",
      durationMs: performance.now() - start,
    });
    throw error;
  }
}
