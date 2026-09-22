# gum-jsx-mcp

An MCP server that renders [gum.jsx](https://github.com/CompendiumLabs/gum-jsx-core) figures inside hosts that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview).

The `rasterize` tool runs the full Gum-to-PNG pipeline on the server and returns an image for the model to inspect. After checking it, the model calls `render` with the same source and size to display the figure in an embedded MCP App. The viewer evaluates and renders the source in the host iframe; a successful tool response does not confirm browser display. `list_docs` and `read_docs` expose the maintained guides, element references, and gallery from `@gum-jsx/docs`.

## Layout

```text
src/server.ts        Bun HTTP server, MCP endpoint, fonts, and health route
scripts/skill.ts     Generates inspectable instructions, references, and docs snapshot
scripts/skill-source.ts Shared prompt and docs assembly from @gum-jsx/docs
src/skill.ts         Loads generated instructions and docs at startup
src/docs-tools.ts   list_docs/read_docs registration
src/render-tool.ts   PNG inspection and client display tools
src/render.ts        Shared figure layout for validation, previews, and downloads
prompt/mcp.md        MCP-specific generation instructions
test/skill.test.ts   Shared prompt, docs links, lookup, and example rendering checks
test/docs-tools.test.ts Documentation tool protocol checks
src/viewer/main.ts   Embedded app: evaluates, lays out, and exports figures
src/viewer/index.html
src/viewer/host.html Stand-in host for local viewer development
src/build.ts         Builds the viewer, fonts, and skill snapshot into dist/
```

## Running

From the workspace root:

```bash
bun install
bun --filter @gum-jsx/mcp build
PUBLIC_URL=http://localhost:8787 bun --filter @gum-jsx/mcp start
```

Or, from this directory:

```bash
bun run build
PUBLIC_URL=http://localhost:8787 bun run start
```

For development through the public reverse proxy, use:

```bash
PUBLIC_URL=https://dev.compendiumlabs.ai bun run dev
```

`dev` respects `PUBLIC_URL` and defaults to `http://localhost:8787` when unset.
The public URL must be reachable from the client's browser: it sets the viewer's
font URLs and CSP, even when MCP tool calls go through a working reverse proxy.
Check `/health` to confirm the running process advertises the intended URL.

Open `http://localhost:8787/host.html` for the local viewer harness, or connect an MCP host to `http://localhost:8787/mcp`.

Run `bun run typecheck` to check TypeScript and `bun run test` for the skill and
documentation integration checks.

Run `bun run verify` for a real-client check. It builds fresh artifacts, starts a
temporary loopback server, runs MCP Inspector's `tools/list`, then exercises docs,
PNG rasterization, viewer handoff/resources, and render errors over HTTP. It
shuts the server down on success, failure, or interruption and exits nonzero on
failure. No separate dev server is needed. The runner pins Inspector 2.7.0;
`bunx` downloads it on first use, and it requires Node 22.19 or newer.

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | HTTP listen port | `8787` |
| `HOST` | HTTP listen address | `0.0.0.0` |
| `PUBLIC_URL` | Browser-visible server URL, optionally including a path prefix; used for asset URLs and the app CSP | `https://compendiumlabs.ai` |

Routes are relative to `PUBLIC_URL`:

| Route | Purpose |
|---|---|
| `/mcp` | Stateless MCP Streamable HTTP endpoint |
| `/fonts/<name>.ttf` | Viewer font assets, CORS-open and immutable-cached |
| `/viewer.html` | Viewer standalone; accepts `?code=<jsx>&size=800&theme=dark` |
| `/host.html` | Local stand-in MCP host |
| `/health` | Liveness and endpoint metadata |

## Precompiled documentation

The build shares `getSkillPrompt()` and `buildSkillFiles({ cli: false })` from
`@gum-jsx/docs`, then appends [prompt/mcp.md](./prompt/mcp.md). Authoring rules,
layout guidance, examples, and references stay shared with the portable skill.
The MCP workflow uses `rasterize` to inspect figures and `render` to display them.

All documentation access uses `list_docs` and `read_docs`. File-based references
identify page names: `references/guides/Style.md` means `read_docs("Style")`, and
`references/elements/Plot.md#example` means `read_docs("Plot")`. Exact names
distinguish the `Math` guide from the `math` category. Individual pages, element
categories, and the `elements`, `guides`, and `gallery` indexes are readable.

Run `bun run skill` to precompile the documentation, or `bun run build` to build
both the viewer and docs. The existing output location is preserved:

```text
dist/skills/
  instructions.md        Server initialization instructions
  docs.json              list_docs index and read_docs pages
  gum-jsx/
    SKILL.md             Local inspection copy of the shared authoring guidance
    references/          Individual guides, elements, gallery examples, and indexes
```

The server reads only `instructions.md` and `docs.json`, once on startup, and
serves that in-memory snapshot. The Markdown files are for local inspection;
they are not offered as a formal MCP skill. There are no Skills extension
methods, skill manifests, or documentation resources. Viewer app resources
remain available. Rebuilding removes obsolete generated artifacts, including
old manifests and grouped reference files.

Output is ignored by Git. Edit the maintained prompts/docs, run `bun run skill`,
and restart to load the new snapshot. Missing or malformed snapshots fail with
rebuild guidance. Clients that previously imported the formal skill should
refresh their configuration to remove that stale import and use the docs tools.

## Rendering

Always call `rasterize` and inspect its PNG before `render`, including after
revisions. Raster errors return `isError: true` with the cause. The PNG uses 2×
resolution, a light root theme, and a white background, matching downloads.
Rasterization uses `@gum-jsx/png` and its native `canvas` dependency.

The viewer follows the same pipeline as the current CLI and editor:

1. Evaluate JSX with core and math bindings.
2. Load the core and KaTeX font resources.
3. Wrap, lay out with the requested width offer, and serialize the fragment.

`size` offers 1000px of width by default; compact figures keep their content width
and authored dimensions are preserved. Use `width="fill"` to occupy the offer or
an explicit `Svg` width for a fixed viewport. The preview scales large figures
down to the available display width. Downloads retain the figure's SVG dimensions
(twice those dimensions for the 2× PNG), without padding to the browser width.

The app follows host theme changes and offers JSX, SVG, and 2x PNG downloads. Current Gum SVG text is emitted as glyph paths, so downloaded SVG and PNG output do not depend on fonts installed on the receiving system.

The app resource URI includes a hash of the viewer HTML so updated bundles have
a distinct cache identity. Older viewer URIs remain readable for clients with
cached tool metadata. Rebuild and restart the server to load viewer changes.

The app resource declares the public origin in both MCP Apps and OpenAI-compatible CSP metadata. The build leaves `__GUM_FONT_BASE__` in asset URLs; the server replaces it with `PUBLIC_URL`, keeping the build deployment-independent.

## Deployment

`deploy/` contains the existing Caddy reverse-proxy configuration and systemd unit. Build `dist/` before starting the service.
