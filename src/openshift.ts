/**********************************************************************
 * Copyright (C) 2024 Red Hat, Inc.
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

import got from 'got';
import * as kubeconfig from './kubeconfig.js';
import * as extensionApi from '@podman-desktop/api';
import { CoreV1Api, KubeConfig, V1Secret, V1ServiceAccount } from '@kubernetes/client-node';

export interface InternalRegistryInfo {
  host: string;
  username: string;
  token: string;
}

export async function whoami(clusterUrl: string, token: string): Promise<string> {
  const gotOptions = {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };

  const username: string = await got(`${clusterUrl}/apis/user.openshift.io/v1/users/~`, gotOptions).then(response => {
    if (response.statusCode === 200) {
      const responseObj = JSON.parse(response.body);
      return responseObj.metadata.name;
    }
    throw new Error('Developer Sandbox username cannot be detected.');
  });
  return username;
}

export async function getOpenShiftInternalRegistryPublicHost(contextName: string): Promise<InternalRegistryInfo> {
  const config = kubeconfig.createOrLoadFromFile(extensionApi.kubernetes.getKubeconfig().fsPath);
  const context = config.getContextObject(contextName);
  const cluster = config.getCluster(context.cluster);
  const user = config.getUser(context.user);
  const gotOptions = {
    headers: {
      Authorization: `Bearer ${user.token}`,
    },
  };
  const publicRegistry: string = await got(
    `${cluster.server}/apis/image.openshift.io/v1/namespaces/openshift/imagestreams`,
    gotOptions,
  ).then(response => {
    if (response.statusCode === 200) {
      const responseObj = JSON.parse(response.body);
      if (responseObj.items.length) {
        return responseObj.items[0].status.publicDockerImageRepository;
      }
    }
    throw new Error('Could not detect host name for internal Developer Sandbox image registry.');
  });
  const host = publicRegistry.substring(0, publicRegistry.indexOf('/'));

  const username: string = await whoami(cluster.server, user.token);
  const matches = username.match(/^system:serviceaccount:([a-zA-Z-_.]+)-dev:pipeline$/);
  if (!matches) {
    throw new Error(`Cannot detect username for Developer Sandbox connection '${contextName}'.`);
  }
  return {
    host,
    username: matches[1],
    token: user.token,
  };
}

export function prepareKubeConfig(
  clusterName: string,
  clusterUsername: string,
  contextName: string,
  server: string,
  username: string,
  accessToken: string,
): KubeConfig {
  const kcu = new KubeConfig();
  const clusterProxy = {
    name: clusterName,
    server: server,
    skipTLSVerify: false,
  };
  const user = {
    name: clusterUsername,
    token: accessToken,
  };
  const context = {
    cluster: clusterProxy.name,
    name: contextName,
    user: user.name,
    namespace: `${username}-dev`,
  };
  kcu.addCluster(clusterProxy);
  kcu.addUser(user);
  kcu.addContext(context);
  kcu.setCurrentContext(context.name);
  return kcu;
}

async function installPipelineSecretToken(
  k8sApi: CoreV1Api,
  pipelineServiceAccount: V1ServiceAccount,
  username: string,
): Promise<V1Secret | undefined> {
  const v1Secret = {
    apiVersion: 'v1',
    kind: 'Secret',
    metadata: {
      name: `pipeline-secret-${username}-dev`,
      annotations: {
        'kubernetes.io/service-account.name': pipelineServiceAccount.metadata.name,
        'kubernetes.io/service-account.uid': pipelineServiceAccount.metadata.uid,
      },
    },
    type: 'kubernetes.io/service-account-token',
  } as V1Secret;

  try {
    return k8sApi.createNamespacedSecret({ namespace: `${username}-dev`, body: v1Secret });
  } catch (error) {
    throw new Error(`Error when creating new Developer Sandbox connection: ${String(error)}`);
  }
}

export async function getPipelineServiceAccountToken(
  proxy: string,
  username: string,
  idToken: string,
): Promise<string> {
  const kcu = prepareKubeConfig('sandbox-proxy', 'sso-user', 'sandbox-proxy-context', proxy, username, idToken);
  const k8sApi = kcu.makeApiClient(CoreV1Api);
  const serviceAccounts = await k8sApi.listNamespacedServiceAccount({ namespace: `${username}-dev` });
  const pipelineServiceAccount = serviceAccounts.items.find(
    serviceAccount => serviceAccount.metadata.name === 'pipeline',
  );
  if (!pipelineServiceAccount) {
    throw new Error(`Could not find service account required to create Developer Sandbox connection.`);
  }

  const secrets = await k8sApi.listNamespacedSecret({ namespace: `${username}-dev` });
  let pipelineTokenSecret = secrets?.items.find(secret => secret.metadata.name === `pipeline-secret-${username}-dev`);
  if (!pipelineTokenSecret) {
    try {
      pipelineTokenSecret = await installPipelineSecretToken(k8sApi, pipelineServiceAccount, username);
    } catch (error) {
      throw new Error(`Error when creating OpenShift secret for Developer Sandbox connection: ${String(error)}`);
    }
  }
  return Buffer.from(pipelineTokenSecret.data.token, 'base64').toString();
}
