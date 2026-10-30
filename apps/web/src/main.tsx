import '@fontsource/pixelify-sans/400.css'
import '@fontsource/pixelify-sans/500.css'
import '@fontsource/pixelify-sans/700.css'
import '@fontsource/vt323/400.css'
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import './ui/tokens.css'
import './ui/palette.generated.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import { bootstrap } from './boot'
import { store } from './store'
import { startThemeController } from './theme'

startThemeController(store)
const root = createRoot(document.getElementById('root')!)
void bootstrap().then(runtime => {
  root.render(<StrictMode><App runtime={runtime} /></StrictMode>)
}).catch(err => {
  console.error('[boot]', err)
  root.render(<div className="p-6 font-display text-danger-dark">The town could not start: {String((err as Error).message ?? err)}</div>)
})
