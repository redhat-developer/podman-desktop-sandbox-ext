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

import { OptionsOfTextResponseBody } from "got/dist/source/types";
import { HttpProxyAgent, HttpProxyAgentOptions, HttpsProxyAgent, HttpsProxyAgentOptions } from "hpagent";
import { Certificates } from './certificates';
import { proxy } from '@podman-desktop/api'

const certificates = new Certificates();
certificates.init();

function createProxyAgentOptions(proxy: string): HttpsProxyAgentOptions | HttpProxyAgentOptions {
  return {
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 256,
    maxFreeSockets: 256,
    scheduling: 'lifo',
    proxy,
  }
}

export function getOptions(): OptionsOfTextResponseBody {
  const options: OptionsOfTextResponseBody = {
    https: {
      certificateAuthority: certificates.getAllCertificates(),
    },
  };

  if (proxy.isEnabled()) {
    // use proxy when performing got request
    const proxySettings = proxy.getProxySettings();
    const httpProxyUrl = proxySettings?.httpProxy;
    const httpsProxyUrl = proxySettings?.httpsProxy;

    if (httpProxyUrl) {
      if (!options.agent) {
        options.agent = {};
      }
      try {
        options.agent.http = new HttpProxyAgent(createProxyAgentOptions(httpProxyUrl));
      } catch (error) {
        throw new Error(`Failed to create https proxy agent from ${httpProxyUrl}: ${error}`);
      }
    }
    if (httpsProxyUrl) {
      if (!options.agent) {
        options.agent = {};
      }
      try {
        options.agent.https = new HttpsProxyAgent(createProxyAgentOptions(httpsProxyUrl));
      } catch (error) {
        throw new Error(`Failed to create https proxy agent from ${httpsProxyUrl}: ${error}`);
      }
    }
  }
  return options;
}