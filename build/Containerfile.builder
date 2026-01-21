#
# Copyright (C) 2025 Red Hat, Inc.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# SPDX-License-Identifier: Apache-2.0

FROM registry.access.redhat.com/ubi10/nodejs-24-minimal@sha256:3537b5ae0731fa1e75eb49cc73355e406f6c3d19dd04cff594731d8c5e8fc54c

ENV EXTENSION_SRC=/opt/app-root/extension-source
RUN mkdir -p $EXTENSION_SRC
WORKDIR $EXTENSION_SRC

COPY pnpm-lock.yaml package.json .
RUN npm install --global pnpm && \
    pnpm --frozen-lockfile install
