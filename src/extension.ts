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

import * as extensionApi from '@podman-desktop/api';
import * as k8s from '@kubernetes/client-node';
import * as fs from 'fs-extra';
import * as path from 'path';
import got from 'got';
import { findHomeDir } from '@kubernetes/client-node';

export async function activate(extensionContext: extensionApi.ExtensionContext): Promise<void> {
  console.log('starting extension openshift-sandbox');

  let status: extensionApi.ProviderStatus = 'installed';

  const providerOptions: extensionApi.ProviderOptions = {
    name: 'Developer Sandbox',
    id: 'redhat.sandbox',
    status,
  };
  const provider = extensionApi.provider.createProvider(providerOptions);
  
  const LoginCommandParam = 'redhat.sandbox.login.command';
  const ContextNameParam = 'redhat.sandbox.context.name';

  const disposable = provider.setKubernetesProviderConnectionFactory({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: async (params: { [key: string]: any }, _logger?: extensionApi.Logger, _token?: extensionApi.CancellationToken) => {

      // check if context name is provided
      if (!params[ContextNameParam]) {
        throw new Error('Context name is required.');
      }

      // get form parameters
      const loginCommand:string = params[LoginCommandParam];
      if (loginCommand.trim().length === 0) {
        throw new Error('Login command is required.');
      }

      const apiURLMatch = loginCommand.match(/--server=(.*)/);
      const tokenMatch = loginCommand.match(/--token=(.*)/);
      if (!apiURLMatch || !tokenMatch ) {
        throw new Error('Login command is invalid or missing required options --server and --token.');
      }

      const apiURL = apiURLMatch[1];
      const token = tokenMatch[1];

      // check if cluster is accessible
      const status = await isClusterAccessible(apiURL, token);

      // add cluster to kubeconfig
      const config = new k8s.KubeConfig();
      config.loadFromDefault();
      
      const suffix = Math.random().toString(36).substring(7);

      const cluster: k8s.Cluster = {
        server: apiURL,
        name: `sandbox-cluster-${suffix}`, // generate a unique name for the cluster
        skipTLSVerify: false
      };
      const user = {
        name: `sandbox-user-${suffix}`, // generate a unique name for the user
        token
      };
      const context = {
        cluster: cluster.name,
        user: user.name,
        name: params[ContextNameParam]
      };
      if (config.getContextObject(context.name)) {
        throw new Error(`Context ${context.name} already exists, please choose a different name.`);
      }
      config.addCluster(cluster); // has unique name
      config.addUser(user); // has unique name
      config.addContext(context); // the name is user-defined and checked for uniqueness above
      const json = config.exportConfig();
      fs.writeFileSync(path.join(k8s.findHomeDir(), '.kube', 'config'), json);
      provider.registerKubernetesProviderConnection({
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
    },
    creationDisplayName: 'Sandbox'
  });

  const config = new k8s.KubeConfig();
  config.loadFromDefault();

  const sandboxConnectionPromises: Promise<extensionApi.KubernetesProviderConnection>[] 
    = config.contexts.filter(context => { 
      const serverName = config.getCluster(context.cluster).name
      return serverName.startsWith('sandbox-cluster-');
    }).map(async context => {
      const cluster = config.getCluster(context.cluster);
      const user = config.getUser(context.user);
      const status = await isClusterAccessible(cluster.server, user.token);
      return {
        name: context.name,
        status: () => status,
        endpoint: {
          apiURL: cluster.server
        }, lifecycle: {
          delete: async () => {
            // delete from kubeconfig when delete for remote resource is unlocked
            return;
          }
        }
      };
    });
  
  const sandboxConnections = await Promise.all(sandboxConnectionPromises);
  sandboxConnections.forEach(connection => provider.registerKubernetesProviderConnection(connection));
  
  extensionApi.containerEngine.onEvent(async event => {
    console.log('container event', event.Type);
  });
  extensionApi.provider.onDidRegisterContainerConnection(async (connection) => {
    console.log('connection registered', connection);
  });

  extensionApi.provider.onDidUnregisterContainerConnection(async (connection) => {  
    console.log('connection unregistered', connection);
  });

  extensionApi.provider.onDidUpdateContainerConnection(async (connection) => {
    console.log('connection updated', connection);
  });
  
  extensionApi.provider.onDidUpdateKubernetesConnection(async (connection) => { 
    console.log('kubernetes connection updated', connection);
  });

  extensionApi.provider.onDidUpdateProvider(async (provider) => {
    console.log('provider updated', provider);
  });
  
  extensionContext.subscriptions.push(provider);
}

async function isClusterAccessible(apiURL: string, token: string): Promise<extensionApi.ProviderConnectionStatus> {
    return got(apiURL, { headers: { Authorization: `Bearer ${token}`}}).then((response) => {
      if (response.statusCode === 200) {
        return 'started'
      }
      return 'unknown'
    }
  );
}