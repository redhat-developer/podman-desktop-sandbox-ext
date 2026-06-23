/**********************************************************************
 * Copyright (C) 2026 Red Hat, Inc.
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

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { waitFor } from './utils.js';

describe('waitFor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('returns value when action succeeds on first attempt', async () => {
    const action = vi.fn().mockResolvedValue('ready');

    await expect(waitFor(action, 750)).resolves.toBe('ready');
    expect(action).toHaveBeenCalledOnce();
  });

  test('polls until action returns a value', async () => {
    const action = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce('ready');

    const promise = waitFor(action, 750, 250);
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBe('ready');
    expect(action).toHaveBeenCalledTimes(3);
  });

  test('returns undefined when max wait time elapses', async () => {
    const action = vi.fn().mockResolvedValue(undefined);

    const promise = waitFor(action, 750, 250);
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toBeUndefined();
    expect(action).toHaveBeenCalledTimes(3);
  });

  test('propagates errors from action immediately', async () => {
    const error = new Error('boom');
    const action = vi.fn().mockRejectedValue(error);

    await expect(waitFor(action, 750, 250)).rejects.toThrow(error);
    expect(action).toHaveBeenCalledOnce();
  });
});
