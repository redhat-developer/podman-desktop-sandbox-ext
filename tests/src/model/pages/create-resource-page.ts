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

import type { Page, Locator } from '@playwright/test';
import { BasePage, ResourcesPage, expect as playExpect } from '@podman-desktop/tests-playwright';;

export class CreateResourcePage extends BasePage {
    readonly heading: Locator;
    readonly content: Locator;
    readonly logIntoSandboxButton: Locator;
    readonly contextName: Locator;
    readonly setAsCurrentContext: Locator;
    readonly loginCommand: Locator;
    readonly closeButton: Locator;
    readonly createButton: Locator;

    constructor(page: Page) {
        super(page);
        this.heading = this.page.getByRole('heading', { name: 'Create Developer Sandbox' });
        this.content = this.page.getByRole('region', { name: 'Tab Content' });
        this.logIntoSandboxButton = this.page.getByRole('button', { name: 'Log into Developer Sandbox' });
        this.contextName = this.page.getByRole('textbox', { name: 'Context name' });
        this.setAsCurrentContext = this.page.getByRole('checkbox', { name: 'Set as current context' });
        this.loginCommand = this.page.getByRole('textbox', { name: 'Login command from Developer Console' });
        this.closeButton = this.page.getByRole('button', { name: 'Close page' });
        this.createButton = this.page.getByRole('button', { name: 'Create' });
    }

    async createResource(loginCommandValue: string, contextNameValue?: string, setAsCurrentContextValue = false): Promise<ResourcesPage> {
        await this.loginCommand.fill(loginCommandValue);

        if (contextNameValue) {
            await this.contextName.fill(contextNameValue);
        }

        if (setAsCurrentContextValue !== (await this.setAsCurrentContext.isChecked())) {
            await this.setAsCurrentContext.locator('..').click();
            playExpect(await this.setAsCurrentContext.isChecked()).toBe(setAsCurrentContextValue);
        }

        const successMessage = this.page.getByText('Successful operation');
        const goToResourcesButton = this.page.getByRole('button', { name: 'Go back to resources' });
        await playExpect(successMessage).toBeVisible();
        await playExpect(goToResourcesButton).toBeVisible();

        await goToResourcesButton.click();
        return new ResourcesPage(this.page);
    }
}