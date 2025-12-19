# Data Retention and Backup (V1)

## Retention
- Logs: configurable per project (default 90 days)
- Incidents: retain indefinitely unless policy requires purge

## Backup
- Postgres daily backups
- MinIO bucket snapshots weekly

## Restore
- Restore DB first, then storage
- Rebuild indexes and verify counts
