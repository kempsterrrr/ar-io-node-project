# syntax=docker/dockerfile:1.7
# =============================================================================
# Gitlawb Sidecar — image containing gitlawb-node + gl CLI + git-remote-gitlawb
# =============================================================================
# Build strategy (cargo dep-prebuild pattern, mirrors upstream's Dockerfile):
#   Stage 1 (source)   — git clone upstream at the pinned SHA
#   Stage 2 (deps)     — COPY only Cargo.{toml,lock} + stub crate sources,
#                        run `cargo build --release` so the heavy 150-crate
#                        dep tree compiles into a layer that caches until
#                        Cargo.lock changes
#   Stage 3 (builder)  — COPY real crate sources, rebuild — only our workspace
#                        crates recompile, deps come from the cargo build cache
#   Stage 4 (runtime)  — debian:bookworm-slim with the three binaries
#
# Same image serves both the long-running `gitlawb-node` service and the `gl`
# ops service (entrypoint overridden in compose).
# =============================================================================

ARG GITLAWB_SHA=f312955c351cd4cbd1e302c8cb34459c3c2da0a8

# -----------------------------------------------------------------------------
# Stage 1 — fetch upstream source
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim AS source
ARG GITLAWB_SHA
RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone https://github.com/Gitlawb/node.git . \
    && git checkout ${GITLAWB_SHA}

# -----------------------------------------------------------------------------
# Stage 2 — pre-build dependencies with stub crate sources
# -----------------------------------------------------------------------------
# This layer caches until Cargo.{toml,lock} change. Warm builds skip the ~10 min
# Rust dep compile entirely.
# Toolchain pinned to upstream's (see Gitlawb/node Dockerfile at GITLAWB_SHA).
FROM rust:1.91-slim-bookworm AS deps
RUN apt-get update && apt-get install -y --no-install-recommends \
        pkg-config libssl-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build

COPY --from=source /src/Cargo.toml /src/Cargo.lock ./
COPY --from=source /src/crates/gitlawb-core/Cargo.toml crates/gitlawb-core/
COPY --from=source /src/crates/gitlawb-node/Cargo.toml crates/gitlawb-node/
COPY --from=source /src/crates/gl/Cargo.toml crates/gl/
COPY --from=source /src/crates/git-remote-gitlawb/Cargo.toml crates/git-remote-gitlawb/

# Empty lib for gitlawb-core (it's a lib crate); empty main.rs for the three bins.
RUN mkdir -p \
        crates/gitlawb-core/src \
        crates/gitlawb-node/src \
        crates/gl/src \
        crates/git-remote-gitlawb/src \
    && : > crates/gitlawb-core/src/lib.rs \
    && echo 'fn main() {}' > crates/gitlawb-node/src/main.rs \
    && echo 'fn main() {}' > crates/gl/src/main.rs \
    && echo 'fn main() {}' > crates/git-remote-gitlawb/src/main.rs \
    && cargo build --release \
        --bin gitlawb-node --bin gl --bin git-remote-gitlawb

# -----------------------------------------------------------------------------
# Stage 3 — real build
# -----------------------------------------------------------------------------
FROM deps AS builder
WORKDIR /build

# Replace stub sources with real ones from upstream.
COPY --from=source /src/crates crates/

# Touch every .rs so cargo notices the source change after the stub build above.
RUN find crates -name '*.rs' -exec touch {} + \
    && cargo build --release \
        --bin gitlawb-node \
        --bin gl \
        --bin git-remote-gitlawb

# -----------------------------------------------------------------------------
# Stage 4 — runtime
# -----------------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl libssl3 git bash \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/gitlawb-node /usr/local/bin/gitlawb-node
COPY --from=builder /build/target/release/gl /usr/local/bin/gl
COPY --from=builder /build/target/release/git-remote-gitlawb /usr/local/bin/git-remote-gitlawb

# Persist node state (DID, db cache, anything written under /data or $HOME).
# v0.2 will introduce a dedicated non-root user once the bind-mount UID mapping
# for ./backups is worked out (see ROADMAP).
ENV HOME=/data
WORKDIR /data

EXPOSE 7545 7546

ENTRYPOINT ["gitlawb-node"]
