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
import * as fs from 'fs-extra';
import * as jsYaml from 'js-yaml';


async function createOrLoadKubeConfig(kubeconfigFile = extensionApi.kubernetes.getKubeconfig().fsPath) {
  let config:any = {
    contexts: [],
    users: [],
    clusters: []
  };

  // Do not load from default locations if it is not present
  // It will be added later if sandbox url and token provided
  if (fs.existsSync(kubeconfigFile)) {
    config = loadKubeconfig(kubeconfigFile);
  }
  return config;
}

async function loadKubeconfig(kubeconfigFile): Promise<{ [key: string]: any }> {
  // load existing sandbox contexts form kubeconfig
  const kubeConfigRawContent = await fs.promises.readFile(kubeconfigFile, 'utf-8');
  // parse the content using jsYaml
  const config = jsYaml.load(kubeConfigRawContent);
  return config;
}

function updateConnections() {
  setTimeout(() => {
    

    updateConnections(),
    5000
  });
}

export async function activate(extensionContext: extensionApi.ExtensionContext): Promise<void> {
  console.log('starting extension openshift-sandbox');

  let status: extensionApi.ProviderStatus = 'installed';
  const icon = './icon.png';

  const providerOptions: extensionApi.ProviderOptions = {
    name: 'Developer Sandbox',
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

  const provider = extensionApi.provider.createProvider(providerOptions);
  
  const LoginCommandParam = 'redhat.sandbox.login.command';
  const ContextNameParam = 'redhat.sandbox.context.name';

  const kubeconfigUri = await extensionApi.kubernetes.getKubeconfig();
  const kubeconfigFile = kubeconfigUri.fsPath;

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

      const apiURLMatch = loginCommand.match(/--server=([^\s]*)/);
      const tokenMatch = loginCommand.match(/--token=([^\s]*)/);
      if (!apiURLMatch || !tokenMatch ) {
        throw new Error('Login command is invalid or missing required options --server and --token.');
      }

      const apiURL = apiURLMatch[1];
      const token = tokenMatch[1];

      // check if cluster is accessible
      const status = await isClusterAccessible(apiURL, token);

      // add cluster to kubeconfig
      const config = await createOrLoadKubeConfig();
     
      const suffix = Math.random().toString(36).substring(7);

      const cluster = {
        cluster: {
          server: apiURL,
        }, 
        name: `sandbox-cluster-${suffix}`, // generate a unique name for the cluster
        skipTLSVerify: false
      };

      const user = {
        name: `sandbox-user-${suffix}`, // generate a unique name for the user
        user: {
          token
        }
      };
      const context = {
        context: {
          cluster: cluster.name,
          user: user.name,
          name: params[ContextNameParam]
        },
        name: params[ContextNameParam]
      };

      if (config['contexts'].find(context => context['name'] === params[ContextNameParam])) {
        throw new Error(`Context ${params[ContextNameParam]} already exists, please choose a different name.`);
      }
      config['clusters'].push(cluster); // has unique name
      config['users'].push(user); // has unique name
      config['contexts'].push(context); // the name is user-defined and checked for uniqueness above

      fs.writeFileSync(
        kubeconfigFile, jsYaml.dump(config, { noArrayIndent: true, quotingType: '"', lineWidth: -1 }),
        'utf-8',
      );

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
  
  let sandboxConnections: extensionApi.KubernetesProviderConnection[] = [];
  
  if (fs.existsSync(kubeconfigFile)) {
    const config = await loadKubeconfig(kubeconfigFile);
    sandboxConnections = config['contexts'].filter(context => { 
      return context['context']['cluster'].startsWith('sandbox-cluster-');
    }).map(context => {
      const clusterName = context['context']['cluster'];
      const cluster = config['clusters'].find(cluster => cluster['name'] === clusterName);
      return {
        name: context.name,
        status: () => {
          return 'unknown'
        },
        endpoint: {
          apiURL: cluster['cluster']['server']
        }, lifecycle: {
          delete: async () => {
            // delete from kubeconfig when delete for remote resource is unlocked
            return;
          }
        }
      };
    });
  }
  
  sandboxConnections.forEach(connection => provider.registerKubernetesProviderConnection(connection));

  setTimeout(() => {
    // sandboxConnections.forEach(connection => provider.)
  })
  
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
  return 'unknown'
}