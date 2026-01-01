# Habit Tracker Ops Guide

## Local dev
- Install deps: `npm install`
- Run server: `node server.js` (uses DB_PATH or defaults to /opt/habit-tracker/data/tracker.db)
- Run tests: `DB_PATH=./data/test.db npm test -- --runInBand`
- Lint (optional): `npm run lint` (noop if not configured)

## Database & migrations
- Default DB: `/opt/habit-tracker/data/tracker.db` (configurable via `DB_PATH`).
- Migrations: `DB_PATH=/path/to/db node scripts/migrate.js`
- Backups: migrate script auto-creates `backups/` beside the DB and keeps last 10 copies.

## CI/CD pipeline
- Workflow: `.github/workflows/ci-cd.yml`
- Steps: checkout → install → prepare temp DB → run migrations → tests (DB_PATH points to temp DB) → coverage → build syntax check.

## Deploy (Proxmox/systemd)
- Deploy script: `scripts/deploy.sh` (pull, install, test, backup, migrate, restart)
- Systemd unit: `scripts/habit-tracker.service`
  - Pre-start migration: `ExecStartPre=/usr/bin/env DB_PATH=/opt/habit-tracker/data/tracker.db node /opt/habit-tracker/scripts/migrate.js`
  - Start: `ExecStart=/usr/bin/node /opt/habit-tracker/server.js`
- Enable service: `sudo systemctl enable habit-tracker`;
  start/restart: `sudo systemctl restart habit-tracker`;
  logs: `journalctl -u habit-tracker -f`.

## Persistence & backup tips
- Keep `/opt/habit-tracker/data/` on durable storage.
- Cron-friendly backup: `DB_PATH=/opt/habit-tracker/data/tracker.db RETENTION=14 /opt/habit-tracker/scripts/backup.sh`
  - Example cron (UTC 02:00): `0 2 * * * DB_PATH=/opt/habit-tracker/data/tracker.db /opt/habit-tracker/scripts/backup.sh >> /var/log/habit-backup.log 2>&1`
- Before schema changes in production: run `node scripts/migrate.js` with DB_PATH pointing to prod DB and verify backups exist.

### systemd timer option
- Copy service/timer into systemd: `sudo cp scripts/habit-tracker-backup.service /etc/systemd/system/` and `sudo cp scripts/habit-tracker-backup.timer /etc/systemd/system/`
- Enable & start timer: `sudo systemctl enable --now habit-tracker-backup.timer`
- Check status/logs: `systemctl list-timers | grep habit-tracker-backup` and `journalctl -u habit-tracker-backup.service -u habit-tracker-backup.timer`

## Smoke test checklist
1) Register/login.
2) Create a commitment and mark a check-in.
3) Add two accounts and perform a transfer; verify total net unchanged.
4) Hit `/api/health` for basic status.
