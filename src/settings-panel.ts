import { FONTS, LINE_HEIGHT, LINE_LENGTH, THEMES, stepFontSize, type Appearance, type Font, type Range, type Theme } from './appearance'

/** Everything the settings panel edits. */
export interface PanelValues extends Appearance {
  savePositions: boolean
}

const THEME_LABELS: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark', sepia: 'Sepia' }
const fontLabel = (font: Font) => (font === 'publisher' ? 'Publisher default' : font)

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}, ...children: (Node | string)[]) {
  const node: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

function field(label: string, control: HTMLElement, value?: HTMLElement) {
  return el('div', { className: 'field' }, el('span', { className: 'label' }, label), control, ...(value ? [value] : []))
}

function range({ min, max, step }: Range) {
  return el('input', { type: 'range', min: String(min), max: String(max), step: String(step) })
}

/**
 * Builds the settings controls into `host`. Every change is reported through
 * `onChange` with just the changed values; `show` refreshes the controls.
 */
export function createSettingsPanel(host: HTMLElement, initial: PanelValues, onChange: (changes: Partial<PanelValues>) => void) {
  let current = initial

  const themeButtons = THEMES.map(theme =>
    el('button', { type: 'button', textContent: THEME_LABELS[theme], onclick: () => onChange({ theme }) }),
  )
  const font = el('select', {}, ...FONTS.map(f => el('option', { value: f, textContent: fontLabel(f) })))
  font.onchange = () => onChange({ font: font.value as Font })

  const size = el('output')
  const sizeButton = (text: string, direction: 1 | -1) =>
    el('button', { type: 'button', textContent: text, onclick: () => onChange({ fontSize: stepFontSize(current.fontSize, direction) }) })

  const lineHeight = range(LINE_HEIGHT)
  const lineHeightValue = el('output')
  lineHeight.oninput = () => onChange({ lineHeight: Number(lineHeight.value) })

  const lineLength = range(LINE_LENGTH)
  const lineLengthValue = el('output')
  lineLength.oninput = () => onChange({ lineLength: Number(lineLength.value) })

  const savePositions = el('input', { type: 'checkbox' })
  savePositions.onchange = () => onChange({ savePositions: savePositions.checked })

  host.append(
    el('h2', { textContent: 'Settings' }),
    field('Theme', el('div', { className: 'segmented' }, ...themeButtons)),
    field('Font', font),
    field('Size', el('div', { className: 'stepper' }, sizeButton('A−', -1), size, sizeButton('A+', 1))),
    field('Line spacing', lineHeight, lineHeightValue),
    field('Line length', lineLength, lineLengthValue),
    el('label', { className: 'check' }, savePositions, 'Remember reading position'),
  )

  function show(values: PanelValues) {
    current = values
    themeButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(THEMES[i] === values.theme)))
    font.value = values.font
    size.textContent = `${values.fontSize}px`
    lineHeight.value = String(values.lineHeight)
    lineHeightValue.textContent = values.lineHeight.toFixed(1)
    lineLength.value = String(values.lineLength)
    lineLengthValue.textContent = `${values.lineLength} ch`
    savePositions.checked = values.savePositions
  }

  show(initial)
  return { show }
}
