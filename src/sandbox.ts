/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

import got, { Delays } from 'got';

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
  return 'https://registration-service-toolchain-host-operator.apps.sandbox.x8i5.p1.openshiftapps.com';
}

export function getSandboxAPITimeout(): Delays {
  return {
    response: 30000,
    request: 30000,
  };
}

export async function getSignUpStatus(token: string): Promise<SBSignupResponse | undefined> {
  const signupResponse = await got(`${getSandboxAPIUrl()}${SBAPIEndpoint.SIGNUP}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    responseType: 'json',
    timeout: getSandboxAPITimeout(),
  });
  return signupResponse.ok ? (signupResponse.body as Promise<SBSignupResponse>) : undefined;
}

export async function signUp(token: string): Promise<boolean> {
  const signupResponse = await got(`${getSandboxAPIUrl()}${SBAPIEndpoint.SIGNUP}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    timeout: getSandboxAPITimeout(),
  });
  return signupResponse.ok;
}
