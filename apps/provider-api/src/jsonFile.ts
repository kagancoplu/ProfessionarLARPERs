/** A JSON document on disk, written atomically (temp file + rename). */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

export class JsonFile<T> {
  constructor (readonly path: string | undefined, private readonly fallback: () => T) {}

  read (): T {
    if (this.path === undefined || !existsSync(this.path)) return this.fallback()
    return JSON.parse(readFileSync(this.path, 'utf8')) as T
  }

  write (value: T): void {
    if (this.path === undefined) return
    mkdirSync(dirname(this.path), { recursive: true })
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
    renameSync(tmp, this.path)
  }
}
