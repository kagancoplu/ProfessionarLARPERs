import { describe, expect, it } from 'vitest'
import { appPath, asset, entryPath, routerBasename } from '../src/base'

describe('base path', () => {
  it('leaves URLs unchanged under the default base', () => {
    expect(asset('/game/map.json', '/')).toBe('/game/map.json')
    expect(routerBasename('/')).toBe('/')
    expect(appPath('/pools', '/')).toBe('/pools')
  })

  it('prefixes assets and the router under a sub-path', () => {
    expect(asset('/game/map.json', '/play/agentcoop/')).toBe('/play/agentcoop/game/map.json')
    expect(asset('mockServiceWorker.js', '/play/agentcoop')).toBe('/play/agentcoop/mockServiceWorker.js')
    expect(routerBasename('/play/agentcoop/')).toBe('/play/agentcoop')
  })

  it('maps browser pathnames back to app routes', () => {
    expect(appPath('/play/agentcoop', '/play/agentcoop/')).toBe('/')
    expect(appPath('/play/agentcoop/', '/play/agentcoop/')).toBe('/')
    expect(appPath('/play/agentcoop/pools', '/play/agentcoop/')).toBe('/pools')
  })

  it('shows the base path instead of an explicit index.html', () => {
    expect(entryPath('/play/agentcoop/index.html', '/play/agentcoop/')).toBe('/play/agentcoop/')
    expect(entryPath('/index.html', '/')).toBe('/')
    expect(entryPath('/play/agentcoop/pools', '/play/agentcoop/')).toBeNull()
  })
})
