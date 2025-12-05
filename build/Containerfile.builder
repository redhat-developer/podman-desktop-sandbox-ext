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

FROM registry.access.redhat.com/ubi10/nodejs-22-minimal@sha256:52f5a9e3eb1191276ef576ad88142a27d4ef61317384f383534526f55761387b

ENV EXTENSION_SRC=/opt/app-root/extension-source
RUN mkdir -p $EXTENSION_SRC
WORKDIR $EXTENSION_SRC

COPY yarn.lock package.json .
RUN npm install --global yarn && \
    yarn --frozen-lockfile install
