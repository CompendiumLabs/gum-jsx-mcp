## Render with MCP tools

Use `list_docs` to find guide, element, category, and gallery names, then
`read_docs` for the pages relevant to the figure. References use file-based
links: `references/guides/style.md` means `read_docs("guides/style")`, and
`references/elements/plotting.md#Plot` means `read_docs("elements/Plot")`.
Use `guides/math` for the math authoring guide and `elements/math` for the
element category.
Documentation is accessed through these tools; the file paths identify pages.

Always call `rasterize` with the complete JSX source in `code` before displaying
it, including after every revision. This tool runs the full evaluation, layout,
SVG, and PNG pipeline on the server and returns a 2× PNG for inspection. Check
legibility, alignment, clipping, and overlap. Fix errors or visual problems and
rasterize again before proceeding. If the host cannot show you the returned PNG,
state that visual inspection is unavailable; do not claim to have checked it.

Call `render` with the **same code and size** only after the raster check passes
to display the figure inline. It sends the source to a client-side viewer; a
successful tool response does not confirm that the browser displayed it. Treat
any viewer error as a failure even if the server validation passed. No CLI
installation, shell commands, or local files are needed. The viewer already
presents the figure, so repeat its source only when useful or requested.

`size` is an optional positive integer specifying the **available layout width**
in pixels (default 1000). Compact figures hug their content; authored dimensions
are preserved, and height follows the source or content. Use `width="fill"` to
occupy the offer or an explicit `Svg` width for a fixed viewport. The offer can
change wrapping and flex layout; put `fit` on a composition for uniform scaling.
The viewer scales large figures down to fit the conversation. Downloads use the
figure's own dimensions, independent of the browser window.

The viewer follows the host's light/dark theme, overriding the root theme;
nested themes and explicit paints still apply. It offers JSX, SVG, and 2× PNG
downloads. The `rasterize` preview and SVG/PNG downloads use a light root theme
and a white backdrop; the inline viewer may therefore have a different theme.
