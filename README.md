# MultiscreenDisplayManager

A local-first, low-latency multiscreen presentation system with:

- A central server (Docker-ready) that hosts:
  - Control UI (`/control`)
  - Display UI (`/display`)
  - Socket.IO signaling/state hub
- Multiple display clients (PCs connected to TVs/screens)
- WebRTC-based screen/application streaming (up to 4 simultaneous sources)
- Secondary widgets:
  - Clock (timezone selectable)
  - Timer
  - Stopwatch
  - Random selector

## Architecture

- **Server**: Node.js + Express + Socket.IO
- **Streaming**: Browser `getDisplayMedia()` + WebRTC peer connections
- **State sync**: Socket.IO broadcast of layout + widget state
- **Clients**:
  - **Controller**: open `/control`
  - **Display devices**: open `/display?displayId=<ID>` (or let it auto-generate)

All signaling and state are local to your network (LAN), and media flows peer-to-peer between controllers and display devices.

## Quick Start (Docker)

1. Copy env file:

```bash
cp .env.example .env
```

2. Start service:

```bash
docker compose up --build -d
```

Set `HTTPS_HOSTS` in `.env` before starting.

- Local machine test: `HTTPS_HOSTS=localhost,127.0.0.1`
- LAN by IP example: `HTTPS_HOSTS=192.168.1.50,localhost,127.0.0.1`
- LAN by DNS name example: `HTTPS_HOSTS=multiscreen.lan,192.168.1.50,localhost,127.0.0.1`

3. Open control UI:

- `https://<https-host>/control`

If a client device needs the local certificate first, use HTTP helper page:

- `http://<server-ip>:3000/cert`

4. On each display machine, open:

- `https://<https-host>/display?displayId=display-1`
- `https://<https-host>/display?displayId=display-2`

Use full-screen browser / kiosk mode on display machines.

## Local Dev (without Docker)

```bash
cd server
npm install
npm run dev
```

Then open:

- `http://localhost:3000/control`
- `http://localhost:3000/display?displayId=display-1`

## Core Features

### Streaming

- Controller can start a stream source (screen/app/window via browser picker)
- Source can be assigned to any slot
- Multiple controller users can stream concurrently
- Up to 4 stream slots at once

### Layout Modes

- Single
- Split horizontal (top/bottom)
- Split vertical (left/right)
- Grid 2x2

### Secondary Widgets

- Clock: configurable timezone per slot
- Timer: set, start, stop, reset
- Stopwatch: start, stop, reset
- Random selector: add options, roll randomly

## Important Browser Notes

- `getDisplayMedia()` requires HTTPS or localhost in most browsers.
- On LAN, you should run behind HTTPS reverse proxy (e.g., Caddy/Nginx with TLS) for best compatibility.
- Audio capture support depends on OS/browser and selected source.

### Trusting Local TLS (Caddy Internal CA)

If you use `tls internal` (default in this project), client devices must trust Caddy's local root certificate.

1. Export cert from server:

```bash
docker cp multiscreen-proxy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

Alternative: open `http://<server-ip>:3000/cert` and download directly.

2. Install `caddy-root.crt` into the trusted Root CA store on each controller/display device.

3. Re-open the site using `https://<https-host>/...`.

Without trusting this cert, browsers may still treat the connection as not secure enough for screen capture.

### Secure Context Troubleshooting

If Start Sharing still says secure context is required:

1. Make sure you are using `https://...` URL, not `http://...`.
2. Make sure the URL host appears in `HTTPS_HOSTS` (exact IP/hostname you open in browser).
3. Recreate proxy certs after changing `HTTPS_HOSTS`:
  - `docker compose down`
  - `docker volume rm multiscreenpresenter_caddy_data multiscreenpresenter_caddy_config`
  - `docker compose up -d --build`
4. Re-download/install the new root cert from `http://<server-ip>:3000/cert`.
5. Firefox only: set `security.enterprise_roots.enabled=true` in `about:config` and restart Firefox.

## Deployment Notes for Proxmox

- Run Docker engine in your Proxmox VM/LXC.
- Expose ports `80` and `443` to LAN.
- Prefer static DHCP for the server IP.
- Set `HTTPS_HOST` in `.env` to that static IP or DNS name.

## Security (Recommended Next)

- Add authentication for `/control`.
- Restrict control access by subnet/firewall.
- Add role-based permissions for advanced usage.

## Project Structure

```text
.
├── docker-compose.yml
├── .env.example
└── server
    ├── Dockerfile
    ├── package.json
    ├── src
    │   └── server.js
    └── public
        ├── control
        │   ├── index.html
        │   ├── styles.css
        │   └── app.js
        └── display
            ├── index.html
            ├── styles.css
            └── app.js
```
