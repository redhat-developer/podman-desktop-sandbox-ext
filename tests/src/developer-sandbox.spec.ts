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
  ResourceConnectionCardPage,
  startChromium,
  findPageWithTitleInBrowser,
  ConfirmInputValue,
  KubeContextPage,
  performBrowserLogin,
} from '@podman-desktop/tests-playwright';
import { DeveloperSandboxPage } from './model/pages/developer-sandbox-page';
import { CreateResourcePage } from './model/pages/create-resource-page';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import path, { join } from 'node:path';

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
const skipInstallation = process.env.SKIP_INSTALLATION === 'true';
let browserOutputPath: string;
let loginCommand = '';
const resourceCardLabel = 'redhat.sandbox';
const contextName = 'dev-sandbox-context-3';
const chromePort = '9222';

test.use({
  runnerOptions: new RunnerOptions({ customFolder: 'sandbox-tests-pd', autoUpdate: false, autoCheckUpdates: false }),
});
test.beforeAll(async ({ runner, page, welcomePage }) => {
  runner.setVideoAndTraceName('sandbox-e2e');
  await welcomePage.handleWelcomePage(true);
  extensionCard = new ExtensionCardPage(page, extensionLabelName, extensionLabel);
  browserOutputPath = test.info().project.outputDir;
  console.log(`Saving browser test artifacts to: '${browserOutputPath}'`);
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
      test.skip(!extensionInstalled || skipInstallation);
      test.setTimeout(60000);
      await removeExtension(navigationBar);
    });

    // we want to install extension from OCI image (usually using latest tag) after new code was added to the codebase
    // and extension was published already
    test('Extension can be installed using OCI image', async ({ navigationBar }) => {
      test.skip(skipInstallation);
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
      await extensionCard.openExtensionDetails('Developer Sandbox Extension');
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
      await playExpect(extensionCard.removeButton).toBeEnabled();
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

  test.describe.serial('Developer Sandbox cluster verification', async () => {
    test.describe.serial('Fetch login command via browser', async () => {
      let chromiumPage: Page | undefined;
      let browser: Browser | undefined;
      let context: BrowserContext | undefined;

      test.afterAll(async () => {
        if (browser) {
          console.log('Stopping tracing and closing browser...');
          await context?.tracing.stop({ path: join(path.join(browserOutputPath), 'traces', 'browser-sandbox-trace.zip') });
          if (chromiumPage) {
            await chromiumPage.close();
          }
          await browser.close();
        }
      });

      test('Open Developer Sandbox page in browser', async ({ navigationBar, page }) => {
        test.setTimeout(120_000);
        //get sandbox url
        const settingsBar = await navigationBar.openSettings();
        await settingsBar.resourcesTab.click();
        const resourcesPage = new ResourcesPage(page);
        playExpect(await resourcesPage.resourceCardIsVisible(resourceCardLabel)).toBeTruthy();
        await resourcesPage.goToCreateNewResourcePage(resourceCardLabel);
        const createResourcePage = new CreateResourcePage(page);
        await createResourcePage.logIntoSandboxButton.click();
        const websiteDialog = createResourcePage.content.getByRole('dialog', { name: 'Open External Website' });
        await playExpect(websiteDialog).toBeVisible();
        const sandboxUrl = await websiteDialog.getByLabel('Dialog Details').textContent();
        const cancelDialogButton = websiteDialog.getByRole('button', { name: 'Cancel' });
        await cancelDialogButton.click();

        //open the website
        if (sandboxUrl) {
          browser = await startChromium(chromePort, path.join(browserOutputPath));
          context = await browser.newContext();
          await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
          const newPage = await context.newPage();
          await newPage.goto(sandboxUrl);
          await newPage.waitForURL(/developers.redhat.com/);
          chromiumPage = newPage;
          if (browser) {
            await findPageWithTitleInBrowser(browser, 'Developer Sandbox | Red Hat Developer');
          }
          console.log(`Found page with title: ${await chromiumPage?.title()}`);
        } else {
          throw new Error('Did not find Developer Sandbox page');
        }
      });
      test('Log into Red Hat Sandbox', async () => {
        //go to login page
        playExpect(chromiumPage).toBeDefined();
        if (!chromiumPage) {
          throw new Error('Chromium browser page was not initialized');
        }
        await chromiumPage.bringToFront();
        console.log(`Switched to Chrome tab with title: ${await chromiumPage.title()}`);
        const startSandboxButton = chromiumPage.getByRole('button', { name: 'Start your sandbox for free' });
        await playExpect(startSandboxButton).toBeVisible();
        await startSandboxButton.click();

        //log in, same tab
        const usernameAction: ConfirmInputValue = {
          inputLocator: chromiumPage.getByRole('textbox', { name: 'username' }),
          inputValue: process.env.DVLPR_USERNAME ?? 'unknown',
          confirmLocator: chromiumPage.getByRole('button', { name: 'Next' }),
        };
        const passwordAction: ConfirmInputValue = {
          inputLocator: chromiumPage.getByRole('textbox', { name: 'password' }),
          inputValue: process.env.DVLPR_PASSWORD ?? 'unknown',
          confirmLocator: chromiumPage.getByRole('button', { name: 'Log in' }),
        };
        const usernameBox = chromiumPage.getByRole('textbox', { name: 'Red Hat login' });
        await playExpect(usernameBox).toBeVisible({ timeout: 5_000 });
        await usernameBox.focus();

        //after login redirect twice to sandbox.redhat.com, same tab
        await performBrowserLogin(chromiumPage, /Log In/, usernameAction, passwordAction, async (chromiumPage) => {
          playExpect(chromiumPage).toBeDefined();
          if (!chromiumPage) {
            throw new Error('Chromium browser page was not initialized');
          }
          playExpect(await chromiumPage.title()).toBe('Developer Sandbox | Developer Sandbox');
          await chromiumPage.screenshot({ path: join(path.join(browserOutputPath), 'screenshots', 'after_login_in_browser.png'), type: 'png', fullPage: true });
        });
      });
      test('Fetch the login command', async () => {
        //open "try it" openshift
        playExpect(chromiumPage).toBeDefined();
        if (!chromiumPage) {
          throw new Error('Chromium browser page was not initialized');
        }
        await chromiumPage.bringToFront();
        const openshiftBoxLabel = chromiumPage.getByAltText('Openshift', { exact: true });
        await playExpect(openshiftBoxLabel).toBeVisible();
        const openshiftBox = openshiftBoxLabel.locator('..').locator('..').locator('..');
        const tryItButton = openshiftBox.getByRole('button', { name: 'Try it' });
        await playExpect(tryItButton).toBeVisible();
        await tryItButton.click();

        //new tab, log in through the Openshift auth page (sometimes might need reload)
        await loginThroughOpenshiftServicePage(browser!, chromiumPage);

        //same tab, get login command from the Console Openshift page
        const userDropdownMenuButton = chromiumPage.getByRole('button', { name: 'User menu' });
        await playExpect(userDropdownMenuButton).toBeVisible({ timeout: 50_000 });
        await userDropdownMenuButton.click();
        const copyLoginCommandButton = chromiumPage.getByText('Copy login command');
        await playExpect(copyLoginCommandButton).toBeVisible();
        await copyLoginCommandButton.click();

        //new tab, find command (sandbox login might need reload)
        await loginThroughOpenshiftServicePage(browser!, chromiumPage);

        const displayTokenButton = chromiumPage.getByRole('button', { name: 'Display Token' });
        await playExpect(displayTokenButton).toBeVisible();
        await displayTokenButton.click();
        const commandElement = chromiumPage.getByText('oc login').locator('..');
        await playExpect(commandElement).toBeVisible();
        loginCommand = await commandElement.innerText();
      });
    });

    test('Create Sandbox cluster', async ({ page }) => {
      await page.bringToFront();
      const createResourcePage = new CreateResourcePage(page);
      await createResourcePage.createResource(loginCommand, contextName);
    });

    test('Verify Sandbox cluster and context', async ({ page, navigationBar }) => {
      const sandboxClusterCard = new ResourceConnectionCardPage(page, resourceCardLabel, contextName);
      playExpect(await sandboxClusterCard.doesResourceElementExist()).toBeTruthy();
      await playExpect(sandboxClusterCard.resourceElementConnectionStatus).toHaveText('RUNNING');

      const settingsBar = await navigationBar.openSettings();
      await settingsBar.kubernetesTab.click();
      const kubeContextPage = new KubeContextPage(page);
      playExpect(await kubeContextPage.pageIsEmpty()).not.toBeTruthy();
      playExpect(await kubeContextPage.isContextReachable(contextName)).toBeTruthy();
      playExpect(await kubeContextPage.isContextDefault(contextName)).not.toBeTruthy();
    });

    test('Delete remote cluster context', async ({ page, navigationBar }) => {
      const kubeContextPage = new KubeContextPage(page);
      await kubeContextPage.deleteContext(contextName);
      playExpect(await kubeContextPage.pageIsEmpty()).toBeTruthy();

      const settingsBar = await navigationBar.openSettings();
      await settingsBar.resourcesTab.click();
      const sandboxClusterCard = new ResourceConnectionCardPage(page, resourceCardLabel, contextName);
      playExpect(await sandboxClusterCard.doesResourceElementExist()).not.toBeTruthy();
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
  await playExpect(extensionCard.removeButton).toBeEnabled();
  await extensionCard.removeExtension();
  await playExpect
    .poll(async () => await extensions.extensionIsInstalled(extensionLabel), { timeout: 15000 })
    .toBeFalsy();
}

async function checkSandboxInResources(navigationBar: NavigationBar, isInstalled: boolean) {
  const settingsBar = await navigationBar.openSettings();
  const resourcesPage = await settingsBar.openTabPage(ResourcesPage);
  const sandboxResourceCard = resourcesPage.featuredProviderResources.getByRole('region', {
    name: extensionResourceLabel,
  });
  const createButton = sandboxResourceCard.getByRole('button', { name: 'Create new Developer Sandbox' });

  if (isInstalled) {
    await playExpect(sandboxResourceCard).toBeVisible();
    await playExpect(createButton).toBeVisible();
  } else {
    await playExpect(sandboxResourceCard).toBeHidden();
  }
}

async function checkSandboxInDashboard(navigationBar: NavigationBar, isInstalled: boolean) {
  const dashboardPage = await navigationBar.openDashboard();
  const sandboxProviderCard = dashboardPage.content.getByRole('region', { name: extensionProvider });
  const sandboxStatus = sandboxProviderCard.getByLabel('Connection Status Label');

  if (isInstalled) {
    await playExpect(sandboxProviderCard).toBeVisible();
    await playExpect(sandboxStatus).toHaveText(activeConnectionStatus);
  } else {
    await playExpect(sandboxProviderCard).toBeHidden();
  }
}

async function loginThroughOpenshiftServicePage(browser: Browser, chromiumPage: Page) {
  let loginSandboxPage = await findPageWithTitleInBrowser(browser!, 'Login - Red Hat OpenShift Service on AWS');
  if (!loginSandboxPage) {
    throw new Error('Sandbox service login browser page was not initialized');
  }
  await loginSandboxPage.bringToFront();
  const loginWithSandboxButton = chromiumPage.getByRole('button', { name: 'Log in with DevSandbox' });
  await playExpect(loginWithSandboxButton).toBeVisible();
  await loginWithSandboxButton.click();
}
