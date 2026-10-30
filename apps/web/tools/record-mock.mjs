#!/usr/bin/env node
/** Records one cycle of the mock scenario as a replay file: tsx tools/record-mock.mjs → public/replays/mock-demo.jsonl */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { createAppStore } = await import(pathToFileURL(resolve(root, 'src/store/index.ts')).href)
const { createBus } = await import(pathToFileURL(resolve(root, 'src/events/bus.ts')).href)
const { createMockWorld } = await import(pathToFileURL(resolve(root, 'src/mock/state.ts')).href)
const { MockScenario } = await import(pathToFileURL(resolve(root, 'src/mock/scenario.ts')).href)
const { DEFAULT_SETTINGS } = await import(pathToFileURL(resolve(root, 'src/store/types.ts')).href)

const store = createAppStore('replay', 'mock-demo', { ...DEFAULT_SETTINGS })
const bus = createBus(store)
const events = []
bus.subscribe(e => events.push(e))
const scenario = new MockScenario({ bus, world: createMockWorld(), loop: false })
scenario.runCycleSync(Date.parse('2026-10-30T18:00:00Z'))
const lines = ['# AgentCoop replay · mock-demo · recorded from apps/web/src/mock/scenario.ts (no chain; txids are mock_)', ...events.map(e => JSON.stringify(e))]
await mkdir(resolve(root, 'public/replays'), { recursive: true })
await writeFile(resolve(root, 'public/replays/mock-demo.jsonl'), lines.join('\n') + '\n')
console.log(`recorded ${events.length} events → public/replays/mock-demo.jsonl`)
