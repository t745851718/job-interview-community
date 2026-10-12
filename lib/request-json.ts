export class RequestTimeoutError extends Error {
  constructor(message: string) {super(message); this.name = 'RequestTimeoutError';}
}

export async function requestJson<T = any>(url: string, init: RequestInit = {}, options: {timeoutMs?: number; timeoutMessage?: string} = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, {once: true});
  const timer = setTimeout(() => {timedOut = true; controller.abort();}, options.timeoutMs ?? 20000);
  try {
    const response = await fetch(url, {...init, signal: controller.signal});
    const data = await response.json() as T & {error?: string};
    if (!response.ok) throw new Error(data.error || '操作失败，请重试');
    return data;
  } catch (error) {
    if (timedOut) throw new RequestTimeoutError(options.timeoutMessage || '请求等待超时，请稍后重试');
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
  }
}
