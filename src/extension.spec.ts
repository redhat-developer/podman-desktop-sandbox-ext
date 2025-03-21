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

vi.mock('got', () => ({
  default: vi.fn().mockImplementation(async (url: string) => {
    if (url.includes('users')) {
      return {
        statusCode: 200,
        body: JSON.stringify({ kind: 'User', metadata: { name: 'username' } }),
      };
    } else {
      return {
        statusCode: 200,
        body: JSON.stringify({ items: [{ status: { publicDockerImageRepository: 'registry-host' } }] }),
      };
    }
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

test('kubernetes provider connection factory is set during activation', async () => {
  const providerMock: podmanDesktopApi.Provider = {
    setKubernetesProviderConnectionFactory: vi.fn(),
    registerKubernetesProviderConnection: () => ({
      dispose: vi.fn(),
    }),
  } as any as podmanDesktopApi.Provider;
  vi.spyOn(podmanDesktopApi.provider, 'createProvider').mockReturnValue(providerMock);
  await extension.activate(context);
  expect(providerMock.setKubernetesProviderConnectionFactory).toBeCalled();
});
``;
suite('kubernetes provider connection factory', () => {
  async function callCreate(
    params: { [key: string]: any } = {},
    config: KubeConfig = new KubeConfig(),
  ): Promise<{ error: Error; provider: podmanDesktopApi.Provider } | undefined> {
    const providerMock: podmanDesktopApi.Provider = {
      setKubernetesProviderConnectionFactory: vi.fn(),
      registerKubernetesProviderConnection: () => ({
        dispose: vi.fn(),
      }),
    } as any as podmanDesktopApi.Provider;
    vi.spyOn(podmanDesktopApi.provider, 'createProvider').mockReturnValue(providerMock);
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
    await callCreate(
      {
        'redhat.sandbox.context.name': 'contextName',
        'redhat.sandbox.login.command': 'oc login --server=https://sandbox.openshift.com --token=base64_secret',
        'redhat.sandbox.context.default': false,
      },
      config,
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

  test('push image to sandbox does not change title after it is finished', async () => {
    vi.spyOn(kubeconfig, 'createOrLoadFromFile').mockImplementation((_file: string) => {
      const config = new KubeConfig();
      config.loadFromOptions({
        contexts: [
          {
            cluster: 'sandbox-cluster-5s99ck',
            name: 'dev-sandbox-context',
            user: 'sandbox-user-5s99ck',
            namespace: 'username-dev',
          },
        ],
        clusters: [
          {
            name: 'sandbox-cluster-5s99ck',
            server: 'https://reqion.openshiftapps.com:6443',
            skipTLSVerify: false,
          },
        ],
        users: [
          {
            name: 'sandbox-user-5s99ck',
            token: 'sha256~token',
          },
        ],
      });
      return config;
    });
    const registerCommandMock = vi.mocked(podmanDesktopApi.commands.registerCommand);
    let commandCallback: (...args: any[]) => any;
    registerCommandMock.mockImplementation((commandId: string, callback: (...args: any[]) => any) => {
      if (commandId === 'sandbox.image.push.to.cluster') {
        commandCallback = callback;
      }
      return {
        dispose: vi.fn(),
      };
    });
    let registeredConnection: { status: () => any };
    const providerMock: podmanDesktopApi.Provider = {
      setKubernetesProviderConnectionFactory: vi.fn(),
      registerKubernetesProviderConnection: connection => {
        registeredConnection = connection;
        return {
          dispose: vi.fn(),
        };
      },
    } as any as podmanDesktopApi.Provider;
    vi.spyOn(podmanDesktopApi.provider, 'createProvider').mockReturnValue(providerMock);
    const report = vi.fn();
    vi.mocked(podmanDesktopApi.window.withProgress).mockImplementation(
      (
        options: podmanDesktopApi.ProgressOptions,
        task: (
          progress: podmanDesktopApi.Progress<{
            message?: string;
            increment?: number;
          }>,
          token: podmanDesktopApi.CancellationToken,
        ) => Promise<unknown>,
      ): Promise<void> => {
        const progress: podmanDesktopApi.Progress<{ message?: string; increment?: number }> = {
          report,
        };
        task(progress, undefined);
        return;
      },
    );
    let pushImageCallback: (name: string, data?: string) => void;
    vi.mocked(podmanDesktopApi.containerEngine.pushImage).mockImplementation(
      async (
        _engineId: string,
        _imageId: string,
        callback: (name: string, data: string) => Promise<void>,
        _authInfo?: podmanDesktopApi.ContainerAuthInfo,
      ) => {
        pushImageCallback = callback;
      },
    );
    await extension.activate(context);

    await vi.waitFor(async () => {
      expect(registeredConnection.status()).toEqual('started');
    }, 3000);

    expect(commandCallback).toBeDefined();

    const imageInfo = { engineId: 'podman', name: 'imageName', tag: 'registry-host/repository/image' };

    await Promise.resolve(commandCallback(...[imageInfo]));

    await vi.waitFor(async () => {
      expect(pushImageCallback).toBeDefined();
    }, 3000);

    pushImageCallback('data', 'data-chunk-1');
    pushImageCallback('end');

    expect(report).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'data-chunk-1' }));
  });
});
