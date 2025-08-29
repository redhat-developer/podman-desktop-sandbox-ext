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
    lookup: 300000,
    socket: 300000,
    connect: 300000,
    secureConnect: 30000,
    send: 30000,
    response: 30000,
    read: 30000,
    request: 30000,
  };
}

export interface SandboxAPI {
  getSignUpStatus(token: string): Promise<SBSignupResponse | undefined>;
  signUp(token: string): Promise<boolean>;
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

export function createSandboxAPI(): SandboxAPI {
  return {
    getSignUpStatus,
    signUp,
  };
}

export async function getDevSandboxSignUpStatus(idToken: string): Promise<SBSignupResponse> {
  const sandboxApi = createSandboxAPI();
  let status: SBSignupResponse = undefined;
  try {
    status = await sandboxApi.getSignUpStatus(idToken);
  } catch (_) {
    // user has not signed up for developer sandbox instance
  }

  if (!status) {
    // if exception occurs the Dev Sandbox was not activated or deactivated
    let signUpResult: boolean = false;
    signUpResult = await sandboxApi.signUp(idToken); // try to activate it
    if (signUpResult) {
      // if it is activated successfully get status again
      status = await sandboxApi.getSignUpStatus(idToken);
    } else {
      throw new Error('Could not to sign you up for Developer Sandbox. Please try again later.');
    }
    if (!status) {
      // if there is still no status report an error
      throw new Error('Could not get status for Developer Sandbox instance. Please try again later.');
    }
  }

  if (!status.status.ready) {
    // if Dev Sandbox is not ready
    if (status.status.verificationRequired) {
      throw new Error(
        'Developer Sandbox account verification is required. Please open Developer Sandbox page using link below and click `Try it` button to go through verification process.',
      );
    } else {
      if (status.status.reason === 'PendingApproval') {
        throw new Error('Developer Sandbox instance provisioning is waiting for approval. Please try again later.');
      } else {
        throw new Error('Developer Sandbox is not provisioned yet. Please try again later.');
      }
    }
  }
  return status;
}
