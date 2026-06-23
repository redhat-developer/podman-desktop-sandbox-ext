/**********************************************************************
 * Copyright (C) 2025 - 2026 Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * SPDX-License-Identifier: Apache-2.0
 ***********************************************************************/

import { setTimeout } from 'timers/promises';

export async function delay(interval: number): Promise<void> {
  await setTimeout(interval);
}

/**
 * Polls `action` until it returns a defined value or `maxWaitTimeMs` elapses.
 * Return `undefined` from `action` to keep waiting. Thrown errors propagate immediately.
 */
export async function waitFor<T>(
  action: () => Promise<T | undefined>,
  maxWaitTimeMs: number,
  pollIntervalMs = 250,
): Promise<T | undefined> {
  let now = Date.now();
  const deadline = now + maxWaitTimeMs;
  while (now < deadline) {
    const result = await action();
    if (result !== undefined) {
      return result;
    }
    await delay(pollIntervalMs);
    now += pollIntervalMs;
  }
  return undefined;
}
