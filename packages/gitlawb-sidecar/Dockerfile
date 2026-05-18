# syntax=docker/dockerfile:1.7
# =============================================================================
# Gitlawb Sidecar — image containing gitlawb-node + gl CLI + git-remote-gitlawb
# =============================================================================
# Builds the three upstream binaries from a pinned commit and ships them in a
# small debian-slim runtime. Same image serves the long-running `gitlawb-node`
# service and the `gl` ops service (entrypoint overridden in compose).
# =============================================================================

# Upstream Gitlawb commit to build from.
# Bump this when adopting upstream changes; record the SHA in commits/release notes.
ARG GITLAWB_SHA=f312955c351cd4cbd1e302c8cb34459c3c2da0a8

# -----------------------------------------------------------------------------
# Stage 1 — build the Rust binaries
# -----------------------------------------------------------------------------
# Match upstream's pinned toolchain (see Gitlawb/node Dockerfile at the pinned SHA).
# Bump alongside GITLAWB_SHA when adopting newer upstream commits.
FROM rust:1.91-slim-bookworm AS builder
ARG GITLAWB_SHA

RUN apt-get update && apt-get install -y --no-install-recommends \
        git pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone https://github.com/Gitlawb/node.git . \
    && git checkout ${GITLAWB_SHA}

RUN cargo build --release \
        --bin gitlawb-node \
        --bin gl \
        --bin git-remote-gitlawb

# -----------------------------------------------------------------------------
# Stage 2 — runtime
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl libssl3 git bash \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/gitlawb-node /usr/local/bin/gitlawb-node
COPY --from=builder /build/target/release/gl /usr/local/bin/gl
COPY --from=builder /build/target/release/git-remote-gitlawb /usr/local/bin/git-remote-gitlawb

# Persist node state (DID, db cache, anything written under /data or $HOME).
ENV HOME=/data
WORKDIR /data

EXPOSE 7545 7546

ENTRYPOINT ["gitlawb-node"]
