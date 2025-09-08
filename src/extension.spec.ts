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

import { beforeEach, describe, expect, suite, test, vi } from 'vitest';
import * as podmanDesktopApi from '@podman-desktop/api';
import * as extension from './extension.js';
import { URI } from 'vscode-uri';
import * as openshift from './openshift.js';
import * as sandbox from './sandbox.js';
import * as kubeconfig from './kubeconfig.js';
import { CoreV1Api, KubeConfig } from '@kubernetes/client-node';
import got from 'got';

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
        body: JSON.stringify({ kind: 'User', metadata: { name: 'system:serviceaccount:username-dev:pipeline' } }),
      };
    }
  }),
}));

vi.mock(import('./sandbox.js'), async importOriginal => {
  const original = await importOriginal();
  return {
    ...original,
    getSignUpStatus: vi.fn(),
    signUp: vi.fn(),
    getRegistrationServiceTimeout: vi.fn(),
  };
});

vi.mock(import('./utils.js'), () => {
  return {
    delay: vi.fn().mockResolvedValue(undefined),
  };
});

beforeEach(() => {
  vi.restoreAllMocks();
  const getKubeconfigMock = vi.mocked(podmanDesktopApi.kubernetes.getKubeconfig);
  getKubeconfigMock.mockReturnValue(URI.parse('file:///usr/home/test'));
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

suite('kubernetes provider connection factory', () => {
  async function callCreate(
    params: { [key: string]: any } = {},
    config: KubeConfig = new KubeConfig(),
    mockSandboxCalls?: () => void,
    mockGetPipelineServiceAccountToken?: () => void,
  ): Promise<{ error: Error; provider: podmanDesktopApi.Provider } | undefined> {
    const providerMock: podmanDesktopApi.Provider = {
      setKubernetesProviderConnectionFactory: vi.fn(),
      registerKubernetesProviderConnection: () => ({
        dispose: vi.fn(),
      }),
    } as any as podmanDesktopApi.Provider;
    vi.spyOn(podmanDesktopApi.provider, 'createProvider').mockReturnValue(providerMock);
    vi.spyOn(podmanDesktopApi.authentication, 'getSession').mockResolvedValue({
      id: '1',
      accessToken: 'accessTokenString',
      idToken: 'idTokenString',
    } as unknown as podmanDesktopApi.AuthenticationSession);
    await extension.activate(context);
    const connectionFactory = vi.mocked(providerMock.setKubernetesProviderConnectionFactory).mock.calls[0][0];
    let verificationError: Error;
    try {
      mockSandboxCalls?.();
      if (!mockSandboxCalls) {
        vi.mocked(sandbox.getSignUpStatus).mockResolvedValue({
          apiEndpoint: 'https//:sandbox-host-url',
          username: 'username',
          status: {
            ready: true,
          },
        } as unknown as sandbox.SBSignupResponse);
      }
      mockGetPipelineServiceAccountToken?.();
      if (!mockGetPipelineServiceAccountToken) {
        vi.spyOn(openshift, 'getPipelineServiceAccountToken').mockResolvedValue('token');
      }
      vi.spyOn(openshift, 'whoami').mockResolvedValue('system:serviceaccount:username-dev:pipeline');
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

  test('creates new context for sandbox with specified url/token and sets it as default context', async () => {
    const config = new KubeConfig();
    await callCreate(
      {
        'redhat.sandbox.context.name': 'contextName',
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

  describe('discovers sandbox trial is not active', () => {
    test(`fails if it can't sign up for a trial`, async () => {
      const config = new KubeConfig();
      const sandboxAPIMock = () => {
        vi.mocked(sandbox.getSignUpStatus).mockRejectedValueOnce(new Error('Not signed up for a trial.'));
        vi.mocked(sandbox.signUp).mockRejectedValueOnce(new Error(`Could't start trail`));
      };
      let { error: createConnectionError } = await callCreate(
        {
          'redhat.sandbox.context.name': 'contextName',
          'redhat.sandbox.context.default': false,
        },
        config,
        sandboxAPIMock,
      );
      expect(createConnectionError).toBeDefined();
      expect(createConnectionError?.message).toContain('request for a trial failed');
    });

    test(`successfully signs up for a trial and creates connection when sandbox is ready right away`, async () => {
      const config = new KubeConfig();
      const sandboxAPIMock = () => {
        vi.mocked(sandbox.getSignUpStatus)
          .mockRejectedValueOnce(new Error('Not signed up for a trial.'))
          .mockResolvedValueOnce({
            apiEndpoint: 'https//:sandbox-host-url',
            username: 'username',
            status: {
              ready: true,
            },
          } as unknown as sandbox.SBSignupResponse);
        vi.mocked(sandbox.signUp).mockResolvedValueOnce();
      };
      let { provider, error: createConnectionError } = await callCreate(
        {
          'redhat.sandbox.context.name': 'contextName',
          'redhat.sandbox.context.default': true,
        },
        config,
        sandboxAPIMock,
      );
      expect(createConnectionError).toBeUndefined();
      expect(provider).toBeDefined();
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

    test(`successfully signs up for a trial and shows message about account verification requirement`, async () => {
      const config = new KubeConfig();
      const sandboxAPIMock = () => {
        vi.mocked(sandbox.getSignUpStatus)
          .mockRejectedValueOnce(new Error('Not signed up for a trial.'))
          .mockResolvedValueOnce({
            apiEndpoint: 'https//:sandbox-host-url',
            username: 'username',
            status: {
              ready: false,
              verificationRequired: true,
            },
          } as unknown as sandbox.SBSignupResponse);
        vi.mocked(sandbox.signUp).mockResolvedValueOnce();
      };
      let { error: createConnectionError } = await callCreate(
        {
          'redhat.sandbox.context.name': 'contextName',
          'redhat.sandbox.context.default': true,
        },
        config,
        sandboxAPIMock,
      );
      expect(createConnectionError).toBeDefined();
      expect(createConnectionError?.message).toContain('verification is required');
    });

    test(`successfully signs up for a trial and shows message about account waiting for approval`, async () => {
      const config = new KubeConfig();
      const sandboxAPIMock = () => {
        vi.mocked(sandbox.getSignUpStatus)
          .mockRejectedValueOnce(new Error('Not signed up for a trial.'))
          .mockResolvedValueOnce({
            apiEndpoint: 'https//:sandbox-host-url',
            username: 'username',
            status: {
              ready: false,
              verificationRequired: false,
              reason: 'PendingApproval',
            },
          } as unknown as sandbox.SBSignupResponse);
        vi.mocked(sandbox.signUp).mockResolvedValueOnce();
      };
      let { error: createConnectionError } = await callCreate(
        {
          'redhat.sandbox.context.name': 'contextName',
          'redhat.sandbox.context.default': true,
        },
        config,
        sandboxAPIMock,
      );
      expect(createConnectionError).toBeDefined();
      expect(createConnectionError?.message).toContain('waiting for approval');
    });

    test(`successfully signs up for a trial and shows message about account not provisioned yet`, async () => {
      const config = new KubeConfig();
      const sandboxAPIMock = () => {
        vi.mocked(sandbox.getSignUpStatus)
          .mockRejectedValueOnce(new Error('Not signed up for a trial.'))
          .mockResolvedValueOnce({
            apiEndpoint: 'https//:sandbox-host-url',
            username: 'username',
            status: {
              ready: false,
              verificationRequired: false,
              reason: 'Provisioned',
            },
          } as unknown as sandbox.SBSignupResponse);
        vi.mocked(sandbox.signUp).mockResolvedValueOnce();
      };
      let { error: createConnectionError } = await callCreate(
        {
          'redhat.sandbox.context.name': 'contextName',
          'redhat.sandbox.context.default': true,
        },
        config,
        sandboxAPIMock,
      );
      expect(createConnectionError).toBeDefined();
      expect(createConnectionError?.message).toContain('not provisioned');
    });

    test('creates new secret for pipeline service account if does not exist', async () => {
      const config = new KubeConfig();
      const sandboxAPIMock = () => {
        vi.mocked(sandbox.getRegistrationServiceTimeout).mockReturnValue(30000);
        vi.mocked(sandbox.getSignUpStatus).mockResolvedValue({
          apiEndpoint: 'https//:sandbox-host-url',
          username: 'username',
          compliantUsername: 'compliantUsername',
          status: {
            ready: true,
          },
        } as unknown as sandbox.SBSignupResponse);
        vi.mocked(sandbox.signUp).mockResolvedValueOnce();
      };
      const getTokenMock = () => {
        vi.spyOn(CoreV1Api.prototype, 'listNamespacedServiceAccount').mockResolvedValue({
          items: [
            {
              metadata: {
                name: 'pipeline',
                uid: 'unique-id1',
              },
            },
          ],
        });
        vi.spyOn(CoreV1Api.prototype, 'createNamespacedSecret').mockResolvedValue(undefined);
        const responseError = new Error();
        responseError['response'] = {
          statusCode: 404,
        };
        vi.spyOn(CoreV1Api.prototype, 'readNamespacedSecret')
          .mockRejectedValueOnce(responseError)
          .mockRejectedValueOnce(responseError)
          .mockResolvedValueOnce({
            data: {
              token: Buffer.from('token12345678').toString('base64'),
            },
          });
        vi.spyOn(CoreV1Api.prototype, 'listNamespacedSecret').mockResolvedValue({
          items: [
            {
              metadata: {
                name: 'builder',
              },
            },
          ],
        });
      };
      let { provider, error: createConnectionError } = await callCreate(
        {
          'redhat.sandbox.context.name': 'contextName',
          'redhat.sandbox.context.default': true,
        },
        config,
        sandboxAPIMock,
        getTokenMock,
      );
      expect(createConnectionError).toBeUndefined();
      expect(provider).toBeDefined();
      expect(kubeconfig.exportToFile).toHaveBeenCalledOnce();
      expect(config.getContexts()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'contextName',
          }),
        ]),
      );
      expect(config.getUsers()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.anything(),
            token: 'token12345678',
          }),
        ]),
      );
      expect(config.currentContext).toEqual('contextName');
    });
  });
});

test('push image to sandbox does not change title after it is finished', async () => {
  vi.mocked(got).mockImplementation(
    // use vi.fn(), so there is no need to deal with types safety when mocking
    vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('users')) {
        return {
          statusCode: 200,
          body: JSON.stringify({ kind: 'User', metadata: { name: 'system:serviceaccount:username-dev:pipeline' } }),
        };
      } else if (url.includes('imagestreams')) {
        return {
          statusCode: 200,
          body: JSON.stringify({ items: [{ status: { publicDockerImageRepository: 'registry-host' } }] }),
        };
      }
    }),
  );
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
          server: 'https://region.openshiftapps.com:6443',
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
      _options: podmanDesktopApi.ProgressOptions,
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
