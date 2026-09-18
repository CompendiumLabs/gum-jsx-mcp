# gum-jsx-mcp

An MCP server that renders [gum.jsx](https://github.com/CompendiumLabs/gum-jsx-core) figures inside hosts that support [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview).

The server stays deliberately thin. Its `render` tool validates Gum source and returns it to an embedded MCP App, which evaluates and renders the figure in the host iframe. `list_docs` and `read_docs` expose the maintained guides, element references, and gallery from `@gum-jsx/docs`.

## Layout

```text
src/server.ts        Bun HTTP server, MCP endpoint, fonts, and health route
src/skill.ts         MCP instructions and docs tools built from @gum-jsx/docs
prompt/mcp.md        MCP-specific generation instructions
src/viewer/main.ts   Embedded app: evaluates, lays out, and exports figures
src/viewer/index.html
src/viewer/host.html Stand-in host for local viewer development
src/build.ts         Bundles the viewer and its font assets into dist/
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

Open `http://localhost:8787/host.html` for the local viewer harness, or connect an MCP host to `http://localhost:8787/mcp`.

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | HTTP listen port | `8787` |
| `PUBLIC_URL` | Browser-visible server URL, optionally including a path prefix; used for asset URLs and the app CSP | `https://compendiumlabs.ai` |

Routes are relative to `PUBLIC_URL`:

| Route | Purpose |
|---|---|
| `/mcp` | Stateless MCP Streamable HTTP endpoint |
| `/fonts/<name>.ttf` | Viewer font assets, CORS-open and immutable-cached |
| `/viewer.html` | Viewer standalone; accepts `?code=<jsx>&size=800&theme=dark` |
| `/host.html` | Local stand-in MCP host |
| `/health` | Liveness and endpoint metadata |

## Rendering

The viewer follows the same pipeline as the current CLI and editor:

1. Evaluate JSX with core and math bindings.
2. Load the core and KaTeX font resources.
3. Wrap, lay out at the requested width, and serialize with `render_element`.

The app follows host theme changes and offers JSX, SVG, and 2x PNG downloads. Current Gum SVG text is emitted as glyph paths, so downloaded SVG and PNG output do not depend on fonts installed on the receiving system.

The app resource declares the public origin in both MCP Apps and OpenAI-compatible CSP metadata. The build leaves `__GUM_FONT_BASE__` in asset URLs; the server replaces it with `PUBLIC_URL`, keeping the build deployment-independent.

## Deployment

`deploy/` contains the existing Caddy reverse-proxy configuration and systemd unit. Build `dist/` before starting the service.
