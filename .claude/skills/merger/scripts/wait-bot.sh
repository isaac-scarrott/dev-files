#!/bin/bash
# wait-bot.sh <pr>: wait until the SDK visual bot has committed (head changes, label removed) or 40 min pass
pr=$1; h0=$(gh pr view $pr --json headRefOid -q .headRefOid)
for i in $(seq 1 120); do
  j=$(gh pr view $pr --json headRefOid,labels --jq '[.headRefOid,([.labels[].name]|index("sdk-visual-changes-approved")!=null)]|@tsv')
  h=${j%%$'\t'*}; l=${j##*$'\t'}
  [ "$l" = false ] && { echo "BOT DONE $pr ${h:0:10}"; exit 0; }
  [ "$h" != "$h0" ] && { echo "BOT PUSHED $pr ${h:0:10}"; exit 0; }
  sleep 20
done
echo "BOT TIMEOUT $pr"
