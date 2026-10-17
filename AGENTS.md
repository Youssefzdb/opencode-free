<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- AI generation calls the public OpenCode Free AI API directly from the browser (it allows CORS, no key); keep its client in src/lib/opencode.ts. Why: user-requested provider, no secrets involved.
- Chat uses the OpenCode SSE stream (stream:true; start→reasoning→answer→done) via streamChat; partial answers are never auto-replayed. Why: show real live thinking and file writing.
- Generated apps are multi-file projects (virtual file map, src/App.tsx entry, parsing in src/lib/files.ts); src/lib/preview.ts compiles each file with Babel in a sandboxed iframe and links relative/@ imports through blob URLs, bare packages via esm.sh. Why: professional project structure with instant preview and no server build.
- External AIs push files through the token-protected /api/public/bridge route (BRIDGE_TOKEN secret, Zod-validated, writes with the admin client into bridge_projects); the studio receives updates via Realtime. Why: a persistent, authenticated bridge that survives sandbox restarts.
- OpenCode has no usable function calling (its native tools must be avoided by prompt wording; never say "tools" in prompts sent to it), so chat runs a host-executed action-tag agent loop in src/lib/agent-loop.ts: the model emits <action> tags, the app really executes them on the virtual file system and feeds results back until finish passes check_project. Why: real, visible tool calls with the requested no-key provider.
- Chat timeline items are only real loop events (model thoughts and executed actions with their actual results), rendered with AI Elements Tool. Why: never show simulated progress or fabricated tool calls.
- Confirmed model availability is stored separately from conversation history and never populated from the untested catalog. Why: only tested models may be selectable.
- Sandbox localStorage is bridged through source-checked postMessage with a project-scoped namespace, never allow-same-origin. Why: enable generated mock persistence without exposing the host origin to generated code.
