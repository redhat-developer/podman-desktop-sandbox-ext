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
import * as kubeconfig from './kubeconfig';
import * as extensionApi from '@podman-desktop/api';

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
    throw new Error('Could not detect internal Developer Sandbox image registry.');
  });
  const host = publicRegistry.substring(0, publicRegistry.indexOf('/'));

  const username: string = await whoami(cluster.server, user.token);

  return {
    host,
    username,
    token: user.token,
  };
}
