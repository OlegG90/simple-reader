/** Creates an element with the given properties and children. */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: object = {}, ...children: (Node | string)[]) {
  const node: HTMLElementTagNameMap[K] = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

/**
 * Blocks the context menu: the app has no editing, so the browser
 * menu (Save as, ...) is never useful — except in edit fields.
 */
export function suppressContextMenu(doc: Document = document) {
  doc.addEventListener('contextmenu', e => {
    const target = e.target instanceof Element ? e.target : null
    if (target?.closest('input, textarea, select, [contenteditable]')) return
    e.preventDefault()
  })
}
