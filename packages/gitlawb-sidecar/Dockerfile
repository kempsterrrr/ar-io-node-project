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

# Copy everything from upstream. This overlays the deps stage with real
# sources AND root-level files that crates pull in at compile time via
# `include_str!` / `include_bytes!` (notably `bootstrap-peers.json`, which
# gitlawb-node/src/bootstrap.rs embeds with `include_str!("../../../bootstrap-peers.json")`).
# The Cargo.{toml,lock} content is identical to what deps already copied —
# this is a no-op for those files. The `target/` directory from the deps
# stage is preserved (it doesn't exist in /src), so cargo reuses the
# pre-compiled dependency artifacts and only recompiles the workspace crates.
COPY --from=source /src/ ./

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

# Non-root user for the long-running gitlawb-node service.
# uid 10001 = stable system uid; gid 0 (root group) makes named volumes and
# group-readable files work without per-host UID mapping.
RUN useradd --system --uid 10001 --gid 0 --home-dir /data --shell /usr/sbin/nologin gitlawb

COPY --from=builder /build/target/release/gitlawb-node /usr/local/bin/gitlawb-node
COPY --from=builder /build/target/release/gl /usr/local/bin/gl
COPY --from=builder /build/target/release/git-remote-gitlawb /usr/local/bin/git-remote-gitlawb

# Persist node state (DID, db cache, anything written under /data or $HOME).
# Group-rwx so files written by root in the gl ops service stay readable by
# gitlawb (uid 10001) when both services share this volume.
RUN mkdir -p /data && chown -R 10001:0 /data && chmod -R ug+rwX /data

ENV HOME=/data
WORKDIR /data
USER 10001

EXPOSE 7545 7546

ENTRYPOINT ["gitlawb-node"]
