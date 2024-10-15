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

import type { NavigationBar } from '@podman-desktop/tests-playwright';
import {
  ResourcesPage,
  expect as playExpect,
  ExtensionCardPage,
  RunnerOptions,
  test,
  AuthenticationPage,
} from '@podman-desktop/tests-playwright';
import { DeveloperSandboxPage } from './model/pages/developer-sandbox-page';

let extensionInstalled = false;
let extensionCard: ExtensionCardPage;
const imageName = 'ghcr.io/redhat-developer/podman-desktop-sandbox-ext:latest';
const extensionLabel = 'redhat.redhat-sandbox';
const extensionLabelName = 'redhat-sandbox';
const extensionResourceLabel = 'redhat.sandbox';
const extensionProvider = 'Developer Sandbox Provider';
const activeExtensionStatus = 'ACTIVE';
const disabledExtensionStatus = 'DISABLED';
const activeConnectionStatus = 'RUNNING';
const skipInstallation = process.env.SKIP_INSTALLATION ? process.env.SKIP_INSTALLATION : false;

test.use({
  runnerOptions: new RunnerOptions({ customFolder: 'sandbox-tests-pd', autoUpdate: false, autoCheckUpdates: false }),
});
test.beforeAll(async ({ runner, page, welcomePage }) => {
  runner.setVideoAndTraceName('sandbox-e2e');
  await welcomePage.handleWelcomePage(true);
  extensionCard = new ExtensionCardPage(page, extensionLabelName, extensionLabel);
});

test.afterAll(async ({ runner }) => {
  await runner.close();
});

test.describe.serial('Red Hat Developer Sandbox extension verification', () => {
  test.describe.serial('Red Hat Developer Sandbox extension installation', () => {
    // PR check builds extension locally and so it is available already
    test('Go to extensions and check if extension is already installed', async ({ navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      if (await extensions.extensionIsInstalled(extensionLabel)) {
        extensionInstalled = true;
      }
    });

    // we want to skip removing of the extension when we are running tests from PR check
    test('Uninstall previous version of sandbox extension', async ({ navigationBar }) => {
      test.skip(!extensionInstalled || !!skipInstallation);
      test.setTimeout(60000);
      await removeExtension(navigationBar);
    });

    // we want to install extension from OCI image (usually using latest tag) after new code was added to the codebase
    // and extension was published already
    test('Extension can be installed using OCI image', async ({ navigationBar }) => {
      test.skip(extensionInstalled && !skipInstallation);
      test.setTimeout(200000);
      const extensions = await navigationBar.openExtensions();
      await extensions.installExtensionFromOCIImage(imageName);
      await playExpect(extensionCard.card).toBeVisible();
    });

    test('Extension (card) is installed, present and active', async ({ navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      await playExpect
        .poll(async () => await extensions.extensionIsInstalled(extensionLabel), { timeout: 30000 })
        .toBeTruthy();
      const extensionCard = await extensions.getInstalledExtension(extensionLabelName, extensionLabel);
      await playExpect(extensionCard.status).toHaveText(activeExtensionStatus);
    });

    test("Extension's details show correct status, no error", async ({ page, navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      const extensionCard = await extensions.getInstalledExtension(extensionLabelName, extensionLabel);
      await extensionCard.openExtensionDetails('Red Hat Openshift Sandbox extension');
      const details = new DeveloperSandboxPage(page);
      await playExpect(details.heading).toBeVisible();
      await playExpect(details.status).toHaveText(activeExtensionStatus);
      const errorTab = details.tabs.getByRole('button', { name: 'Error' });
      // we would like to propagate the error's stack trace into test failure message
      let stackTrace = '';
      if ((await errorTab.count()) > 0) {
        await details.activateTab('Error');
        stackTrace = await details.errorStackTrace.innerText();
      }
      await playExpect(errorTab, `Error Tab was present with stackTrace: ${stackTrace}`).not.toBeVisible();
    });

    test('Developer Sandbox is available in Resources Page', async ({ navigationBar }) => {
      await checkSandboxInResources(navigationBar, true);
    });

    test('Developer Sandbox is available in Dashboard', async ({ navigationBar }) => {
      await checkSandboxInDashboard(navigationBar, true);
    });
  });

  test.describe.serial('Developer Sandbox extension handling', () => {
    test('Extension can be disabled', async ({ navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      playExpect(await extensions.extensionIsInstalled(extensionLabel)).toBeTruthy();
      const extensionCard = await extensions.getInstalledExtension(extensionLabelName, extensionLabel);
      await playExpect(extensionCard.status).toHaveText(activeExtensionStatus);
      await extensionCard.disableExtension();
      await playExpect(extensionCard.status).toHaveText(disabledExtensionStatus);

      await checkSandboxInResources(navigationBar, false);
      await checkSandboxInDashboard(navigationBar, false);
    });

    test('Extension can be re-enabled correctly', async ({ navigationBar }) => {
      const extensions = await navigationBar.openExtensions();
      playExpect(await extensions.extensionIsInstalled(extensionLabel)).toBeTruthy();
      const extensionCard = await extensions.getInstalledExtension(extensionLabelName, extensionLabel);
      await playExpect(extensionCard.status).toHaveText(disabledExtensionStatus);
      await extensionCard.enableExtension();
      await playExpect(extensionCard.status).toHaveText(activeExtensionStatus);

      await checkSandboxInResources(navigationBar, true);
      await checkSandboxInDashboard(navigationBar, true);
    });
  });

  test('Extension can be removed', async ({ navigationBar }) => {
    await removeExtension(navigationBar);
  });
});

async function removeExtension(navBar: NavigationBar): Promise<void> {
  const extensions = await navBar.openExtensions();
  const extensionCard = await extensions.getInstalledExtension(extensionLabelName, extensionLabel);
  await extensionCard.disableExtension();
  await extensionCard.removeExtension();
  await playExpect
    .poll(async () => await extensions.extensionIsInstalled(extensionLabel), { timeout: 15000 })
    .toBeFalsy();
}

async function checkSandboxInResources(navigationBar: NavigationBar, isPresent: boolean) {
  const settingsBar = await navigationBar.openSettings();
  const resourcesPage = await settingsBar.openTabPage(ResourcesPage);
  const sandboxResourceCard = resourcesPage.featuredProviderResources.getByRole('region', {
    name: extensionResourceLabel,
  });
  const createButton = sandboxResourceCard.getByRole('button', { name: 'Create new Developer Sandbox' });

  if (isPresent) {
    await playExpect(sandboxResourceCard).toBeVisible();
    await playExpect(createButton).toBeVisible();
  } else {
    await playExpect(sandboxResourceCard).toBeHidden();
  }
}

async function checkSandboxInDashboard(navigationBar: NavigationBar, isPresent: boolean) {
  const dashboardPage = await navigationBar.openDashboard();
  const sandboxProviderCard = dashboardPage.content.getByRole('region', { name: extensionProvider });
  const sandboxStatus = sandboxProviderCard.getByLabel('Connection Status Label');

  if (isPresent) {
    await playExpect(sandboxProviderCard).toBeVisible();
    await playExpect(sandboxStatus).toHaveText(activeConnectionStatus);
  } else {
    await playExpect(sandboxProviderCard).toBeHidden();
  }
}
