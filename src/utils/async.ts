/** Resolves after `ms`; rejects with an AbortError as soon as `signal` fires. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('', 'AbortError')); return }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => { clearTimeout(timer); reject(new DOMException('', 'AbortError')) },
      { once: true },
    )
  })
}
