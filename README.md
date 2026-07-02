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

3. Open control UI:

- `http://<server-ip>:3000/control`

4. On each display machine, open:

- `http://<server-ip>:3000/display?displayId=display-1`
- `http://<server-ip>:3000/display?displayId=display-2`

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

## Deployment Notes for Proxmox

- Run Docker engine in your Proxmox VM/LXC.
- Expose port `3000` to LAN.
- Prefer static DHCP for the server IP.
- Optionally place behind reverse proxy with HTTPS cert.

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
