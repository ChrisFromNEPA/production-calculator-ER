# Local hosting

The calculator can run from a local checkout without waiting for a GitHub Pages deployment. Vite serves the current working tree and reloads the browser after most edits.

## Manual session

```bash
git clone https://github.com/ChrisFromNEPA/production-calculator-ER.git
cd production-calculator-ER
npm ci
npm run local:host
```

Open <http://localhost:4173/> on the host. The `local:host` command listens on all local interfaces, so another device on the same trusted network can use:

```text
http://<host-address>:4173/
```

Do not commit or publish a private LAN address.

## Optional systemd user service

Linux users can keep the development server running with a user service. Replace `/absolute/path/to/production-calculator-ER` with the real checkout path and replace `/usr/bin/npm` if `command -v npm` reports another location.

```ini
# ~/.config/systemd/user/production-calculator.service
[Unit]
Description=Empire Rising Production Calculator
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/absolute/path/to/production-calculator-ER
ExecStart=/usr/bin/npm run local:host
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

Load and start it with:

```bash
systemctl --user daemon-reload
systemctl --user enable --now production-calculator.service
systemctl --user status production-calculator.service
```

Use `systemctl --user restart production-calculator.service` after dependency or service-file changes. Enabling user lingering is an operating-system decision; it is not required for a normal terminal session.

## Editing workflow

1. Edit files in the checkout.
2. Leave the Vite server running.
3. Refresh the browser if hot reload does not update the page.
4. Run `npm run check` before committing.

Generated data changes still need their normal refresh command, such as `npm run stats:update`. The local server never publishes changes to GitHub.

## Network safety

The development server has no authentication. Use it only on a trusted private network. Do not expose port `4173` to the public internet or forward it through a router. If another local device cannot connect, confirm both devices are on the same network and review the host firewall rules before changing them.
