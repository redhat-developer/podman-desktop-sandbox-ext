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
import { CoreV1Api } from '@kubernetes/client-node';
import * as sandbox from './sandbox.js';
import { getPipelineServiceAccountToken } from './openshift.js';

vi.mock(import('./sandbox.js'), async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    getServiceAccountProvisionMaxWaitTime: vi.fn(),
    getRegistrationServiceTimeout: vi.fn(),
  };
});

describe('getPipelineServiceAccountToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('polls for pipeline service account and times out after max wait time', async () => {
    const pollIntervalMs = 250;
    const timeoutMs = pollIntervalMs * 3;
    vi.mocked(sandbox.getServiceAccountProvisionMaxWaitTime).mockReturnValue(timeoutMs);

    const readSpy = vi
      .spyOn(CoreV1Api.prototype, 'readNamespacedServiceAccount')
      .mockRejectedValue(new Error('NotFound'));

    const promise = getPipelineServiceAccountToken('https://proxy.example.com', 'username', 'id-token');
    const expectation = expect(promise).rejects.toThrow(
      `Timed out waiting for 'pipeline' service account to appear in namespace 'username-dev'.`,
    );
    await vi.runAllTimersAsync();
    await expectation;

    expect(sandbox.getServiceAccountProvisionMaxWaitTime).toHaveBeenCalledOnce();
    expect(readSpy).toHaveBeenCalledTimes(3);
    expect(readSpy).toHaveBeenCalledWith({
      name: 'pipeline',
      namespace: 'username-dev',
    });
  });
});
