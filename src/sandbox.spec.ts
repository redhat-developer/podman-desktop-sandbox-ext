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

import { beforeEach, expect, test, vi } from 'vitest';
import * as podmanDesktopApi from '@podman-desktop/api';
import { getAvailabilityCheckInterval } from './sandbox.js';

beforeEach(() => {
  vi.restoreAllMocks();
});

test('getAvailabilityCheckInterval returns configured value in milliseconds', () => {
  const get = vi.fn().mockReturnValue(12);
  vi.mocked(podmanDesktopApi.configuration.getConfiguration).mockReturnValue({ get } as never);

  expect(getAvailabilityCheckInterval()).toBe(12000);
  expect(podmanDesktopApi.configuration.getConfiguration).toHaveBeenCalledWith('redhat');
  expect(get).toHaveBeenCalledWith('sandbox.availabilityCheckInterval', 8);
});

test('getAvailabilityCheckInterval uses default of 8 seconds when unset', () => {
  const get = vi.fn().mockImplementation((_key: string, defaultValue: number) => defaultValue);
  vi.mocked(podmanDesktopApi.configuration.getConfiguration).mockReturnValue({ get } as never);

  expect(getAvailabilityCheckInterval()).toBe(8000);
});
