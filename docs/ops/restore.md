# Backups and restoring

Every night the `backup` container (M8-T7) copies the database and the uploaded images to a bucket away from the droplet, and keeps 30 days of them. This page covers setting it up, checking it, and getting the data back. The stack itself is in [production.md](production.md), the droplet in [droplet.md](droplet.md).

## What a backup holds

One folder per night in the bucket, `nightly/<UTC time>/`, such as `nightly/20261128T033000Z/`:

| File | Holds |
|---|---|
| `ge.dump` | the whole database, `pg_dump --format=custom` |
| `media.tar.gz` | the media volume: every uploaded image and its variants |
| `rows.tsv` | each table's row count, counted in the same snapshot as the dump |
| `manifest.txt` | when, from which release, the Postgres version, how many media files |
| `SHA256SUMS` | the checksums of the four above, written last: a folder without it is unfinished and never restored |

The counts and the dump read one snapshot of the database, so they agree exactly, even if someone was editing at 03:30. That is what lets the drill check a restore row for row.

The database is copied before the images. The API writes an image's files before the rows that name them and never deletes them (`asset-service.ts`), so every file the dump names is in the archive.

**Not in it:**
- `.env.production`. Keep a copy of it in your password manager. Restoring onto a new droplet needs the same `GE_SESSION_SECRET`, or every account loses its two-factor codes.
- Caddy's certificates. Caddy asks Let's Encrypt for new ones.

**What's in it is private:** accounts and their password hashes, and private universes. The bucket is private, and its key reaches that bucket only.

## Setting it up

1. Make a bucket, such as DigitalOcean Spaces `galaxy-explorer-backups` in SFO3. Use a region other than the droplet's, so one datacenter's trouble can't take both. Use Standard storage, with no CDN. Any S3-compatible storage works, such as Cloudflare R2.
2. Make a key that reaches only that bucket, with read, write and delete. In Spaces: **Spaces Object Storage › Access Keys › Create Access Key › Limited access**. Keep the secret in your password manager.
3. On the droplet, add the settings to `/srv/galaxy-explorer/.env.production`:

   ```
   GE_BACKUP_S3_ENDPOINT=https://sfo3.digitaloceanspaces.com
   GE_BACKUP_S3_BUCKET=galaxy-explorer-backups
   GE_BACKUP_S3_ACCESS_KEY_ID=…
   GE_BACKUP_S3_SECRET_ACCESS_KEY=…
   ```

   The endpoint is the region's address without the bucket's name. For R2, it's `https://<account id>.r2.cloudflarestorage.com`, with `GE_BACKUP_S3_REGION=auto`.

4. Deploy a release, or restart the container: `stack up -d backup` (with `stack` as in [deploy.md](deploy.md#logs-and-state)). As it starts, it lists the bucket and logs `Backups on: …` or what's wrong. The deploy's output shows that line.

Optional settings:

| Setting | Default | Does |
|---|---|---|
| `GE_BACKUP_AT` | `03:30` | when, in UTC |
| `GE_BACKUP_KEEP_DAYS` | `30` | how long a backup is kept; older ones are deleted after each night's upload |
| `GE_BACKUP_PING_URL` | none | a monitor's address, such as a healthchecks.io check, asked after each backup (with `/fail` appended when it failed) |
| `GE_BACKUP_S3_REGION` | `us-east-1` | the region the key signs for; Spaces takes any, R2 wants `auto` |

**A monitor is how you hear about a failure.** Nothing else tells you that a backup didn't happen. A free healthchecks.io check, set to expect a ping every day with a grace time of a few hours, emails you if a night fails or never comes. That includes the container not running at all.

Without `GE_BACKUP_S3_BUCKET`, the container logs `Backups are off` and waits. That's the case when trying the stack on your Mac.

## Checking it

On the droplet, as `deploy`, in `/srv/galaxy-explorer`, with `stack` as in [deploy.md](deploy.md#logs-and-state):

```bash
stack logs --tail 20 backup                 # the last nights
stack run --rm backup list.sh               # the finished backups, with their sizes
stack run --rm backup backup.sh now         # make one now
stack run --rm backup restore-drill.sh      # prove the newest one restores
```

### The restore drill

`restore-drill.sh [set]` proves a backup can be restored, without touching the live data:

1. It downloads the newest finished backup (or the one named) and checks its checksums.
2. It restores the dump into a scratch database, `ge_restore_drill`, on the same Postgres.
3. It counts every table's rows there and compares them with `rows.tsv`. They must match exactly.
4. It counts the files in the media archive and compares them with the manifest.
5. It drops the scratch database, whatever happened.

Run it after setting up, after a Postgres upgrade, and now and then. Record each run below.

## Restoring

### On the same droplet

Use this when data was lost or damaged, and the server is fine. Pick the backup from `list.sh`, then:

```bash
stack stop api mcp
stack run --rm -v galaxy-explorer-prod_media:/media-restore backup restore.sh 20261128T033000Z --replace
stack up -d --wait
```

`restore.sh` does the following:

1. It checks the backup's checksums.
2. It refuses while anything is still connected to the database.
3. It keeps the live database, renamed to `ge_before_<time>`.
4. It restores the backup as a new `ge`. If that fails, it renames the old one back.
5. It unpacks the images over the media volume. Files added since the backup stay, unused.

`up -d --wait` runs the migrations, which bring an older backup up to the release's schema, then starts the API again.

Once the site looks right, drop the database the restore replaced:

```bash
stack exec postgres dropdb -U ge ge_before_<time>
```

To undo the restore instead: stop the API again, drop `ge`, and rename `ge_before_<time>` back to `ge` (`ALTER DATABASE … RENAME TO ge`).

### Onto a new droplet

Use this when the droplet itself is lost.

1. Make and provision a new droplet ([droplet.md](droplet.md)).
2. Put the same `.env.production` on it, from your password manager, with the backup settings.
3. Deploy the release that was live, or the newest. It starts with an empty database.
4. Restore the newest backup as above.
5. Point the DNS record at the new address.

### One universe only

A restore puts back the whole database. To get back one universe that was deleted or damaged, while keeping everything else as it is now:

1. Restore the backup into a scratch database with the drill's steps, by hand.
2. Export that universe from it (M7-T4's export, through an API pointed at the scratch database).
3. Import the export into the live site.

This hasn't been needed yet.

## Record

| Date | What | Result |
|---|---|---|
| 2026-11-27 | Backup, drill and restore against a fake S3 server (`rclone serve s3`) on the owner's Mac, with a copy of the development database (5,962 entities) and its 29 media files. A writer added rows during one backup. | Passed. The rows written during the backup were in `rows.tsv` (93 of 121 at the snapshot), and the drill matched all 30 tables. `restore.sh` refused while a connection was open, then restored and kept the old database. Sets over 30 days were deleted. |
| 2026-11-28 | On production, after `v0.20.0`: the first backup by hand (`backup.sh now`, set `20261128T155012Z`: the database 540 KB, the media 59 files in 11 MB, 4 seconds), then `restore-drill.sh` against the real bucket. | Passed. Checksums matched, and all 29 tables matched in `ge_restore_drill` (6,385 rows). All 59 media files were in the archive. M8-T7's "Done when". |
