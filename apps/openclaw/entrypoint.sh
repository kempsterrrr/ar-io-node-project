#!/bin/sh
set -e

# Ensure pairing state can be written when using a named volume.
if [ ! -d /home/node/.openclaw/devices ]; then
  mkdir -p /home/node/.openclaw/devices
fi
chown -R node:node /home/node/.openclaw/devices

exec gosu node "$@"
