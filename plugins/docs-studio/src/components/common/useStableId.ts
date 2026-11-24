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

import { useRef } from 'react';

let counter = 0;

/**
 * Returns an id that stays stable for the component's lifetime. Material UI
 * v4 only links a TextField label to its input when the field has an id, and
 * React.useId is unavailable on the React 16/17 versions this plugin supports.
 */
export function useStableId(prefix: string): string {
  const ref = useRef<string>();
  if (!ref.current) {
    counter += 1;
    ref.current = `${prefix}-${counter}`;
  }
  return ref.current;
}
