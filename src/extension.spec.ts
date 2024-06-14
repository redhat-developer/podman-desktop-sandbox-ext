/**********************************************************************
 * Copyright (C) 2023 Red Hat, Inc.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { beforeEach, expect, Mock, test, vi } from 'vitest';
import * as podmanDesktopApi from '@podman-desktop/api';
import * as extension from './extension';
import { URI } from 'vscode-uri';

const getKubeconfigMock = podmanDesktopApi.kubernetes.getKubeconfig as unknown as Mock<any, any>;
getKubeconfigMock.mockReturnValue(URI.parse('file:///usr/home/test'));

const context: podmanDesktopApi.ExtensionContext = {
  subscriptions: [],
  storagePath: '',
  extensionUri: URI.parse('schema://path'),
  secrets: {
    get: vi.fn(),
    store: vi.fn(),
    delete: vi.fn(),
    onDidChange: vi.fn(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

test('kubernetes provider connection factory is set during activation', async () => {
  const providerMock: podmanDesktopApi.Provider = {
    setKubernetesProviderConnectionFactory: vi.fn(),
  } as any as podmanDesktopApi.Provider;
  const setKubeProvideConnFactoryMock = vi
    .spyOn(podmanDesktopApi.provider, 'createProvider')
    .mockReturnValue(providerMock);
  await extension.activate(context);
  expect(providerMock.setKubernetesProviderConnectionFactory).toBeCalled();
});
