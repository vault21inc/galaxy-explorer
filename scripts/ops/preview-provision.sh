#!/usr/bin/env bash
# Sets up a fresh Ubuntu LTS server for the private preview (docs/ops/preview.md, step 2).
# Run once as root; running it again changes nothing that's already set up.
#
#   ADMIN_USER=deploy bash preview-provision.sh
#
# It creates your admin login (with root's SSH keys), locks SSH to keys only, opens only SSH,
# HTTP and HTTPS, turns on automatic security updates, installs Docker, Node, pnpm and Caddy,
# and makes the `ge` user that runs the app, with its folders and a GitHub deploy key.
set -euo pipefail

ADMIN_USER="${ADMIN_USER:-deploy}"
NODE_MAJOR="${NODE_MAJOR:-26}"
PNPM_VERSION="${PNPM_VERSION:-12.16.1}"
ROOT_DIR=/srv/galaxy-explorer

[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== Packages"
apt-get update -q
apt-get install -yq ca-certificates curl gnupg git ufw fail2ban unattended-upgrades \
  debian-keyring debian-archive-keyring apt-transport-https
install -m 0755 -d /etc/apt/keyrings

echo "== Your admin login: $ADMIN_USER, with root's SSH keys"
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$ADMIN_USER"
  usermod -aG sudo "$ADMIN_USER"
fi
echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$ADMIN_USER"
chmod 440 "/etc/sudoers.d/90-$ADMIN_USER"
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
if [[ -s /root/.ssh/authorized_keys ]]; then
  install -m 600 -o "$ADMIN_USER" -g "$ADMIN_USER" /root/.ssh/authorized_keys \
    "/home/$ADMIN_USER/.ssh/authorized_keys"
fi

echo "== SSH: keys only, no root login"
# Only once the admin user can log in with a key, so this can't lock you out.
if [[ -s "/home/$ADMIN_USER/.ssh/authorized_keys" ]]; then
  cat > /etc/ssh/sshd_config.d/90-preview.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
SSHD
  systemctl reload ssh
else
  echo "   Skipped: $ADMIN_USER has no SSH key yet. Add one, then run this again." >&2
fi

echo "== Firewall: SSH, HTTP and HTTPS only"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null   # HTTP/3
ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "== Docker (for Postgres)"
if ! command -v docker >/dev/null; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
usermod -aG docker "$ADMIN_USER"

echo "== Node $NODE_MAJOR and pnpm $PNPM_VERSION"
if ! node --version 2>/dev/null | grep -q "^v$NODE_MAJOR\."; then
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -q
  apt-get install -yq nodejs
fi
npm install -g --silent "pnpm@$PNPM_VERSION"

echo "== Caddy"
if ! command -v caddy >/dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -yq caddy
fi
# Caddy reads the preview's settings (site name, sign-ins) from a file only it can read.
install -d /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/preview.conf <<'UNIT'
[Service]
EnvironmentFile=/etc/caddy/preview.env
UNIT
[[ -f /etc/caddy/preview.env ]] || install -m 640 -o root -g caddy /dev/null /etc/caddy/preview.env
systemctl daemon-reload

echo "== The app's user and folders"
id ge >/dev/null 2>&1 || adduser --system --group --home "$ROOT_DIR" --shell /bin/bash ge
install -d -o ge -g ge "$ROOT_DIR" "$ROOT_DIR/media"
install -d -o root -g root -m 700 "$ROOT_DIR/backups"
if [[ ! -f "$ROOT_DIR/.ssh/id_ed25519" ]]; then
  install -d -m 700 -o ge -g ge "$ROOT_DIR/.ssh"
  sudo -u ge ssh-keygen -q -t ed25519 -N "" -C "galaxy-explorer-preview" -f "$ROOT_DIR/.ssh/id_ed25519"
  sudo -u ge sh -c "ssh-keyscan -q github.com >> $ROOT_DIR/.ssh/known_hosts"
fi

echo "== Nightly backups at 03:30"
cat > /etc/cron.d/galaxy-explorer-backup <<'CRON'
30 3 * * * root /srv/galaxy-explorer/app/scripts/ops/preview-backup.sh >> /var/log/galaxy-explorer-backup.log 2>&1
CRON

echo
echo "Done. Next (docs/ops/preview.md, step 3): add this key to the GitHub repository as a"
echo "read-only deploy key, then clone the app as the ge user:"
echo
cat "$ROOT_DIR/.ssh/id_ed25519.pub"
