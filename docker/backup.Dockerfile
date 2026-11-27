# The backup container (M8-T7, docs/ops/restore.md): Postgres's own client tools, the same
# version as the server (pg_dump refuses a newer server), and rclone to reach the bucket.
#
#   docker build -f docker/backup.Dockerfile -t galaxy-explorer-backup .
#
# rclone's official image holds one static binary, which runs anywhere: copy it, pinned.
FROM rclone/rclone:1.76.0 AS rclone

FROM postgres:18.6

# Certificates for HTTPS to the bucket, and curl for the optional monitor's ping.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY scripts/ops/backup/ /opt/ge-backup/

# The same user id as the API's `node` user: files a restore unpacks into the media volume
# are then the API's own. /work is where a set is put together or downloaded. /media is the
# API's too: on a new machine this container may mount the empty media volume first, and
# Docker gives a new volume the owner of the folder it's first mounted on.
# rclone takes its remote from the environment (lib.sh); an empty config file keeps it quiet.
RUN chmod 755 /opt/ge-backup/*.sh \
  && touch /etc/rclone.conf \
  && mkdir -p /work /media \
  && chown 1000:1000 /work /media
USER 1000:1000
ENV PATH=/opt/ge-backup:$PATH \
  HOME=/tmp \
  RCLONE_CONFIG=/etc/rclone.conf

# Not the Postgres image's entrypoint, which would start a server.
ENTRYPOINT []
CMD ["backup.sh", "schedule"]
