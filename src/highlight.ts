// highlight.js with its common languages, plus the Windows shell.
import hljs from 'highlight.js/lib/common'
import powershell from 'highlight.js/lib/languages/powershell'

hljs.registerLanguage('powershell', powershell)

export default hljs
