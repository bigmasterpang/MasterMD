/** 防抖：延迟执行，最后一次调用生效 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): ((...args: A) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const wrapped = (...args: A) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  wrapped.cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return wrapped;
}

/** 节流：按时间间隔执行（默认使用 rAF 合并到下一帧） */
export function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): (...args: A) => void {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  return (...args: A) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    pending = args;
    if (remaining <= 0) {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      last = now;
      fn(...args);
      pending = null;
    } else if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        if (pending) {
          fn(...pending);
          pending = null;
        }
      }, remaining);
    }
  };
}

/** 统计字数：中文按字计，西文按词计 */
export function countWords(text: string): number {
  if (!text) return 0;
  const cjk = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g)?.length ?? 0;
  const words =
    text
      .replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g, " ")
      .match(/[A-Za-z0-9_'’-]+/g)?.length ?? 0;
  return cjk + words;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
