// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_APPEARANCE } from './appearance'
import { createSettingsPanel, type PanelValues } from './settings-panel'

const initial: PanelValues = { ...DEFAULT_APPEARANCE, savePositions: true }

function setup() {
  const host = document.createElement('aside')
  const onChange = vi.fn()
  const actions = { clearHistory: vi.fn(), toggleFileTypes: vi.fn() }
  const panel = createSettingsPanel(host, initial, onChange, actions)
  const button = (text: string) => {
    const found = [...host.querySelectorAll('button')].find(b => b.textContent === text)
    if (!found) throw new Error(`no button "${text}"`)
    return found
  }
  return { host, onChange, actions, panel, button }
}

describe('settings panel', () => {
  it('reports value changes', () => {
    const { host, onChange, button } = setup()
    button('Dark').click()
    expect(onChange).toHaveBeenCalledWith({ theme: 'dark' })

    const font = host.querySelector('select')
    if (!font) throw new Error('no font select')
    font.value = 'Calibri'
    font.dispatchEvent(new Event('change'))
    expect(onChange).toHaveBeenCalledWith({ font: 'Calibri' })

    button('A+').click()
    expect(onChange).toHaveBeenCalledWith({ fontSize: initial.fontSize + 1 })
  })

  it('forwards the action buttons', () => {
    const { actions, button } = setup()
    button('Clear history').click()
    expect(actions.clearHistory).toHaveBeenCalledOnce()
    button('Register').click()
    expect(actions.toggleFileTypes).toHaveBeenCalledOnce()
  })

  it('shows the file-type registration state', () => {
    const { host, panel, button } = setup()
    panel.setFileTypesRegistered(true)
    expect(host.textContent).toContain('Registered for book files')
    expect(button('Unregister')).toBeDefined()
    panel.setFileTypesRegistered(false)
    expect(host.textContent).toContain('Not registered')
    expect(button('Register')).toBeDefined()
  })

  it('refreshes the controls on show', () => {
    const { host, panel, button } = setup()
    panel.show({ ...initial, theme: 'sepia' })
    expect(button('Sepia').getAttribute('aria-pressed')).toBe('true')
    expect(button('Dark').getAttribute('aria-pressed')).toBe('false')
  })
})
