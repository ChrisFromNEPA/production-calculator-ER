# Long-running local hosting

This project can run directly from a stable local checkout instead of waiting for a GitHub Pages deployment. The local server uses Vite's development mode, so edits to the working tree are available immediately and do not require a commit or push.

## One-time setup

Use a stable checkout path for the working tree:

```text
REPOSITORY_DIRECTORY
```

Install dependencies there if needed:

```bash
cd REPOSITORY_DIRECTORY
npm ci
```

## Manual session

To start the LAN-bound server in a terminal:

```bash
cd REPOSITORY_DIRECTORY
npm run local:host
```

It listens on TCP port `4173` on all local interfaces. On another machine on the trusted LAN, open:

```text
http://<host-address>:4173/
```

Use the host operating system's network tools to find its LAN address. Do not record or publish that address in repository documentation.

## Persistent user service

The installed user-level systemd service is:

```text
production-calculator.service
```

It uses the stable checkout, restarts after an unexpected exit, and starts automatically for the local user:

```bash
systemctl --user status production-calculator.service
systemctl --user restart production-calculator.service
systemctl --user stop production-calculator.service
systemctl --user start production-calculator.service
```

The service is enabled and user lingering is active, so it can continue across normal terminal/session logout. After changing `package.json` or the service definition, reload it with:

```bash
systemctl --user daemon-reload
systemctl --user enable --now production-calculator.service
```

## Editing workflow

1. Edit files in `REPOSITORY_DIRECTORY`.
2. Leave the service running.
3. Refresh the Windows browser if Vite's hot reload does not update the page.
4. Run `npm test` or `npm run check` before deciding whether a change is ready to commit.

Generated data changes still need their normal local refresh commands, such as `npm run stats:update`. The server itself does not publish anything to GitHub.

## LAN safety

This server is intended for a trusted private LAN only. It has no authentication and must **not be exposed to the public internet**, port-forwarded from the router, or used for sensitive data. If the Windows machine cannot connect, check that both machines are on the same LAN and that the Linux host firewall allows inbound TCP `4173` from that LAN.
