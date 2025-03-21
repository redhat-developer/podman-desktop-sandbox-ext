/**********************************************************************
 * Copyright (C) 2022 Red Hat, Inc.
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
/**
 * Mock the extension API for vitest.
 * This file is referenced from vitest.config.js file.
 */

module.exports = {
  provider: {
    createProvider: () => {
      return {
        registerKubernetesProviderConnection: () => ({
          dispose: vi.fn(),
        }),
        setKubernetesProviderConnectionFactory: vi.fn(),
      }
    }
  },

  containerEngine: {
    listContainers: vi.fn(),
    tagImage: vi.fn(),
    pushImage: vi.fn(),
  },

  kubernetes: {
    getKubeconfig: vi.fn(),
  },

  env: {
    createTelemetryLogger: () => {
      return {
        logUsage: vi.fn(),
      };
    }
  },

  commands: {
    registerCommand: vi.fn(),
  },

  window: {
    withProgress: vi.fn(),
    showInformationMessage: vi.fn(),
  },

  ProgressLocation: {
    TASK_WIDGET: 'task',
  }
};

