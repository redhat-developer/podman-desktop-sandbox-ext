/**********************************************************************
 * Copyright (C) 2022 - 2023 Red Hat, Inc.
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

import { KubeConfig } from '@kubernetes/client-node';
import * as extensionApi from '@podman-desktop/api';
import got from 'got';
import * as kubeconfig from './kubeconfig';
import { getOpenShiftInternalRegistryPublicHost, whoami } from './openshift';

const ProvideDisplayName = 'Developer Sandbox';

const TelemetryLogger = extensionApi.env.createTelemetryLogger();

export const LoginCommandParam = 'redhat.sandbox.login.command';
export const ContextNameParam = 'redhat.sandbox.context.name';
export const DefaultContextParam = 'redhat.sandbox.context.default';

interface ConnectionData {
  disposable?: extensionApi.Disposable;
  connection: extensionApi.KubernetesProviderConnection;
  status: extensionApi.ProviderConnectionStatus;
}

const StartedStatus: extensionApi.ProviderConnectionStatus = 'started';
const UnknownStatus: extensionApi.ProviderConnectionStatus = 'unknown';

let provider: extensionApi.Provider;
let updateConnectionTimeout: NodeJS.Timeout;
let registeredConnections: Map<string, ConnectionData> = new Map<string, ConnectionData>();

type ImageInfo = { engineId: string; name?: string; tag?: string };

export async function pushImageToOpenShiftRegistry(image: ImageInfo): Promise<void> {
  const qp = Array.from(registeredConnections.values())
    .filter(connection => connection.status === 'started')
    .map(connection => connection.connection.name);
  if (!qp.length) {
    extensionApi.window.showInformationMessage(
      'You have no running Developer Sandbox connections. Please create new one and try again.',
    );
    return;
  }
  let targetSb: string;
  if (qp.length > 1) {
    targetSb = await extensionApi.window.showQuickPick(qp);
    if (!targetSb) {
      return;
    }
  } else {
    targetSb = qp[0];
  }
  let pushError: any;
  await extensionApi.window.withProgress(
    {
      location: extensionApi.ProgressLocation.TASK_WIDGET,
      title: `Pushing image '${image.name}:${image.tag}' to Developer Sandbox '${targetSb}'`,
    },
    async (progress, token) => {
      try {
        progress.report({ increment: 25 });
        const registryInfo = await getOpenShiftInternalRegistryPublicHost(targetSb);
        progress.report({ increment: 50 });
        const lastIndexOfSlash = image.name.lastIndexOf('/');
        const imageShortName = lastIndexOfSlash !== -1 ? image.name.substring(lastIndexOfSlash + 1) : image.name;
        const imageTagSuffix = image.tag ? `:${image.tag}` : ``;
        const localImageName = `${image.name}${imageTagSuffix}`;
        const remoteImageName = `${registryInfo.host}/${registryInfo.username}-dev/${imageShortName}${imageTagSuffix}`;
        if (localImageName !== remoteImageName) {
          await extensionApi.containerEngine.tagImage(
            image.engineId,
            image.name + imageTagSuffix,
            `${registryInfo.host}/${registryInfo.username}-dev/${imageShortName}`,
            image.tag,
          );
        }
        progress.report({ increment: 75 });
        await new Promise(async (resolve, reject) => {
          try {
            await extensionApi.containerEngine.pushImage(
              image.engineId,
              remoteImageName,
              (name, data) => {
                if (name === 'data') {
                  progress.report({ message: data });
                }
                if (name === 'end') {
                  resolve(undefined);
                }
              },
              { username: registryInfo.username, password: registryInfo.token, serveraddress: registryInfo.host },
            );
          } catch (err: unknown) {
            reject(err);
          }
        });
        progress.report({ increment: 100 });
        if (localImageName !== remoteImageName) {
          await extensionApi.window.showInformationMessage(
            `The image '${image.name}:${image.tag}' has been successfully pushed to to Developer Sandbox cluster '${targetSb}'. A new tag '${registryInfo.host}/${registryInfo.username}-dev/${imageShortName}${imageTagSuffix}' has been created for this image; you must use this image tag when deploying to Developer Sandbox`,
          );
        } else {
          await extensionApi.window.showInformationMessage(
            `The image '${image.name}:${image.tag}' has been successfully pushed to to Developer Sandbox cluster '${targetSb}'.`,
          );
        }
      } catch (err) {
        await extensionApi.window.showErrorMessage(
          `An error occurred while pushing the image '${image.name}:${image.tag}' to Developer Sandbox cluster '${targetSb}'. ${err}`,
        );
      }
    },
  );
}

async function deleteContext(contextName: string): Promise<void> {
  const config = kubeconfig.createOrLoadFromFile(extensionApi.kubernetes.getKubeconfig().fsPath);
  const context = config.getContextObject(contextName);
  const cluster = config.getCluster(context.cluster);
  const user = config.getUser(context.user);
  config.getContexts().splice(config.getContexts().indexOf(context), 1);
  config.getClusters().splice(config.getClusters().indexOf(cluster), 1);
  config.getUsers().splice(config.getUsers().indexOf(user), 1);
  kubeconfig.exportToFile(config, extensionApi.kubernetes.getKubeconfig().fsPath);
}

function deleteConnection(contextName: string) {
  const deletedConnection = registeredConnections.get(contextName);
  registeredConnections.delete(contextName);
  deletedConnection.disposable.dispose();
}

async function deleteConnectionAndUpdateKubeconfig(contextName: string): Promise<void> {
  deleteConnection(contextName);
  deleteContext(contextName);
}

async function registerConnection(contextName: string, apiURL: string, token: string): Promise<ConnectionData> {
  // check if cluster is accessible
  // const status = await getConnectionStatus(apiURL, token);
  const connection = {
    name: contextName,
    status: () => registeredConnections.get(contextName).status,
    endpoint: {
      apiURL,
    },
    lifecycle: {
      delete: async () => {
        return deleteConnectionAndUpdateKubeconfig(contextName);
      },
    },
  };
  const connectionData: ConnectionData = { connection, status: UnknownStatus };
  registeredConnections.set(contextName, connectionData);
  connectionData.disposable = provider.registerKubernetesProviderConnection(connection);
  return connectionData;
}

export async function activate(extensionContext: extensionApi.ExtensionContext): Promise<void> {
  console.log('starting extension redhat-developer-sandbox');

  let status: extensionApi.ProviderStatus = 'ready';
  const icon = './icon.png';

  const providerOptions: extensionApi.ProviderOptions = {
    name: ProvideDisplayName,
    id: 'redhat.sandbox',
    status,
    images: {
      icon: {
        dark: './statusbar-icon.png',
        light: './icon.png',
      },
      logo: icon,
    },
    emptyConnectionMarkdownDescription:
      'A free, private OpenShift environment including one project and a resource quota of 14 GB RAM, and 40 GB storage. It lasts 30 days.\n\nSign up at [https://developers.redhat.com/developer-sandbox](https://developers.redhat.com/developer-sandbox/?sc_cid=7013a000003SUmgAAG).',
  };

  extensionContext.subscriptions.push(
    extensionApi.commands.registerCommand('sandbox.open.login.url', () => {
      extensionApi.env
        .openExternal(extensionApi.Uri.parse('https://console.redhat.com/openshift/sandbox?sc_cid=7013a000003SUmgAAG'))
        .then(successful => {
          TelemetryLogger.logUsage('sandboxOpenLoginUrlRequest', { successful });
        });
    }),
  );

  provider = extensionApi.provider.createProvider(providerOptions);

  const kubeconfigUri = extensionApi.kubernetes.getKubeconfig();
  const kubeconfigFile = kubeconfigUri.fsPath;
  console.log('Config file location', kubeconfigFile);

  const disposable = provider.setKubernetesProviderConnectionFactory({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: async (
      params: { [key: string]: any },
      _logger?: extensionApi.Logger,
      _token?: extensionApi.CancellationToken,
    ) => {
      // check if context name is provided
      if (!params[ContextNameParam]) {
        throw new Error('Context name is required.');
      }

      // get form parameters
      const loginCommand: string = params[LoginCommandParam];
      if (loginCommand.trim().length === 0) {
        throw new Error('Login command is required.');
      }

      const apiURLMatch = loginCommand.match(/--server=([^\s]*)/);
      const tokenMatch = loginCommand.match(/--token=([^\s]*)/);

      if (!apiURLMatch || !tokenMatch) {
        throw new Error('Login command is invalid or missing required options --server and --token.');
      }

      const apiURL = apiURLMatch[1];
      const token = tokenMatch[1];

      // add cluster to kubeconfig
      const config = kubeconfig.createOrLoadFromFile(extensionApi.kubernetes.getKubeconfig().fsPath);

      if (config['contexts'].find(context => context['name'] === params[ContextNameParam])) {
        throw new Error(`Context ${params[ContextNameParam]} already exists, please choose a different name.`);
      }

      const suffix = Math.random().toString(36).substring(7);

      const clusterName = `sandbox-cluster-${suffix}`; // has unique name
      const userName = `sandbox-user-${suffix}`; // generate a unique name for the user
      const username: string = await whoami(apiURL, token);

      config.addCluster({
        server: apiURL,
        name: clusterName,
        skipTLSVerify: false,
      });
      config.addUser({
        name: userName,
        token,
      });
      config.addContext({
        cluster: clusterName,
        user: userName,
        name: params[ContextNameParam],
        namespace: `${username}-dev`,
      });

      if (params[DefaultContextParam]) {
        config.setCurrentContext(params[ContextNameParam]);
      }

      kubeconfig.exportToFile(config, kubeconfigFile);

      await registerConnection(params[ContextNameParam], apiURL, token);
    },
    creationDisplayName: ProvideDisplayName,
  });

  extensionContext.subscriptions.push(
    extensionApi.commands.registerCommand('sandbox.image.push.to.cluster', image => {
      pushImageToOpenShiftRegistry(image);
    }),
  );

  extensionContext.subscriptions.push(provider);
  extensionContext.subscriptions.push(disposable);
  updateConnectionsPeriodically();
}

function updateConnectionsPeriodically(): void {
  updateConnections().then(() => {
    updateConnectionTimeout = setTimeout(updateConnectionsPeriodically, 2000);
  });
}

export function deactivate(): void {
  console.log('deactivating redhat-developer-sandbox extension');
  if (updateConnectionTimeout) {
    clearTimeout(updateConnectionTimeout);
  }
}

async function updateConnections(): Promise<void> {
  let config: KubeConfig;
  let attempts = 0;
  while (attempts < 5) {
    try {
      config = kubeconfig.createOrLoadFromFile(extensionApi.kubernetes.getKubeconfig().fsPath);
      break;
    } catch (err) {
      console.error('Failed to load kubeconfig:', err);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }

  // TODO: Inform user that kubeconfig cannot be loaded
  if (!config) {
    console.error('Failed to load kubeconfig');
    return;
  }

  // delete connections that are not in kubeconfig anymore
  const deletedConnections = Array.from(registeredConnections.keys()).filter(
    contextName => !config.getContexts().find(context => context.name === contextName),
  );
  deletedConnections.forEach(contextName => {
    const deletedConnection = registeredConnections.get(contextName);
    deleteConnection(contextName);
    deletedConnection.disposable.dispose();
  });

  // update status of existin connections
  const updateStatusRequests = Array.from(registeredConnections.keys()).map(contextName => {
    // get current token from config file
    const token = config.getUser(config.getContextObject(contextName).user).token;
    const connectionData = registeredConnections.get(contextName);
    return getConnectionStatus(connectionData.connection.endpoint.apiURL, token).then(status => {
      connectionData.status = status;
    });
  });

  // what if connection is not responding?
  await Promise.all(updateStatusRequests);

  // add connections that are in kubeconfig but not registered
  const addedSandboxContexts = config
    .getContexts()
    .filter(context => context.cluster.startsWith('sandbox-cluster-'))
    .filter(context => !registeredConnections.get(context.name));
  await Promise.all(
    addedSandboxContexts.map(context => {
      const cluster = config.getCluster(context.cluster);
      return registerConnection(context.name, cluster.server, config.getUser(context.user).token);
    }),
  );
}

async function getConnectionStatus(apiURL: string, token: string): Promise<extensionApi.ProviderConnectionStatus> {
  return isTokenValid(apiURL, token)
    .then(() => {
      return StartedStatus;
    })
    .catch(error => {
      console.error('Failed to connect to cluster:', error);
      return UnknownStatus;
    });
}

async function isTokenValid(apiURL: string, token: string): Promise<void> {
  const usersApiURL = `${apiURL}/apis/user.openshift.io/v1/users/~`;
  return got(usersApiURL, { headers: { Authorization: `Bearer ${token}` } }).then(response => {
    if (response.statusCode === 200) {
      const responseObj = JSON.parse(response.body);
      if (responseObj.kind === 'User') {
        return;
      }
    }
    throw new Error('Token has expired.');
  });
}
