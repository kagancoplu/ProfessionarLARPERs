#!/usr/bin/env node
/**
 * The narrator (VIDEO.md): every line of src/film/narration.ts spoken by Kokoro-82M (Apache-2.0, runs on the
 * CPU) into film-out/voice/<id>.wav, plus film-out/voice/durations.json. Run with tsx (it imports the TS list):
 *   npm i --no-save kokoro-js            (once; or KOKORO=/path/to/node_modules/kokoro-js)
 *   VOICE=af_heart npm -w apps/web run film:voice
 * Env: VOICE (af_heart; also am_michael, bm_george, …), SPEED (1.1), ONLY (comma-separated ids).
 * Silence before and after each line is trimmed, so a line starts exactly at its `at`.
 * The model (~330 MB) downloads from Hugging Face on the first run; behind a proxy set NODE_USE_ENV_PROXY=1.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LINES } from '../src/film/narration.ts'

const voice = process.env.VOICE ?? 'af_heart'
const speed = Number(process.env.SPEED ?? 1.1)
const only = process.env.ONLY?.split(',')
const out = resolve(process.cwd(), process.env.OUT ?? 'film-out', 'voice')
await mkdir(out, { recursive: true })

const mod = process.env.KOKORO !== undefined ? await import(pathToFileURL(resolve(process.env.KOKORO, 'dist/kokoro.js')).href) : await import('kokoro-js')
const tts = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'fp32', device: 'cpu' })

const file = resolve(out, 'durations.json')
let durations = {}
try { durations = JSON.parse(await readFile(file, 'utf8')) } catch { /* first run */ }
for (const l of LINES) {
  if (only !== undefined && !only.includes(l.id)) continue
  const audio = await tts.generate(l.say ?? l.text, { voice, speed })
  const pcm = trim(audio.audio, audio.sampling_rate)
  await writeFile(resolve(out, `${l.id}.wav`), wav(pcm, audio.sampling_rate))
  const sec = pcm.length / audio.sampling_rate
  durations[l.id] = { sec: Math.round(sec * 100) / 100, voice }
  const fits = sec <= l.sec ? '' : `  ← longer than its ${l.sec} s slot`
  console.log(`${l.id.padEnd(14)} ${sec.toFixed(2)} s${fits}`)
}
await writeFile(file, JSON.stringify(durations, null, 2) + '\n')

/** cut the silence before the first and after the last sound, keeping 30 ms of air */
function trim (x, rate) {
  const loud = (i) => Math.abs(x[i]) > 0.012
  let a = 0, b = x.length - 1
  while (a < b && !loud(a)) a++
  while (b > a && !loud(b)) b--
  const pad = Math.round(rate * 0.03)
  return x.subarray(Math.max(0, a - pad), Math.min(x.length, b + pad))
}

/** 16-bit mono PCM WAV */
function wav (x, rate) {
  const buf = Buffer.alloc(44 + x.length * 2)
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + x.length * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(x.length * 2, 40)
  for (let i = 0; i < x.length; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2)
  return buf
}
