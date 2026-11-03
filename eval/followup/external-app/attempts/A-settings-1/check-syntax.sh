#!/bin/sh
# Syntax-only check for blind-task patches (no app knowledge needed).
set -e
node --check patch.js && echo "SYNTAX OK"
