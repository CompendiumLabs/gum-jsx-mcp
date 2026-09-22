import { expect, test } from 'bun:test'
import { createMathFonts } from '@gum-jsx/math'
import { layoutFigure, renderFigure } from '../src/render'

const fonts = createMathFonts()

test('compact previews and downloads retain the figure width and height', () => {
  for (const code of [
    '<Circle width={px(80)} fill={blue} />',
    '<Svg><Circle width={px(80)} fill={blue} /></Svg>',
  ]) {
    for (const size of [320, 1000, 1600]) {
      const preview = renderFigure(code, { size, fonts, theme: 'dark' })
      const download = renderFigure(code, { size, fonts, theme: 'light', background: 'white' })
      expect([preview.width, preview.height]).toEqual([80, 80])
      expect([download.width, download.height]).toEqual([80, 80])
      expect(download.markup).toContain('width="80" height="80" viewBox="0 0 80 80"')
      expect(layoutFigure(code, { size, fonts }).size).toEqual({ width: 80, height: 80 })
    }
  }
})

test('source viewport dimensions survive both smaller and larger host offers', () => {
  const code = '<Svg width="640px" height="120px"><Rect /></Svg>'
  for (const size of [320, 1000]) {
    const figure = renderFigure(code, { size, fonts })
    expect([figure.width, figure.height]).toEqual([640, 120])
    expect(figure.markup).toContain('viewBox="0 0 640 120"')
  }
})

test('available width still supports wrapping, fill, and flex allocation', () => {
  const paragraph = '<Text>The available width wraps a paragraph while keeping its font size and allowing the height to follow its content.</Text>'
  const narrow = renderFigure(paragraph, { size: 160, fonts })
  const wide = renderFigure(paragraph, { size: 480, fonts })
  expect(narrow.width).toBeLessThanOrEqual(160)
  expect(wide.width).toBeLessThanOrEqual(480)
  expect(narrow.height).toBeGreaterThan(wide.height)

  for (const size of [320, 1000]) {
    const fill = renderFigure('<Box width="fill" height="40px"><Rect /></Box>', { size, fonts })
    expect([fill.width, fill.height]).toEqual([size, 40])
    const row = layoutFigure(`
      <HStack gap="20px">
        <Rect grow={1} height="40px" />
        <Rect grow={1} height="40px" />
      </HStack>
    `, { size, fonts }).children[0].fragment
    expect(row.size.width).toBe(size)
    expect(row.children.map(child => child.fragment.size.width)).toEqual([(size - 20) / 2, (size - 20) / 2])
  }
})

test('invalid or non-figure source reports the same error before preview or export', () => {
  for (const render of [layoutFigure, renderFigure]) {
    expect(() => render('return 42', { fonts })).toThrow('Source returned a value instead of an element: 42')
    expect(() => render('<MissingElement />', { fonts })).toThrow()
  }
})
