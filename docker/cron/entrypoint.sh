#!/bin/sh
# Daily pursuit search — runs at 8:00 AM every day.
# Authenticates with the shared CRON_SECRET (the only way to bypass NextAuth on
# /api/pursuits/run-search). Both this container and the app container must
# receive the same CRON_SECRET via env. Allow up to 5 min for Anthropic web
# searches.

if [ -z "$CRON_SECRET" ]; then
  echo "ERROR: CRON_SECRET is not set — cron cannot authenticate to /api/pursuits/run-search." >&2
  exit 1
fi

# crond runs jobs in a stripped environment, so persist the secret to a file
# the job sources at run time.
echo "CRON_SECRET=$CRON_SECRET" > /etc/cron-env

echo '0 8 * * * . /etc/cron-env; curl -s -m 300 -X POST http://quallection_app:3000/api/pursuits/run-search -H "Content-Type: application/json" -H "Authorization: Bearer $CRON_SECRET" -d "{}"' | crontab -
echo "Pursuit scheduler started — daily at 08:00"
crond -f -l 8
