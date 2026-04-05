/**
 * ApiKeyPool — manages a rotating pool of free API keys.
 *
 * Rotation strategy:
 *  - RPM 429: mark current key as RPM-throttled, rotate to next key immediately.
 *    If all keys have been tried in this round → wait for retryDelay, then start a new round.
 *  - RPD 429: permanently exhaust current key for this session, rotate to next.
 *    If no keys remain → caller receives { hasKeys: false }.
 */
export class ApiKeyPool {
  private readonly keys: string[]
  private current: number = 0
  private readonly rpdExhausted: Set<number> = new Set()

  constructor(keys: string[]) {
    const valid = keys.filter((k) => k.trim().length > 0)
    if (valid.length === 0) throw new Error('ApiKeyPool: нет доступных ключей')
    this.keys = valid
  }

  get currentKey(): string {
    return this.keys[this.current]
  }

  get currentIndex(): number {
    return this.current
  }

  get totalCount(): number {
    return this.keys.length
  }

  get availableCount(): number {
    return this.keys.length - this.rpdExhausted.size
  }

  /**
   * Rotate to the next non-RPD-exhausted key.
   * Returns true if a valid next key was found, false if all are exhausted.
   */
  rotateNext(): boolean {
    if (this.availableCount === 0) return false

    const start = this.current
    do {
      this.current = (this.current + 1) % this.keys.length
    } while (this.rpdExhausted.has(this.current) && this.current !== start)

    return !this.rpdExhausted.has(this.current)
  }

  /**
   * Mark current key as RPD-exhausted and rotate to the next one.
   * Returns true if another key is still available.
   */
  exhaustCurrent(): boolean {
    this.rpdExhausted.add(this.current)
    if (this.availableCount === 0) return false
    return this.rotateNext()
  }

  isExhausted(index: number): boolean {
    return this.rpdExhausted.has(index)
  }
}
