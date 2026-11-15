#!/usr/bin/env bash
# Sets up a fresh Ubuntu LTS droplet for the production site (docs/ops/droplet.md, M8-T5).
# Run it as root the first time; it turns off root's SSH login, so later runs go through the
# admin user with sudo. Running it again changes nothing that's already set up:
#
#   ssh root@<droplet> 'ADMIN_USER=deploy bash -s' < scripts/ops/provision.sh
#   ssh deploy@<droplet> 'sudo ADMIN_USER=deploy bash -s' < scripts/ops/provision.sh
#
# It makes your admin login (with root's SSH keys), locks SSH to keys only, opens only SSH,
# HTTP and HTTPS, bans repeated failed logins, turns on automatic security updates, installs
# Docker with log rotation, adds swap, checks DigitalOcean's monitoring agent, and makes
# /srv/galaxy-explorer with an empty .env.production that only the admin user can read.
set -euo pipefail

ADMIN_USER="${ADMIN_USER:-deploy}"
ROOT_DIR=/srv/galaxy-explorer
SWAP_SIZE="${SWAP_SIZE:-2G}"

[[ $EUID -eq 0 ]] || { echo "Run as root (or with sudo)." >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

echo "== Packages"
# A new droplet is still setting itself up (cloud-init), and its first automatic updates hold
# apt's lock for a while: wait for both rather than fail.
if command -v cloud-init >/dev/null; then cloud-init status --wait >/dev/null || true; fi
echo 'DPkg::Lock::Timeout "600";' > /etc/apt/apt.conf.d/90-wait-for-lock
apt-get update -q
apt-get install -yq ca-certificates curl gnupg sudo ufw fail2ban unattended-upgrades
install -m 0755 -d /etc/apt/keyrings

echo "== Your admin login: $ADMIN_USER, with root's SSH keys"
if ! id "$ADMIN_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$ADMIN_USER"
  usermod -aG sudo "$ADMIN_USER"
fi
echo "$ADMIN_USER ALL=(ALL) NOPASSWD:ALL" > "/etc/sudoers.d/90-$ADMIN_USER"
chmod 440 "/etc/sudoers.d/90-$ADMIN_USER"
install -d -m 700 -o "$ADMIN_USER" -g "$ADMIN_USER" "/home/$ADMIN_USER/.ssh"
# Root's keys, only while the admin user has none (a later run keeps what's there).
if [[ -s /root/.ssh/authorized_keys && ! -s "/home/$ADMIN_USER/.ssh/authorized_keys" ]]; then
  install -m 600 -o "$ADMIN_USER" -g "$ADMIN_USER" /root/.ssh/authorized_keys \
    "/home/$ADMIN_USER/.ssh/authorized_keys"
fi

echo "== SSH: keys only, no root login"
# Only once the admin user can log in with a key, so this can't lock you out.
if [[ -s "/home/$ADMIN_USER/.ssh/authorized_keys" ]]; then
  # sshd keeps the first value it reads, and reads these files in name order: 01- comes
  # before cloud-init's 50-cloud-init.conf, which says "PasswordAuthentication yes" on a
  # droplet made with a password.
  cat > /etc/ssh/sshd_config.d/01-galaxy-explorer.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
SSHD
  sshd -t
  systemctl reload ssh
  # What sshd will actually do, whatever else is in its config.
  effective=$(sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin) ' | sort)
  expected=$'kbdinteractiveauthentication no\npasswordauthentication no\npermitrootlogin no'
  [[ "$effective" == "$expected" ]] || { echo "sshd still allows: $effective" >&2; exit 1; }
else
  echo "   Skipped: $ADMIN_USER has no SSH key yet. Add one, then run this again." >&2
fi

echo "== Firewall: SSH, HTTP and HTTPS only; failed logins banned"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw allow 443/udp >/dev/null # HTTP/3
ufw --force enable >/dev/null
# fail2ban's sshd jail is on by default on Ubuntu: 5 failures in 10 minutes, banned 10 minutes.
systemctl enable --now fail2ban >/dev/null

echo "== Automatic security updates"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
systemctl enable --now unattended-upgrades >/dev/null

echo "== Docker and Compose"
if ! command -v docker >/dev/null; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -yq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
# Each container's log is kept to 5 files of 10 MB, so logs can't fill the disk.
if [[ ! -f /etc/docker/daemon.json ]]; then
  cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" }
}
JSON
  systemctl restart docker
fi
usermod -aG docker "$ADMIN_USER"

echo "== Swap: $SWAP_SIZE, for a burst of image decoding on a small droplet"
if ! swapon --show=NAME --noheadings | grep -q '^/swapfile$'; then
  [[ -f /swapfile ]] || { fallocate -l "$SWAP_SIZE" /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null; }
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== DigitalOcean's monitoring agent"
if systemctl is-active --quiet do-agent; then
  echo "   Running."
else
  # Ticking "Monitoring" when the droplet is made installs it; this is for a droplet made
  # without. DigitalOcean's own installer, from its own site.
  curl -fsSL https://repos.insights.digitalocean.com/install.sh | bash
fi

echo "== $ROOT_DIR, with its settings file"
install -d -m 750 -o "$ADMIN_USER" -g "$ADMIN_USER" "$ROOT_DIR"
if [[ ! -f "$ROOT_DIR/.env.production" ]]; then
  install -m 600 -o "$ADMIN_USER" -g "$ADMIN_USER" /dev/null "$ROOT_DIR/.env.production"
fi
chmod 600 "$ROOT_DIR/.env.production"

echo
echo "Done. Next (docs/ops/droplet.md): fill in $ROOT_DIR/.env.production, as $ADMIN_USER."
