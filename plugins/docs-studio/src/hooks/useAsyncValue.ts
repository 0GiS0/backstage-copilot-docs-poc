/*
 * Copyright 2026 The Docs Studio Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface AsyncState<T> {
  value?: T;
  error?: Error;
  loading: boolean;
  retry: () => void;
}

/**
 * Runs `load` on mount and whenever `deps` change, ignoring results of
 * superseded or unmounted calls.
 */
export function useAsyncValue<T>(
  load: () => Promise<T>,
  deps: ReadonlyArray<unknown>,
): AsyncState<T> {
  const [state, setState] = useState<Omit<AsyncState<T>, 'retry'>>({
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setState(previous => ({ value: previous.value, loading: true }));
    loadRef.current().then(
      value => {
        if (!cancelled) {
          setState({ value, loading: false });
        }
      },
      error => {
        if (!cancelled) {
          setState({
            error: error instanceof Error ? error : new Error(String(error)),
            loading: false,
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const retry = useCallback(() => setAttempt(n => n + 1), []);
  return { ...state, retry };
}
