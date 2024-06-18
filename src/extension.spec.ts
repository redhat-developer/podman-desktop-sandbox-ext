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

import { beforeEach, expect, Mock, suite, test, vi } from 'vitest';
import * as podmanDesktopApi from '@podman-desktop/api';
import * as extension from './extension';
import { URI } from 'vscode-uri';
import * as openshift from './openshift';
import * as kubeconfig from './kubeconfig';
import { KubeConfig } from '@kubernetes/client-node';

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

suite('kubernetes provider connection factory', () => {
  async function callCreate(
    params: { [key: string]: any } = {},
    config: KubeConfig = new KubeConfig(),
    username: string = 'username',
  ): Promise<{ error: Error; provider: podmanDesktopApi.Provider } | undefined> {
    const providerMock: podmanDesktopApi.Provider = {
      setKubernetesProviderConnectionFactory: vi.fn(),
    } as any as podmanDesktopApi.Provider;
    const setKubeProvideConnFactoryMock = vi
      .spyOn(podmanDesktopApi.provider, 'createProvider')
      .mockReturnValue(providerMock);
    await extension.activate(context);
    const connectionFactory = vi.mocked(providerMock.setKubernetesProviderConnectionFactory).mock.calls[0][0];
    let verificationError: Error;
    try {
      vi.spyOn(openshift, 'whoami').mockResolvedValue('username');
      vi.spyOn(kubeconfig, 'createOrLoadFromFile').mockReturnValue(config);
      vi.spyOn(kubeconfig, 'exportToFile').mockImplementation(vi.fn());
      await connectionFactory.create(params);
    } catch (e) {
      verificationError = e;
    }
    return {
      error: verificationError,
      provider: providerMock,
    };
  }

  test('verifies context name is entered', async () => {
    const { error: verificationError } = await callCreate();

    expect(verificationError).toBeDefined();
    expect(verificationError.message).is.equal('Context name is required.');
  });

  test('verifies login command is not empty', async () => {
    const { error: verificationError } = await callCreate({
      'redhat.sandbox.context.name': 'contextName',
      'redhat.sandbox.login.command': '',
    });
    expect(verificationError).toBeDefined();
    expect(verificationError.message).is.equal('Login command is required.');
  });

  test('verifies login command has --server and --token options', async () => {
    const results = await Promise.all(
      ['oc login', 'oc login --server=https://server', 'oc login --token=token_text'].map(loginCommand =>
        callCreate({
          'redhat.sandbox.context.name': 'contextName',
          'redhat.sandbox.login.command': loginCommand,
        }),
      ),
    );
    expect(results).toHaveLength(3);
    results.forEach(result => {
      expect(result.error.message).toBe('Login command is invalid or missing required options --server and --token.');
    });
  });

  test('creates new context for sandbox with specified url/token and sets it as default context', async () => {
    const config = new KubeConfig();
    const result = await callCreate(
      {
        'redhat.sandbox.context.name': 'contextName',
        'redhat.sandbox.login.command': 'oc login --server=https://sandbox.openshift.com --token=base64_secret',
        'redhat.sandbox.context.default': true,
      },
      config,
      'username',
    );
    expect(kubeconfig.exportToFile).toHaveBeenCalledOnce();
    expect(config.getContexts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'contextName',
        }),
      ]),
    );
    expect(config.currentContext).toEqual('contextName');
  });

  test('creates new context for sandbox with specified url/token and does not set it as default context', async () => {
    const config = new KubeConfig();
    const result = await callCreate(
      {
        'redhat.sandbox.context.name': 'contextName',
        'redhat.sandbox.login.command': 'oc login --server=https://sandbox.openshift.com --token=base64_secret',
        'redhat.sandbox.context.default': false,
      },
      config,
      'username',
    );
    expect(kubeconfig.exportToFile).toHaveBeenCalledOnce();
    expect(config.getContexts()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'contextName',
        }),
      ]),
    );
    expect(config.currentContext).is.not.equal('contextName');
  });
});
