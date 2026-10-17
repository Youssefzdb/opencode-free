import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Tool, ToolHeader, ToolContent } from "@/components/ai-elements/tool";
import { Button } from "@/components/ui/button";
import JSZip from "jszip";
import {
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  Loader2,
  Monitor,
  RotateCcw,
  Smartphone,
  SquarePen,
  Tablet,
  TriangleAlert,
  Wand2,
  Hexagon,
  History,
  Square,
} from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DEFAULT_MODEL,
  clearSession,
  extractCode,
  fetchModels,
  loadConfirmedModels,
  type ModelInfo,
} from "@/lib/opencode";
import { AGENTS, generateWithAgents, type AgentEvent } from "@/lib/agents";
import { buildPreviewHtml, buildProjectFiles } from "@/lib/preview";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vibe Studio — مولّد تطبيقات React بالذكاء الاصطناعي" },
      {
        name: "description",
        content: "صف واجهتك واحصل على تطبيق React و Tailwind جاهز مع معاينة حية فورية.",
      },
      { property: "og:title", content: "Vibe Studio — مولّد تطبيقات React بالذكاء الاصطناعي" },
      {
        property: "og:description",
        content: "صف واجهتك واحصل على تطبيق React و Tailwind جاهز مع معاينة حية فورية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Studio,
});

type StepStatus = "pending" | "running" | "done" | "error";
type Step = {
  id: string;
  kind: "think" | "file" | "render";
  label: string;
  detail?: string;
  status: StepStatus;
};
type Msg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  reasoning?: string | undefined;
  steps?: Step[] | undefined;
  version?: number | undefined;
  thinkMs?: number | undefined;
  error?: string | undefined;
  agents?: AgentEvent[] | undefined;
};
type Version = { n: number; code: string; prompt: string };
type Device = "desktop" | "tablet" | "mobile";

const uid = () => Math.random().toString(36).slice(2, 10);
const newSession = () => `vibe-${uid()}${uid()}`;

const SUGGESTIONS = [
  "لوحة تحكم تحليلات مبيعات بمخططات وبطاقات إحصائية",
  "صفحة هبوط لتطبيق لياقة بدنية بتصميم جريء",
  "تطبيق قائمة مهام مع فلاتر وسحب الأولوية",
  "بطاقات تسعير ثلاثية مع مفتاح شهري/سنوي",
];

function Studio() {
  const [session, setSession] = useState(newSession);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [versions, setVersions] = useState<Version[]>([]);
  const [activeV, setActiveV] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState("");
  const [modelError, setModelError] = useState("");
  const modelAbortRef = useRef<AbortController | null>(null);
  const [view, setView] = useState<"preview" | "code">("preview");
  const [device, setDevice] = useState<Device>("desktop");
  const [reloadKey, setReloadKey] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const previewMsgRef = useRef<string | null>(null);
  const storageRef = useRef<Record<string, string>>({});

  useEffect(() => {
    const report = loadConfirmedModels();
    setModels(report.models);
    setCheckedAt(report.testedAt);
    setModel(report.models.find((m) => m.id === DEFAULT_MODEL)?.id ?? report.models[0]?.id ?? "");
    taRef.current?.focus();
    return () => {
      modelAbortRef.current?.abort();
      abortRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const current = versions.find((v) => v.n === activeV) ?? null;
  const html = useMemo(
    () => (current ? buildPreviewHtml(current.code, storageRef.current) : ""),
    // Reload intentionally captures the latest bridged storage without rebuilding on each write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, reloadKey],
  );

  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.source !== iframeRef.current?.contentWindow ||
        !event.data ||
        typeof event.data !== "object"
      )
        return;
      if (event.data.type === "vibe-storage") {
        const values = event.data.values;
        if (!values || typeof values !== "object" || Array.isArray(values)) return;
        const entries = Object.entries(values);
        if (
          entries.length > 500 ||
          entries.some(([k, v]) => k.length > 200 || typeof v !== "string") ||
          JSON.stringify(values).length > 2000000
        )
          return;
        storageRef.current = Object.fromEntries(entries) as Record<string, string>;
        try {
          localStorage.setItem(`vibe-mock:${session}`, JSON.stringify(storageRef.current));
        } catch {
          // Keep working in memory when the browser blocks storage.
        }
      }
      const id = previewMsgRef.current;
      if (!id) return;
      if (event.data.type === "vibe-preview-ready") {
        setMessages((ms) =>
          ms.map((m) =>
            m.id === id
              ? {
                  ...m,
                  steps: m.steps?.map((s) =>
                    s.id === "render" ? { ...s, status: "done", detail: "تم تشغيل React" } : s,
                  ),
                }
              : m,
          ),
        );
      }
      if (event.data.type === "vibe-preview-error" && typeof event.data.message === "string") {
        setMessages((ms) =>
          ms.map((m) =>
            m.id === id
              ? {
                  ...m,
                  error: event.data.message.slice(0, 1500),
                  steps: m.steps?.map((s) => (s.id === "render" ? { ...s, status: "error" } : s)),
                }
              : m,
          ),
        );
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [session]);

  async function refreshModels() {
    if (checking || busy) return;
    const ctrl = new AbortController();
    modelAbortRef.current = ctrl;
    setChecking(true);
    setModelError("");
    try {
      const report = await fetchModels(ctrl.signal);
      setModels(report.models);
      setCheckedAt(report.testedAt);
      setModel((old) =>
        report.models.some((m) => m.id === old) ? old : (report.models[0]?.id ?? ""),
      );
      if (!report.models.length) setModelError("لا توجد نماذج اجتازت الفحص؛ أعد الفحص لاحقًا.");
    } catch (error) {
      if (!ctrl.signal.aborted)
        setModelError(error instanceof Error ? error.message : "تعذّر الفحص");
    } finally {
      setChecking(false);
      modelAbortRef.current = null;
    }
  }

  const patch = (id: string, fn: (m: Msg) => Msg) =>
    setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));
  const setStep = (id: string, stepId: string, s: Partial<Step>) =>
    patch(id, (m) => ({
      ...m,
      steps: m.steps?.map((st) => (st.id === stepId ? { ...st, ...s } : st)),
    }));

  async function send(text?: string) {
    const prompt = (text ?? input).trim();
    if (!prompt || busy || checking || !models.some((m) => m.id === model)) return;
    setInput("");
    setBusy(true);
    const aid = uid();
    setMessages((ms) => [
      ...ms,
      { id: uid(), role: "user", text: prompt },
      {
        id: aid,
        role: "assistant",
        text: "",
        agents: [],
        steps: [{ id: "think", kind: "think", label: "تنفيذ الوكلاء", status: "running" }],
      },
    ]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = performance.now();
    try {
      const fullPrompt = current
        ? `${prompt}\n\n(Current App.tsx is version v${current.n}. Return the full updated file.)`
        : prompt;
      const history = messages
        .filter((m) => m.role === "user" || (!m.error && m.text))
        .map((m) => {
          const v = m.version ? versions.find((x) => x.n === m.version) : undefined;
          return {
            role: m.role,
            content: v ? `${m.text}\n\n\`\`\`tsx\n${v.code}\n\`\`\`` : m.text,
          };
        })
        .slice(-20);
      const res = await generateWithAgents({
        prompt: fullPrompt,
        session,
        model,
        history,
        currentCode: current?.code,
        signal: ctrl.signal,
        onEvent: (event) =>
          patch(aid, (m) => ({
            ...m,
            agents: [...(m.agents ?? []).filter((a) => a.id !== event.id), event],
          })),
      });
      const thinkMs = performance.now() - t0;
      const { text: prose, code } = extractCode(res.content || "");
      patch(aid, (m) => ({ ...m, text: prose, reasoning: res.reasoning, thinkMs }));
      setStep(aid, "think", { status: "done", detail: `${(thinkMs / 1000).toFixed(1)}ث` });
      if (code) {
        const n = versions.length + 1;
        const lines = code.split("\n").length;
        patch(aid, (m) => ({
          ...m,
          version: n,
          steps: [
            ...(m.steps ?? []),
            {
              id: "file",
              kind: "file",
              label: current ? "تحديث App.tsx" : "إنشاء App.tsx",
              detail: `${lines} سطر`,
              status: "done",
            },
            { id: "render", kind: "render", label: "تصيير المعاينة الحية", status: "running" },
          ],
        }));
        previewMsgRef.current = aid;
        setVersions((vs) => [...vs, { n, code, prompt }]);
        setActiveV(n);
        setView("preview");
      }
    } catch (e) {
      const aborted = (e as Error).name === "AbortError";
      ctrl.abort();
      patch(aid, (m) => ({
        ...m,
        error: aborted ? "تم إيقاف التوليد." : (e as Error).message,
        steps: m.steps?.map((s) => (s.status === "running" ? { ...s, status: "error" } : s)),
        agents: m.agents?.map((a) =>
          a.status === "running" ? { ...a, status: "error", error: "توقف التنفيذ" } : a,
        ),
      }));
    } finally {
      setBusy(false);
      abortRef.current = null;
      setTimeout(() => taRef.current?.focus(), 0);
    }
  }

  async function resetChat() {
    abortRef.current?.abort();
    previewMsgRef.current = null;
    storageRef.current = {};
    await clearSession(session);
    setSession(newSession());
    setMessages([]);
    setVersions([]);
    setActiveV(null);
    setInput("");
    taRef.current?.focus();
  }

  async function copyCode() {
    if (!current) return;
    await navigator.clipboard.writeText(current.code);
    toast.success("تم نسخ الكود");
  }

  async function downloadProject() {
    if (!current) return;
    const zip = new JSZip();
    Object.entries(buildProjectFiles(current.code)).forEach(([p, c]) => zip.file(p, c));
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vibe-app-v${current.n}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div dir="ltr" className="flex h-screen flex-col bg-background text-foreground">
      <Toaster />
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-3">
        <div className="flex items-center gap-2 font-semibold">
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
            <Hexagon className="size-4" />
          </span>
          <span className="tracking-tight">
            Vibe<span className="text-primary">Studio</span>
          </span>
        </div>
        <div className="mx-auto flex items-center rounded-lg border border-border bg-muted p-0.5">
          {(["preview", "code"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition",
                view === v
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "preview" ? <Eye className="size-3.5" /> : <Code2 className="size-3.5" />}
              {v === "preview" ? "معاينة" : "الكود"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {versions.length > 0 && (
            <Select value={String(activeV)} onValueChange={(v) => setActiveV(Number(v))}>
              <SelectTrigger className="h-8 w-[120px] gap-1 text-xs">
                <History className="size-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...versions].reverse().map((v) => (
                  <SelectItem key={v.n} value={String(v.n)} className="text-xs">
                    v{v.n}
                    {v.n === versions.length ? " · الأحدث" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <IconBtn label="نسخ الكود" onClick={copyCode} disabled={!current}>
            <Copy className="size-4" />
          </IconBtn>
          <button
            onClick={downloadProject}
            disabled={!current}
            className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            <Download className="size-3.5" /> تنزيل المشروع
          </button>
        </div>
      </header>

      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {/* Chat */}
        <ResizablePanel defaultSize="25%" minSize="18%" maxSize="55%">
          <div className="flex h-full flex-col bg-sidebar">
            <div className="flex h-10 items-center justify-between border-b border-border px-3 text-xs text-muted-foreground">
              <span>المحادثة</span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={resetChat}
                className="gap-1"
              >
                <SquarePen className="size-3.5" /> جديدة
              </Button>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-3" dir="rtl">
              {messages.length === 0 && <EmptyChat onPick={(s) => send(s)} />}
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-start">
                    <div
                      dir="auto"
                      className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-secondary px-3.5 py-2 text-sm text-secondary-foreground"
                    >
                      {m.text}
                    </div>
                  </div>
                ) : (
                  <AssistantMsg
                    key={m.id}
                    m={m}
                    activeV={activeV}
                    onOpenVersion={(n) => {
                      setActiveV(n);
                      setView("preview");
                    }}
                  />
                ),
              )}
              <div ref={endRef} />
            </div>
            <div className="border-t border-border p-3" dir="rtl">
              <div className="mb-2 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>
                  {checking
                    ? "جارٍ فحص النماذج…"
                    : `${models.length} نماذج مؤكدة · ${checkedAt ? new Date(checkedAt).toLocaleString("ar", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}`}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="إعادة فحص النماذج"
                  title="إعادة فحص النماذج"
                  onClick={refreshModels}
                  disabled={checking || busy}
                >
                  <RotateCcw className={cn("size-3.5", checking && "animate-spin")} />
                </Button>
              </div>
              {modelError && (
                <p role="alert" className="mb-2 text-xs text-destructive">
                  {modelError}
                </p>
              )}
              <div className="rounded-xl border border-input bg-card focus-within:ring-1 focus-within:ring-ring">
                <textarea
                  ref={taRef}
                  value={input}
                  dir="auto"
                  rows={3}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={
                    current ? "اطلب تعديلاً على التصميم…" : "صف الواجهة التي تريد بناءها…"
                  }
                  className="block w-full resize-none bg-transparent px-3 pt-3 text-sm outline-none placeholder:text-muted-foreground"
                />
                <div className="flex items-center justify-between gap-2 p-2">
                  <Select
                    value={model}
                    onValueChange={setModel}
                    disabled={busy || checking || !models.length}
                  >
                    <SelectTrigger className="h-7 w-auto max-w-[60%] border-none bg-muted text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {models.map((md) => (
                        <SelectItem key={md.id} value={md.id} className="text-xs">
                          {md.name || md.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {busy ? (
                    <button
                      onClick={() => abortRef.current?.abort()}
                      aria-label="إيقاف"
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-foreground text-background"
                    >
                      <Square className="size-3.5 fill-current" />
                    </button>
                  ) : (
                    <button
                      onClick={() => send()}
                      disabled={!input.trim() || checking || !model}
                      aria-label="إرسال"
                      className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-30"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        {/* Preview / Code */}
        <ResizablePanel defaultSize="75%" minSize="40%">
          <div className="flex h-full flex-col">
            <div className="flex h-10 items-center gap-2 border-b border-border px-3">
              {view === "preview" ? (
                <>
                  <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
                    {(
                      [
                        ["desktop", Monitor],
                        ["tablet", Tablet],
                        ["mobile", Smartphone],
                      ] as const
                    ).map(([d, I]) => (
                      <button
                        key={d}
                        onClick={() => setDevice(d)}
                        aria-label={d}
                        className={cn(
                          "grid size-7 place-items-center rounded",
                          device === d
                            ? "bg-background text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <I className="size-3.5" />
                      </button>
                    ))}
                  </div>
                  <IconBtn
                    label="إعادة تحميل"
                    onClick={() => setReloadKey((k) => k + 1)}
                    disabled={!current}
                  >
                    <RotateCcw className="size-3.5" />
                  </IconBtn>
                </>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileCode2 className="size-3.5 text-primary" /> src/App.tsx
                </div>
              )}
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {current ? `v${current.n}` : "—"}
              </span>
            </div>
            <div className="relative min-h-0 flex-1 bg-grid">
              {!current ? (
                <PreviewEmpty busy={busy} />
              ) : view === "preview" ? (
                <div className="flex h-full items-start justify-center overflow-auto p-4">
                  <div
                    className={cn(
                      "h-full overflow-hidden rounded-lg border border-border bg-card shadow-2xl transition-all duration-300",
                      device === "desktop"
                        ? "w-full"
                        : device === "tablet"
                          ? "w-[768px]"
                          : "w-[390px]",
                    )}
                  >
                    <iframe
                      ref={iframeRef}
                      key={`${current.n}-${reloadKey}`}
                      title="preview"
                      srcDoc={html}
                      sandbox="allow-scripts allow-forms allow-modals allow-popups"
                      className="h-full w-full border-0 bg-white"
                    />
                  </div>
                </div>
              ) : (
                <CodeView code={current.code} />
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function IconBtn({
  label,
  children,
  ...p
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...p}
      className="grid size-8 place-items-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function EmptyChat({ onPick }: { onPick: (s: string) => void }) {
  return (
    <div className="pt-8">
      <div className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <Wand2 className="size-5 text-primary" /> ماذا سنبني اليوم؟
      </div>
      <p className="mb-5 text-sm text-muted-foreground">
        صف واجهتك وسأولّد مكون React مع Tailwind وأيقونات Lucide فوراً.
      </p>
      <div className="space-y-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="block w-full rounded-lg border border-border bg-card px-3 py-2 text-right text-xs text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function AssistantMsg({
  m,
  activeV,
  onOpenVersion,
}: {
  m: Msg;
  activeV: number | null;
  onOpenVersion: (n: number) => void;
}) {
  const thinking = m.steps?.find((s) => s.id === "think")?.status === "running";
  return (
    <div className="space-y-2.5">
      <ThoughtBox reasoning={m.reasoning} running={thinking} ms={m.thinkMs} />
      {m.agents &&
        AGENTS.map((agent) => {
          const execution = m.agents?.find((a) => a.id === agent.id);
          const state = !execution
            ? "input-streaming"
            : execution.status === "running"
              ? "input-available"
              : execution.status === "done"
                ? "output-available"
                : "output-error";
          return (
            <Tool key={agent.id} defaultOpen={false} className="mb-2 bg-card">
              <ToolHeader
                type="dynamic-tool"
                toolName={agent.id}
                title={agent.label}
                state={state}
                className="[&_span]:text-[10px]"
              />
              <ToolContent className="space-y-2 p-3 text-xs">
                <p className="text-muted-foreground">
                  {agent.task}
                  {execution?.durationMs ? ` · ${(execution.durationMs / 1000).toFixed(1)}ث` : ""}
                </p>
                {execution?.output && (
                  <div dir="auto" className="max-h-64 overflow-auto">
                    <MessageResponse>{execution.output}</MessageResponse>
                  </div>
                )}
                {execution?.error && <p className="text-destructive">{execution.error}</p>}
              </ToolContent>
            </Tool>
          );
        })}
      {m.text && (
        <div
          dir="auto"
          className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed text-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_p]:my-1"
        >
          <MessageResponse>{m.text}</MessageResponse>
        </div>
      )}
      {m.steps && m.steps.length > 1 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {m.steps
            .filter((s) => s.kind !== "think")
            .map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs last:border-b-0"
              >
                <StepIcon status={s.status} />
                {s.kind === "file" ? (
                  <FileCode2 className="size-3.5 text-muted-foreground" />
                ) : (
                  <Eye className="size-3.5 text-muted-foreground" />
                )}
                <span className={cn(s.status === "running" && "animate-pulse")}>{s.label}</span>
                {s.detail && (
                  <span className="mr-auto font-mono text-[10px] text-muted-foreground">
                    {s.detail}
                  </span>
                )}
              </div>
            ))}
        </div>
      )}
      {m.version && (
        <button
          onClick={() => {
            if (m.version) onOpenVersion(m.version);
          }}
          className={cn(
            "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-right transition",
            activeV === m.version
              ? "border-primary/60 bg-primary/10"
              : "border-border bg-card hover:border-primary/40",
          )}
        >
          <span className="grid size-8 place-items-center rounded-md bg-primary/15 font-mono text-xs font-bold text-primary">
            v{m.version}
          </span>
          <span className="flex-1">
            <span className="block text-xs font-medium">App.tsx</span>
            <span className="block text-[11px] text-muted-foreground">
              {activeV === m.version ? "معروض الآن" : "اضغط لعرض هذا الإصدار"}
            </span>
          </span>
        </button>
      )}
      {m.error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {m.error}
        </div>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "pending") return <Square className="size-3.5 text-muted-foreground" />;
  if (status === "running") return <Loader2 className="size-3.5 animate-spin text-primary" />;
  if (status === "error") return <TriangleAlert className="size-3.5 text-destructive" />;
  return (
    <span className="grid size-3.5 place-items-center rounded-full bg-primary text-primary-foreground">
      <Check className="size-2.5" strokeWidth={3} />
    </span>
  );
}

function ThoughtBox({
  reasoning,
  running,
  ms,
}: {
  reasoning?: string | undefined;
  running: boolean;
  ms?: number | undefined;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!running) return;
    const t0 = Date.now();
    const i = setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    return () => clearInterval(i);
  }, [running]);
  if (running) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Brain className="size-3.5 animate-pulse text-primary" />
        <span className="animate-pulse">يفكّر…</span>
        <span className="font-mono text-[10px]">{elapsed.toFixed(1)}ث</span>
      </div>
    );
  }
  if (!reasoning) return null;
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border border-border bg-card/60"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
        <Brain className="size-3.5 text-primary" />
        <span>فكّر لمدة {ms ? (ms / 1000).toFixed(1) : "?"} ثانية</span>
        <ChevronDown
          className={cn("mr-auto size-3.5 transition-transform", open && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          dir="auto"
          className="max-h-72 overflow-y-auto border-t border-border px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground"
        >
          {reasoning}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PreviewEmpty({ busy }: { busy: boolean }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="text-center">
        <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl border border-border bg-card">
          {busy ? (
            <Loader2 className="size-6 animate-spin text-primary" />
          ) : (
            <Hexagon className="size-6 text-primary" />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {busy ? "جارٍ توليد تطبيقك…" : "ستظهر المعاينة الحية هنا"}
        </p>
      </div>
    </div>
  );
}

function CodeView({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <div className="h-full overflow-auto bg-background font-mono text-[12.5px] leading-6">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="hover:bg-muted/50">
              <td className="w-12 select-none pr-4 text-right align-top text-muted-foreground/60">
                {i + 1}
              </td>
              <td className="whitespace-pre pr-6 text-foreground">{l || " "}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
