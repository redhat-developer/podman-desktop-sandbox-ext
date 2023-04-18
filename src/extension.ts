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

export async function activate(extensionContext: extensionApi.ExtensionContext): Promise<void> {
  console.log('starting extension redhat-authentication');

  const detectionChecks: extensionApi.ProviderDetectionCheck[] = [{
    name: 'check if logged in',
    status: false
  }];

  let status: extensionApi.ProviderStatus = 'not-installed';

  const providerOptions: extensionApi.ProviderOptions = {
    name: 'Developer Sandbox',
    id: 'sandbox',
    detectionChecks,
    status,
  };
  const provider = extensionApi.provider.createProvider(providerOptions);
  
  const disposable = provider.setKubernetesProviderConnectionFactory({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: async (params: { [key: string]: any }, logger?: extensionApi.Logger, token?: extensionApi.CancellationToken) => {
      return;
    },
    creationDisplayName: 'Sandbox Cluster',
    initialize: async () : Promise<void> => {
           return;
    },
    authenticationProviderId: 'redhat.autentication-provider'
  });

  provider.registerInstallation({
    install: async (logger: extensionApi.Logger) => {
      extensionApi.window.showInformationMessage('Sandbox Cluster installed');
      return;
    },
    preflightChecks: () => [{
        title: 'check if logged in',
        execute: (): Promise<extensionApi.CheckResult> => {
          return new Promise((resolve, reject) => {
            extensionApi.window.showInformationMessage('Sandbox Cluster preflight check');
            resolve({successful: true, description: 'Sandbox Cluster preflight check'});
          });
      } 
    }]
  });
  extensionContext.subscriptions.push(provider);
}