import { useCallback, useRef } from 'react';

/** Scene lifetime effects must not depend on the selected tool's callback identity. */
export function useLatestCallback<T extends (...args: any[]) => any>(callback: T | undefined) {
  const latest = useRef(callback);
  latest.current = callback;
  return useCallback((...args: Parameters<T>) => latest.current?.(...args), []);
}
