/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import got, { Delays } from 'got';
import { configuration } from '@podman-desktop/api';

// eslint-disable-next-line no-shadow
export enum SBAPIEndpoint {
  SIGNUP = '/api/v1/signup',
  VERIFICATION = '/api/v1/signup/verification',
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
  proxyURL: string;
}

export interface SBResponseData {
  status: string;
  code: number;
  message: string;
  details: string;
}

export interface VerificationCodeResponse {
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
  return configuration.getConfiguration('redhat').get('sandbox.registrationServiceUrl');
}

export function getRegistrationServiceTimeout(): number {
  return configuration.getConfiguration('redhat').get<number>('sandbox.registrationServiceTimeout', 30) * 1000;
}

function createSandboxAPITimeout(): Delays {
  return {
    response: getRegistrationServiceTimeout(),
    request: getRegistrationServiceTimeout(),
  };
}

export async function getSignUpStatus(token: string): Promise<SBSignupResponse | undefined> {
  const signupResponse = await got(`${getSandboxAPIUrl()}${SBAPIEndpoint.SIGNUP}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    responseType: 'json',
    timeout: createSandboxAPITimeout(),
  });
  return signupResponse.body as Promise<SBSignupResponse>;
}

export async function signUp(token: string): Promise<void> {
  await got(`${getSandboxAPIUrl()}${SBAPIEndpoint.SIGNUP}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: createSandboxAPITimeout(),
  });
}
