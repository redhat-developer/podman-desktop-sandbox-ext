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

const ProvideDisplayName = 'Developer Sandbox'

let provider: extensionApi.Provider;
let updateConnectionTimeout: NodeJS.Timeout;
let registeredConnections: extensionApi.Disposable[] = [];

export async function activate(extensionContext: extensionApi.ExtensionContext): Promise<void> {
  console.log('starting extension openshift-sandbox');

  let status: extensionApi.ProviderStatus = 'ready';
  const icon = './icon.png';

  const providerOptions: extensionApi.ProviderOptions = {
    name: ProvideDisplayName,
    id: 'redhat.sandbox',
    status,
    images: {
      icon,
      logo: {
        dark: icon,
        light: icon,
      }
    },
  };

  provider = extensionApi.provider.createProvider(providerOptions);
  
  const LoginCommandParam = 'redhat.sandbox.login.command';
  const ContextNameParam = 'redhat.sandbox.context.name';

  const kubeconfigUri = extensionApi.kubernetes.getKubeconfig();
  const kubeconfigFile = kubeconfigUri.fsPath;
  console.log('Configfile location', kubeconfigFile);

  const disposable = provider.setKubernetesProviderConnectionFactory({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: async (params: { [key: string]: any }, _logger?: extensionApi.Logger, _token?: extensionApi.CancellationToken) => {

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
      
      if (!apiURLMatch || !tokenMatch ) {
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

      const clusterName = `sandbox-cluster-${suffix}`;  // has unique name
      const userName = `sandbox-user-${suffix}`; // generate a unique name for the user

      config.addCluster({
        server: apiURL,
        name: clusterName,
        skipTLSVerify: false
      });
      config.addUser({
        name: userName,
        token
      });
      config.addContext({
        cluster: clusterName,
        user: userName,
        name: params[ContextNameParam],
      });

      kubeconfig.exportToFile(config, kubeconfigFile);

      // check if cluster is accessible
      const status = await getConnectionStatus(apiURL, token);
      
      const disposable = provider.registerKubernetesProviderConnection({
        name: params[ContextNameParam], 
        status: () => status, 
        endpoint: {
          apiURL
        }, lifecycle: {
          delete: async () => {
            return;
          }
        }
      });
      registeredConnections.push(disposable);
    },
    creationDisplayName: ProvideDisplayName,
  });

  extensionContext.subscriptions.push(provider);
  // run update connections once to load existing connections to avoid 2s delay
  updateConnections().then (() => {
    updateConnectionsPreiodically()
  });
}

function updateConnectionsPreiodically(): void {
   updateConnectionTimeout = setTimeout(() => {
    updateConnections().then(updateConnectionsPreiodically);
   }, 2000);
}

export function deactivate(): void {
  console.log('deactivating extension openshift-sandbox');
  if (updateConnectionTimeout) {
    clearTimeout(updateConnectionTimeout);
  } 
}

async function updateConnections(): Promise<void> {
  let config:KubeConfig;
  let attempts = 0;
  while (attempts < 5) {
    try {
      config = kubeconfig.createOrLoadFromFile(extensionApi.kubernetes.getKubeconfig().fsPath);
    } catch (err) {
      console.error('Failed to load kubeconfig:', err);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    attempts++;
  }

  // TODO: Inform user that kubeconfig cannot be loaded
  if (!config) {
    console.error('Failed to load kubeconfig');
    registeredConnections.forEach(connection => connection.dispose());
    return;
  }

  registeredConnections = await Promise.all(config.getContexts().filter(
    context => context.cluster.startsWith('sandbox-cluster-')
  ).map(async context => {
    const cluster = config.getCluster(context.cluster);
    const status = await getConnectionStatus(cluster.server, config.getUser(context.user).token);
    return {
      name: context.name,
      status: () => {
        return status;
      },
      endpoint: {
        apiURL: cluster.server
      }, lifecycle: {
        delete: async () => {
          // delete from kubeconfig when delete for remote resource is unlocked
          return;
        }
      }
    };
  })).then(connections => {
    registeredConnections.forEach(connection => connection.dispose()); 
    return connections.map(connection => provider.registerKubernetesProviderConnection(connection));
  });
}

const StartedStatus: extensionApi.ProviderConnectionStatus = 'started';
const UnknownStatus: extensionApi.ProviderConnectionStatus = 'unknown';

async function getConnectionStatus(apiURL: string, token: string) : Promise<extensionApi.ProviderConnectionStatus> {
  return isTokenValid(apiURL, token).then(() => {
    return StartedStatus;
  }).catch((error) => {
    console.error('Failed to connect to cluster:', error);
    return UnknownStatus;
  });
}

async function isTokenValid(apiURL: string, token: string): Promise<void> {
  const usersApiURL = `${apiURL}/apis/user.openshift.io/v1/users/~`;
  return got(usersApiURL, { headers: { Authorization: `Bearer ${token}`}}).then((response) => {
    if (response.statusCode === 200) {
      const responseObj = JSON.parse(response.body);
      if (responseObj.kind === 'User') {
        return;
      }
    }
    throw new Error('Token has expired.');
  });
}