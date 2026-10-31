#!/usr/bin/env node
/**
 * The soundtrack and the final cut of the demo video (VIDEO.md). Run with tsx (it reads the TS narration):
 *   npm -w apps/web run film:mix      → film-out/agentcoop-demo.mp4 (2:30, 1920×1080) + .srt + mix.wav
 * Needs, in film-out/: pool.mp4, tour.mp4, why.mp4, manifesto.mp4 with their .cues.json (film:render) and
 * voice/<line>.wav (film:voice). Everything else is made here, without samples or licences:
 *   music  an original chiptune at 120 bpm (a bar is 2 s, so the segments 48/70/18/14 s fall on bar lines):
 *          the village theme for "The Pool", a busier groove under the app tour, a quiet minor turn for
 *          "Why BSV", the theme again and a last chord for the manifesto; it ducks under the narrator
 *   sfx    synthesised from the cues the scripts logged (the app's own effect scores, src/audio/sfx.ts, plus
 *          a few more: speech blips, hooves, sparkles, clicks, whooshes)
 * Env: OUT (film-out), MUSIC (0.5, music level), SKIP_VIDEO=1 (only the audio).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { SCORES } from '../src/audio/sfx.ts'
import { LINES, SEGMENTS } from '../src/film/narration.ts'

const SR = 44100
const out = resolve(process.cwd(), process.env.OUT ?? 'film-out')
const start = {}
let total = 0
for (const s of SEGMENTS) { start[s.id] = total; total += s.sec }
const N = Math.ceil(total * SR)
const need = (f) => { if (!existsSync(f)) { console.error(`missing ${f}: render the segments (film:render) and the voice (film:voice) first`); process.exit(1) } return f }

// ---- a small synthesiser (deterministic noise)
let seed = 7
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 }
const midi = m => 440 * 2 ** ((m - 69) / 12)
const track = () => [new Float32Array(N), new Float32Array(N)]
function tone (buf, t0, dur, f, o = {}) {
  const { type = 'square', gain = 0.1, duty = 0.5, attack = 0.004, decay = 0, sustain = 1, release = 0.04, pan = 0, f2 } = o
  const i0 = Math.round(t0 * SR), n = Math.round((dur + release) * SR)
  let phase = 0, lp = 0
  for (let i = 0; i < n; i++) {
    const idx = i0 + i
    if (idx < 0 || idx >= N) continue
    const t = i / SR
    const freq = f2 !== undefined ? f * (f2 / f) ** Math.min(1, t / dur) : f
    phase += freq / SR; phase -= Math.floor(phase)
    let v
    if (type === 'square') v = phase < duty ? 1 : -1
    else if (type === 'triangle') v = 4 * Math.abs(phase - 0.5) - 1
    else if (type === 'sine') v = Math.sin(2 * Math.PI * phase)
    else if (type === 'sawtooth') v = 2 * phase - 1
    else { lp += ((rnd() * 2 - 1) - lp) * (o.tone ?? 1); v = lp }
    let env = t < attack ? t / attack : t < attack + decay ? 1 - (1 - sustain) * (t - attack) / decay : sustain
    if (t > dur) env *= Math.max(0, 1 - (t - dur) / release)
    const s = v * env * gain
    buf[0][idx] += s * Math.min(1, 1 - pan); buf[1][idx] += s * Math.min(1, 1 + pan)
  }
}

// ---- music
const music = track(), lead = track()
const BAR = 2, E8 = 0.25, E16 = 0.125
const CHORDS = { C: [48, 52, 55], G: [43, 47, 50], Am: [45, 48, 52], F: [41, 45, 48], Em: [40, 43, 47] }
const MAJOR = ['C', 'G', 'Am', 'F'], MINOR = ['Am', 'F', 'C', 'G']
// the village theme, 8 bars of eighths; 0 holds the note before, -1 rests
const THEME = [
  [76, 79, 84, 83, 79, 0, 76, 0], [74, 79, 83, 81, 79, 0, 74, 0], [72, 76, 81, 79, 76, 0, 72, 76], [77, 81, 84, 81, 79, 0, 0, -1],
  [79, -1, 76, 79, 84, 0, 83, 81], [83, -1, 79, 83, 86, 0, 84, 83], [81, -1, 76, 81, 84, 0, 83, 81], [81, 79, 77, 76, 74, 0, 79, 0]
]
function bar (t, chord, o) {
  const notes = CHORDS[chord]
  // bass: root and octave, bouncing in eighths
  for (let k = 0; k < 8; k++) tone(music, t + k * E8, E8 * 0.8, midi(notes[0] - 12 + (k % 2 === 1 ? 12 : 0)), { type: 'triangle', gain: o.bass ?? 0.16, release: 0.03 })
  // arpeggio in sixteenths, up through the chord
  if (o.arp !== false) for (let k = 0; k < 16; k++) tone(music, t + k * E16, E16 * 0.7, midi(notes[k % 3] + 24 + (k % 6 >= 3 ? 12 : 0)), { type: 'square', duty: 0.25, gain: o.arpGain ?? 0.025, pan: 0.25, release: 0.02 })
  // drums
  for (let k = 0; k < 8; k++) if (o.hats) tone(music, t + k * E8, 0.02, 1, { type: 'noise', gain: k % 2 === 0 ? 0.03 : 0.02, release: 0.02, pan: -0.2 })
  if (o.kick) for (const b of o.snare ? [0, 2] : [0]) tone(music, t + b * 0.5, 0.12, 120, { type: 'sine', f2: 45, gain: 0.32, release: 0.04 })
  if (o.snare) for (const b of [1, 3]) tone(music, t + b * 0.5, 0.08, 1, { type: 'noise', tone: 0.6, gain: 0.07, release: 0.05 })
  if (o.pad) for (const m of notes) tone(music, t, BAR, midi(m + 12), { type: 'triangle', gain: 0.03, attack: 0.4, release: 0.6 })
}
function melody (t, pattern, gain) {
  for (let k = 0; k < 8; k++) {
    const m = pattern[k]
    if (m <= 0) continue
    let len = 1
    while (k + len < 8 && pattern[k + len] === 0) len++
    tone(lead, t + k * E8, len * E8 * 0.92, midi(m), { type: 'square', duty: 0.125, gain, decay: 0.12, sustain: 0.7, release: 0.06, pan: -0.15 })
  }
}
let b = 0
const at = s => start[s]
// "The Pool": two bars of arpeggio, then the theme three times
for (let i = 0; i < 24; i++, b++) { bar(at('pool') + i * BAR, MAJOR[i % 4], { hats: i >= 2, kick: i >= 2 }); if (i >= 2) melody(at('pool') + i * BAR, THEME[(i - 2) % 8], 0.07) }
// the app tour: the groove, the theme every other phrase and softer (the narrator talks a lot here)
for (let i = 0; i < 35; i++) { bar(at('tour') + i * BAR, MAJOR[i % 4], { hats: true, kick: true, snare: i >= 1, arpGain: 0.02 }); if (Math.floor(i / 8) % 2 === 1) melody(at('tour') + i * BAR, THEME[i % 8], 0.045) }
// why BSV: the minor turn, no drums but the hats
for (let i = 0; i < 9; i++) bar(at('why') + i * BAR, MINOR[i % 4], { hats: i >= 1, pad: true, arpGain: 0.022, bass: 0.13 })
// the manifesto: the theme's first half, then a held C
for (let i = 0; i < 5; i++) { bar(at('manifesto') + i * BAR, MAJOR[i % 4], { hats: true, kick: i < 4, pad: true }); melody(at('manifesto') + i * BAR, THEME[i % 4], 0.07) }
for (const m of [48, 55, 60, 64, 67, 72]) tone(music, at('manifesto') + 10, 3.4, midi(m), { type: 'triangle', gain: 0.05, attack: 0.05, release: 0.6 })
tone(lead, at('manifesto') + 10, 3.2, midi(84), { type: 'square', duty: 0.125, gain: 0.05, decay: 0.3, sustain: 0.5, release: 0.6 })
// a little echo on the lead, then into the music
const echo = Math.round(0.375 * SR)
for (let c = 0; c < 2; c++) { const x = lead[c]; for (let i = echo; i < N; i++) x[i] += x[i - echo] * 0.28; for (let i = 0; i < N; i++) music[c][i] += x[i] }

// ---- sound effects from the cues
const sfx = track()
const score = (t, name, gain) => { for (const n of SCORES[name]) tone(sfx, t + n.t, n.d, n.f, { type: n.type ?? 'square', gain: gain * (n.g ?? 1), attack: 0.008, decay: n.d * 0.8, sustain: 0.05, release: 0.05 }) }
const whoosh = (t, d, gain) => {
  const i0 = Math.round(t * SR), n = Math.round(d * SR)
  let lp = 0
  for (let i = 0; i < n; i++) { const k = i / n; lp += ((rnd() * 2 - 1) - lp) * (0.04 + 0.25 * k); const s = lp * Math.sin(Math.PI * k) * gain; if (i0 + i < N) { sfx[0][i0 + i] += s * (1 - k); sfx[1][i0 + i] += s * k } }
}
const SFX = {
  coin: t => score(t, 'coin', 0.11),
  bell: t => score(t, 'bell', 0.13),
  scroll: t => score(t, 'scroll', 0.07),
  approve: t => { tone(sfx, t, 0.08, 784, { type: 'triangle', gain: 0.08 }); tone(sfx, t + 0.09, 0.14, 1175, { type: 'triangle', gain: 0.08 }) },
  fanfare: t => { [523, 659, 784].forEach((f, i) => tone(sfx, t + i * 0.09, 0.08, f, { type: 'square', duty: 0.25, gain: 0.06 })); tone(sfx, t + 0.27, 0.45, 1047, { type: 'square', duty: 0.25, gain: 0.06, decay: 0.3, sustain: 0.4 }) },
  blip: t => { tone(sfx, t, 0.03, 1250, { type: 'square', duty: 0.25, gain: 0.035 }); tone(sfx, t + 0.04, 0.03, 1560, { type: 'square', duty: 0.25, gain: 0.03 }) },
  think: t => { tone(sfx, t, 0.07, 740, { type: 'triangle', gain: 0.05 }); tone(sfx, t + 0.09, 0.1, 554, { type: 'triangle', gain: 0.05 }) },
  pop: t => { tone(sfx, t, 0.05, 660, { type: 'square', duty: 0.25, gain: 0.06 }); tone(sfx, t + 0.05, 0.08, 990, { type: 'square', duty: 0.25, gain: 0.06 }) },
  sigh: t => tone(sfx, t, 0.35, 420, { type: 'triangle', f2: 250, gain: 0.06, release: 0.1 }),
  cheer: t => [523, 659, 784].forEach((f, i) => tone(sfx, t + i * 0.07, 0.07, f, { type: 'triangle', gain: 0.045 })),
  thud: t => { tone(sfx, t + 0.25, 0.16, 150, { type: 'sine', f2: 55, gain: 0.22 }); tone(sfx, t + 0.25, 0.04, 1, { type: 'noise', tone: 0.3, gain: 0.05 }) },
  chest: t => [392, 523, 659, 784].forEach((f, i) => tone(sfx, t + i * 0.06, 0.05, f, { type: 'square', duty: 0.25, gain: 0.05 })),
  sparkle: t => { for (let i = 0; i < 16; i++) tone(sfx, t + i * 0.11 + rnd() * 0.05, 0.06, 1400 + rnd() * 1600, { type: 'triangle', gain: 0.03 * (1 - i / 18), pan: rnd() * 1.4 - 0.7 }) },
  hooves: t => { for (let i = 0; i < 16; i++) { tone(sfx, t + i * 0.19, 0.025, i % 2 === 0 ? 330 : 270, { type: 'sine', gain: 0.07 }); tone(sfx, t + i * 0.19, 0.015, 1, { type: 'noise', tone: 0.5, gain: 0.04 }) } },
  whoosh: t => whoosh(t, 0.45, 0.05),
  click: t => { tone(sfx, t, 0.01, 1, { type: 'noise', gain: 0.1, release: 0.005 }); tone(sfx, t, 0.018, 1800, { type: 'square', gain: 0.03, release: 0.005 }) },
  highlight: t => { tone(sfx, t, 0.08, 1047, { type: 'triangle', gain: 0.03 }); tone(sfx, t + 0.08, 0.12, 1319, { type: 'triangle', gain: 0.03 }) },
  window: t => { whoosh(t, 0.35, 0.04); tone(sfx, t + 0.25, 0.08, 880, { type: 'triangle', gain: 0.045 }); tone(sfx, t + 0.33, 0.12, 1175, { type: 'triangle', gain: 0.045 }) },
  card: t => score(t, 'bell', 0.1),
  shield: t => score(t, 'shield', 0.1)
}
const unknown = new Set()
for (const s of SEGMENTS) {
  const { cues } = JSON.parse(readFileSync(need(resolve(out, `${s.id}.cues.json`)), 'utf8'))
  for (const c of cues) { const play = SFX[c.name]; if (play === undefined) unknown.add(c.name); else play(start[s.id] + c.t) }
}
if (unknown.size > 0) console.warn(`no sound for cues: ${[...unknown].join(', ')}`)

// ---- the narrator (resampled to 44.1 kHz by ffmpeg)
const voice = new Float32Array(N)
const tmp = mkdtempSync(join(tmpdir(), 'film-mix-'))
for (const l of LINES) {
  const src = need(resolve(out, 'voice', `${l.id}.wav`))
  const raw = join(tmp, `${l.id}.raw`)
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', String(SR), '-f', 's16le', raw])
  const pcm = readFileSync(raw)
  const i0 = Math.round((start[l.segment] + l.at) * SR)
  for (let i = 0; i < pcm.length / 2 && i0 + i < N; i++) voice[i0 + i] += pcm.readInt16LE(i * 2) / 32768
}

// ---- mix: the music ducks under the voice, a fade at both ends, peaks kept under -1 dBFS
const MUSIC = Number(process.env.MUSIC ?? 0.5)
const mix = track()
let env = 0
const atk = 1 - Math.exp(-1 / (0.03 * SR)), rel = 1 - Math.exp(-1 / (0.35 * SR))
for (let i = 0; i < N; i++) {
  const a = Math.abs(voice[i])
  env += (a > env ? atk : rel) * (a - env)
  const duck = 1 - 0.62 * Math.min(1, env * 12)
  const t = i / SR
  const fade = Math.min(1, t / 1.0, (total - t) / 1.5)
  for (let c = 0; c < 2; c++) mix[c][i] = (music[c][i] * MUSIC * duck + sfx[c][i] * 0.9) * fade + voice[i] * 0.95
}
let peak = 0
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(mix[c][i]))
const norm = peak > 0.89 ? 0.89 / peak : 1
const wav = Buffer.alloc(44 + N * 4)
wav.write('RIFF', 0); wav.writeUInt32LE(36 + N * 4, 4); wav.write('WAVE', 8); wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22)
wav.writeUInt32LE(SR, 24); wav.writeUInt32LE(SR * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++) wav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mix[c][i] * norm)) * 32767), 44 + i * 4 + c * 2)
writeFileSync(resolve(out, 'mix.wav'), wav)
// the music alone too, for anyone who cuts the video themselves
const mwav = Buffer.from(wav)
for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++) mwav.writeInt16LE(Math.round(Math.max(-1, Math.min(1, music[c][i] * MUSIC * 1.4)) * 32767), 44 + i * 4 + c * 2)
writeFileSync(resolve(out, 'music.wav'), mwav)

// ---- subtitles (for the upload) and the cut
const ts = s => { const ms = Math.round(s * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}` }
writeFileSync(resolve(out, 'agentcoop-demo.srt'), LINES.map((l, i) => `${i + 1}\n${ts(start[l.segment] + l.at)} --> ${ts(start[l.segment] + l.at + l.sec)}\n${l.text}\n`).join('\n'))
console.log(`mix.wav · ${total} s · music, ${LINES.length} narrator lines, sound effects`)
if (process.env.SKIP_VIDEO === '1') process.exit(0)
const seg = SEGMENTS.map(s => need(resolve(out, `${s.id}.mp4`)))
const d = Object.fromEntries(SEGMENTS.map(s => [s.id, s.sec]))
// the film runs straight into the tour (the tour opens on the film's last frame); the others dip through black
const filter = [
  `[1:v]fade=t=out:st=${d.tour - 0.35}:d=0.35[v1]`,
  `[2:v]fade=t=in:st=0:d=0.35,fade=t=out:st=${d.why - 0.35}:d=0.35[v2]`,
  `[3:v]fade=t=in:st=0:d=0.35,fade=t=out:st=${d.manifesto - 0.8}:d=0.8[v3]`,
  '[0:v][v1][v2][v3]concat=n=4:v=1:a=0[v]'
].join(';')
const final = resolve(out, 'agentcoop-demo.mp4')
execFileSync('ffmpeg', ['-v', 'error', '-y', ...seg.flatMap(f => ['-i', f]), '-i', resolve(out, 'mix.wav'), '-filter_complex', filter,
  '-map', '[v]', '-map', '4:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30',
  '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', '-shortest', final], { stdio: 'inherit' })
console.log(final)
