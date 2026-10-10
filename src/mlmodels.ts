import type { components } from './generated/schema.js';

export type MLModelExecution = components['schemas']['MLModelExecutionDetailSchema'];
export type ModelExecutionOptions = {
  signal?: AbortSignal;
  /** Maximum monitoring time, including requests. Default: five minutes. */
  timeoutMs?: number;
  /** Delay between completed reads. Default: 1500 ms. No overlapping requests. */
  pollIntervalMs?: number;
  onProgress?: (execution: MLModelExecution) => void;
};

/** Read an existing execution only. Aborting monitoring never cancels or resubmits work. */
export async function waitForModelExecution(
  read: (uuid: string, options: { signal: AbortSignal }) => Promise<MLModelExecution>,
  uuid: string,
  options: ModelExecutionOptions = {},
): Promise<MLModelExecution> {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  for (const value of [timeoutMs, pollIntervalMs])
    if (!Number.isFinite(value) || value <= 0 || value > 2_147_483_647)
      throw new Error('Monitoring durations must be positive finite timer values.');
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new DOMException(
    `Monitoring timed out. Resume execution ${uuid} without submitting it again.`, 'TimeoutError',
  )), timeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
  try {
    for (;;) {
      signal.throwIfAborted();
      const execution = await read(uuid, { signal });
      signal.throwIfAborted();
      if (execution.uuid !== uuid) throw new Error('The server returned a different model execution.');
      options.onProgress?.(execution);
      signal.throwIfAborted();
      if (execution.status === 'completed' || execution.status === 'failed') return execution;
      if (execution.status !== 'pending' && execution.status !== 'queued')
        throw new Error(`Unsupported model execution status: ${execution.status}`);
      await new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(delay); reject(signal.reason); };
        const delay = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, pollIntervalMs);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) { signal.removeEventListener('abort', abort); abort(); }
      });
    }
  } finally {
    clearTimeout(timer);
  }
}
