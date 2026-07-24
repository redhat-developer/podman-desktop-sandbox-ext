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

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CoreV1Api } from '@kubernetes/client-node';
import * as sandbox from './sandbox.js';
import { delay } from './utils.js';
import { getPipelineServiceAccountToken } from './openshift.js';

vi.mock(import('./sandbox.js'), async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    getServiceAccoutCreationTimeout: vi.fn(),
    getRegistrationServiceTimeout: vi.fn(),
  };
});

vi.mock(import('./utils.js'), () => {
  return {
    delay: vi.fn().mockResolvedValue(undefined),
  };
});

describe('getPipelineServiceAccountToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  test('polls for pipeline service account and times out after 180 seconds', async () => {
    const timeoutMs = 180_000;
    vi.mocked(sandbox.getServiceAccoutCreationTimeout).mockReturnValue(timeoutMs);

    const start = 1_000_000;
    let now = start;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    const readSpy = vi
      .spyOn(CoreV1Api.prototype, 'readNamespacedServiceAccount')
      .mockRejectedValue(new Error('NotFound'));

    // Advance simulated time on each poll interval, then jump past the 180s deadline
    // so the while-loop is exercised without waiting in real time.
    let pollCount = 0;
    vi.mocked(delay).mockImplementation(async (interval: number) => {
      pollCount++;
      if (pollCount < 3) {
        now += interval;
      } else {
        now = start + timeoutMs + 1;
      }
    });

    await expect(
      getPipelineServiceAccountToken('https://proxy.example.com', 'username', 'id-token'),
    ).rejects.toThrow(
      `Timed out waiting for 'pipeline' service account to appear in namespace 'username-dev'.`,
    );

    expect(sandbox.getServiceAccoutCreationTimeout).toHaveBeenCalledOnce();
    expect(readSpy).toHaveBeenCalledTimes(3);
    expect(readSpy).toHaveBeenCalledWith({
      name: 'pipeline',
      namespace: 'username-dev',
    });
    expect(delay).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledWith(250);
  });
});
