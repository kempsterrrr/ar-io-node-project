# Patched Dockerfile for ar-io-bundler services (upload-service, payment-service).
# Based on upstream Dockerfiles with corepack + workspace-tools fixes for Yarn Berry.
# The upstream images use node:18 which ships Yarn Classic 1.x, but the bundler
# requires Yarn >=3.0.0 ("packageManager": "yarn@3.6.0" in package.json).
# Additionally, Yarn 3.x needs the workspace-tools plugin for `workspaces foreach`
# and `workspaces focus` commands used by the build and production pruning steps.

ARG NODE_VERSION=18.17.0
ARG NODE_VERSION_SHORT=18

FROM node:${NODE_VERSION}-bullseye-slim AS builder

WORKDIR /usr/src/app
COPY . .
RUN corepack enable
RUN yarn plugin import workspace-tools
RUN yarn && yarn build

RUN rm -rf node_modules && yarn workspaces focus --production

FROM gcr.io/distroless/nodejs${NODE_VERSION_SHORT}-debian12
WORKDIR /usr/src/app

COPY --from=busybox:1.35.0-uclibc /bin/sh /bin/sh
COPY --from=busybox:1.35.0-uclibc /bin/addgroup /bin/addgroup
COPY --from=busybox:1.35.0-uclibc /bin/adduser /bin/adduser
COPY --from=busybox:1.35.0-uclibc /bin/chown /bin/chown

RUN addgroup -g 1000 node \
  && adduser -u 1000 -G node -s /bin/sh -D node
RUN chown -R node ./
USER node

COPY --from=builder --chown=node /usr/src/app/lib ./lib
COPY --from=builder --chown=node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node /usr/src/app/docs ./docs

EXPOSE 3000
CMD ["./lib/index.js"]
