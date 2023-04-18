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

import { configuration } from '@podman-desktop/api';
import fetch from 'got';

// eslint-disable-next-line no-shadow
export enum SBAPIEndpoint {
  SIGNUP = '/api/v1/signup',
  VERIFICATION = '/api/v1/signup/verification'
}

export interface SBStatus {
  ready: boolean;
  reason: 'Provisioned' | 'PendingApproval';
  verificationRequired: boolean;
}

export interface SBSignupResponse {
  apiEndpoint: string;
  cheDashboardURL: string;
  clusterName: string;
  company: string;
  compliantUsername: string;
  consoleURL: string;
  familyName: string;
  givenName: string;
  status: SBStatus;
  username: string;
}

export interface SBResponseData {
  status: string;
  code: number;
  message: string;
  details: string;
}

export interface VerificationCodeResponse{
  ok: boolean;
  json: SBResponseData;
}

export const OAUTH_SERVER_INFO_PATH = '.well-known/oauth-authorization-server';

export interface OauthServerInfo {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    scopes_supported: string[];
    response_types_supported: string[];
    grant_types_supported: string[];
    code_challenge_methods_supported: string[];
  }

export function getSandboxAPIUrl(): string {
    return configuration.getConfiguration('redhat').get('sandbox.registration.api.url');
}

export function getSandboxAPITimeout(): number {
    return configuration.getConfiguration('redhat').get('sandbox.api.timeout');
}

export interface SandboxAPI {
    getSignUpStatus(token: string): Promise<SBSignupResponse | undefined>;
    signUp(token: string): Promise<boolean>;
    requestVerificationCode(token: string, areaCode: string, phoneNumber: string): Promise<VerificationCodeResponse>;
    validateVerificationCode(token: string, code: string): Promise<boolean>;
    getOauthServerInfo(apiEndpointUrl: string): Promise<OauthServerInfo>;
}

export async function getSignUpStatus(token: string): Promise<SBSignupResponse | undefined> {
    const signupResponse = await fetch(`${getSandboxAPIUrl()}${SBAPIEndpoint.SIGNUP}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`
            },
            cache: 'no-cache',
            // timeout: getSandboxAPITimeout()
        });
    return signupResponse.ok ? JSON.parse(signupResponse.body) as Promise<SBSignupResponse> : undefined;
}

export async function signUp(token: string): Promise<boolean> {
    const signupResponse = await fetch(`${getSandboxAPIUrl()}${SBAPIEndpoint.SIGNUP}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`
            },
            // timeout: getSandboxAPITimeout()
        });
    return signupResponse.ok;
}

export async function requestVerificationCode(token: string, countryCode: string, phoneNumber: string) : Promise<VerificationCodeResponse> {
    const verificationCodeRequestResponse = await fetch(`${getSandboxAPIUrl()}${SBAPIEndpoint.VERIFICATION}`, {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${token}`
        },
        // timeout: getSandboxAPITimeout(),
        body: JSON.stringify({
            'country_code': countryCode,
            'phone_number': phoneNumber
        })
    });
    const responseText = await verificationCodeRequestResponse.body;
    return {
        ok: verificationCodeRequestResponse.ok,
        json: (responseText ? JSON.parse(responseText) : {}) as SBResponseData
    }
}

export async function validateVerificationCode(token: string, code: string): Promise<boolean> {
    const validationRequestResponse = await fetch(`${getSandboxAPIUrl()}${SBAPIEndpoint.VERIFICATION}/${code}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`
        },
        // timeout: getSandboxAPITimeout()
    });

    return validationRequestResponse.ok;
}

export async function getOauthServerInfo(apiEndpointUrl: string): Promise<OauthServerInfo> {
    const oauthServerInfoResponse = await fetch(`${apiEndpointUrl}/${OAUTH_SERVER_INFO_PATH}`, {
        method: 'GET',
        // timeout: getSandboxAPITimeout()
    });
    const oauthInfoText = await oauthServerInfoResponse.body;
    return (oauthInfoText ? JSON.parse(oauthInfoText) : {}) as OauthServerInfo;
}

export function createSandboxAPI(): SandboxAPI {
    return {
        getSignUpStatus,
        signUp,
        requestVerificationCode,
        validateVerificationCode,
        getOauthServerInfo
    };
}
