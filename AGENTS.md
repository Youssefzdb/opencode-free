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
- Generated apps are multi-file projects (virtual file map, src/App.tsx entry, parsing in src/lib/files.ts); src/lib/preview.ts compiles each file with Babel in a sandboxed iframe and links relative/@ imports through blob URLs, bare packages via esm.sh. Why: professional project structure with instant preview and no server build.
- External AIs push files through the token-protected /api/public/bridge route (BRIDGE_TOKEN secret, Zod-validated, writes with the admin client into bridge_projects); the studio receives updates via Realtime. Why: a persistent, authenticated bridge that survives sandbox restarts.
- OpenCode exposes a proprietary browser-only JSON chat protocol, not an AI SDK streaming transport; retain its client and orchestrate explicit parallel specialist calls followed by an integration call. Why: preserve the requested public no-key provider without inventing streaming or tool execution.
- Agent execution records represent actual request lifecycles and expose returned work through AI Elements Tool and MessageResponse primitives. Why: avoid simulated progress or fabricated tool calls.
- Confirmed model availability is stored separately from conversation history and never populated from the untested catalog. Why: only tested models may be selectable.
- Sandbox localStorage is bridged through source-checked postMessage with a project-scoped namespace, never allow-same-origin. Why: enable generated mock persistence without exposing the host origin to generated code.
