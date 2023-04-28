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

import { KubeConfig } from '@kubernetes/client-node'
import * as fs from 'fs-extra';
import * as jsYaml from 'js-yaml';

export function createOrLoadFromFile(configFile: string): KubeConfig {
  let config = new KubeConfig();

  if (fs.existsSync(configFile)) {
   config.loadFromFile(configFile);
  }
  return config;
}

export function exportToFile(kubeconfig: KubeConfig, configLocation: string): void {
  const configContents = JSON.parse(kubeconfig.exportConfig());
  fs.writeFileSync(
    configLocation, jsYaml.dump(configContents, { noArrayIndent: true, quotingType: '"', lineWidth: -1 }),
    'utf-8',
  );
}