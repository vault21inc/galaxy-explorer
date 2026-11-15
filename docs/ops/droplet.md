# The production droplet

How the machine for the public site is set up (M8-T5): one DigitalOcean droplet running the stack in [production.md](production.md). The scripted steps are in `scripts/ops/provision.sh`, which is safe to run again.

Steps 1, 3 and 5 happen in DigitalOcean's and the DNS provider's consoles; the rest from your Mac, in the repository.

## 1. Create the droplet

In DigitalOcean: **Create › Droplets**.

| Setting | Value |
|---|---|
| Region | the preview's (`mkc1`), or the one nearest your readers |
| Image | Ubuntu 24.04 (LTS) x64 |
| Size | Basic, Regular: 2 vCPU, 4 GB, 80 GB disk. A starting point; resize later if the graphs say so |
| Authentication | **SSH key**: the one on your Mac. No password |
| Networking | **Public IPv4** and **Public IPv6** both ticked (IPv6 is off unless ticked) |
| Monitoring | **Improved metrics and monitoring** on (installs DigitalOcean's agent) |
| Name | `galaxy-explorer-prod` |

Note its IPv4 and IPv6 addresses. A droplet made without IPv6 can have it turned on later on its **Networking** tab, following DigitalOcean's steps for an existing droplet; until then, leave out the AAAA record in step 3.

## 2. Provision it

From the repository on your Mac, as root the first time (the only time root can log in):

```bash
ssh -o StrictHostKeyChecking=accept-new root@<ipv4> 'ADMIN_USER=deploy bash -s' < scripts/ops/provision.sh
```

A new droplet is still setting itself up for a minute or two (cloud-init, and its first automatic updates holding apt's lock); the script waits for both. The run takes about three minutes.

It makes the `deploy` login with root's SSH key, turns off password and root logins (and checks that sshd really did), opens only SSH, HTTP and HTTPS (`ufw`), bans repeated failed logins (`fail2ban`), turns on automatic security updates, installs Docker and Compose with log rotation, adds 2 GB of swap, checks the monitoring agent, and makes `/srv/galaxy-explorer` with an empty `.env.production` (mode 600, `deploy`'s).

Then log in as `deploy`, and run it once more, which should change nothing:

```bash
ssh deploy@<ipv4> 'sudo ADMIN_USER=deploy bash -s' < scripts/ops/provision.sh
```

Root can't log in any more: `ssh root@<ipv4>` is refused.

Docker publishes container ports past `ufw`. Only Caddy publishes any (80 and 443), which are open anyway; Postgres publishes none (production.md).

## 3. Point the domain at it

The site is `galaxyexplorer.perturbatory.com` (the owner's choice, 2026-11-15), the name the private preview has had since D-31. While the preview still answers there, this step waits for go-live: once the stack runs on the new droplet (M8-T6), the records move, and the preview goes dark. Until then the droplet is reached by its address.

At the DNS provider, for the site's name:

- an **A** record to the droplet's IPv4 address;
- an **AAAA** record to its IPv6 address.

At Cloudflare, leave them **DNS only** (grey cloud), as for the preview: Caddy gets its own certificate from Let's Encrypt, and the API sees each visitor's address for its rate limits.

## 4. Fill in the settings

As `deploy`, fill in `/srv/galaxy-explorer/.env.production` from `docker/production.env.example`. Make the secrets on the droplet, so they never pass through your Mac:

```bash
ssh deploy@<ipv4>
cd /srv/galaxy-explorer
{
  echo "GE_SITE_ADDRESS=<the domain>"
  echo "GE_PUBLIC_URL=https://<the domain>"
  echo "GE_DB_PASSWORD=$(openssl rand -hex 32)"
  echo "GE_SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
  echo "GE_WIKI_USER_AGENT=GalaxyExplorer/1.0 (contact: <your email>)"
} >> .env.production
chmod 600 .env.production
```

Keep a copy of the two secrets somewhere safe (a password manager): restoring a backup onto a new droplet needs the same `GE_SESSION_SECRET`, or every account loses its two-factor codes. Never commit the file.

## 5. Monitoring

- **The agent:** the droplet's **Graphs** tab shows CPU, memory and disk once Monitoring is on.
- **An uptime check:** **Monitoring › Uptime › Create Uptime check** for `https://<the domain>/api/health`, from several regions, alerting your email when it's down or the certificate is near expiry. (It's red until the stack is deployed, M8-T6.)
- **Alerts:** **Monitoring › Create alert policy** for the droplet: CPU above 80 % for 10 minutes, memory above 90 %, disk above 80 %, to your email.

## 6. Check it

```bash
ssh deploy@<ipv4> 'sudo ufw status; sudo fail2ban-client status sshd | head -3; docker compose version; swapon --show; ls -l /srv/galaxy-explorer'
dig +short <the domain> A; dig +short <the domain> AAAA
```

The deploy pipeline (M8-T6) takes it from here.

## Record

| Date | What | Notes |
|---|---|---|
| 2026-11-15 | Followed from scratch (M8-T5): `galaxy-explorer-prod`, NYC3, 159.203.101.110 | Steps 1, 2, 4 and 6 done. The second run changed nothing; root logins are refused; fail2ban was counting bots' failed logins within minutes. Corrections: the script now waits for cloud-init and apt's lock; IPv6 wasn't ticked, so the droplet has none yet (step 1 now says it's off unless ticked). Step 3 (DNS) and the uptime check wait for go-live (M8-T6); the alert policy is the owner's to add. |
