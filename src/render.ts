// Shared geometry for server validation, the viewer, and downloaded figures.
import { available, Evaluator, layout_element, make_request, render_svg } from '@gum-jsx/core'
import type { FontProvider, ThemeName } from '@gum-jsx/core'
import * as math from '@gum-jsx/math'

const DEFAULT_SIZE = 1000
const evaluator = new Evaluator({ scope: math, name: 'mcp.jsx' })

type FigureOptions = {
  size?: number
  fonts: FontProvider
  theme?: ThemeName
  background?: string
}

function layoutFigure(code: string, { size = DEFAULT_SIZE, fonts, theme }: FigureOptions) {
  const value = evaluator.evaluate(code)
  const result = layout_element(value, {
    // Supply a wrapping/flex budget without padding compact figures to that width
    // or overriding an authored Svg viewport. Height follows ordinary layout.
    request: make_request({ width: available(size) }),
    overrides: { theme },
    fonts,
  })
  if (result.kind === 'value') {
    throw new Error(`Source returned a value instead of an element: ${JSON.stringify(result.value) ?? String(result.value)}`)
  }
  return result.fragment
}

function renderFigure(code: string, options: FigureOptions) {
  const fragment = layoutFigure(code, options)
  return {
    markup: render_svg(fragment, { background: options.background, id_prefix: 'gum-mcp' }),
    width: fragment.size.width,
    height: fragment.size.height,
  }
}

export { DEFAULT_SIZE, layoutFigure, renderFigure }
