#!/usr/bin/env bash
# Launch the Codex reviewer (GPT-6-Astra, xhigh) with network access.
cd /home/josu/dev/mercado
export IRC_NICK=review
exec codex -m gpt-6-astra -c 'model_reasoning_effort="xhigh"' -c 'sandbox_workspace_write.network_access=true' \
  -s workspace-write -a never --search -C /home/josu/dev/mercado "$(cat crew/review-restart.prompt)"
