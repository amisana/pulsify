# dAUXimity

<div align="center">
  <h3>PULSE // LIVE AUDIO STREAMING PROTOCOL</h3>
</div>

dAUXimity is a retro-cyberpunk aesthetic web application for creating and joining live audio rooms. It uses WebRTC for peer-to-peer audio streaming and Socket.io for signaling and chat.

## Features

- **Live Audio Streaming**: High-fidelity, low-latency audio using WebRTC.
- **Room System**: Create public rooms or join existing ones.
- **Real-time Chat**: Text communication within rooms.
- **Retro UI**: CRT scanlines, glitch effects, and neon color palette.
- **Zero Auth**: Anonymous usage with ephemeral IDs.

## Project Structure

- `server.js`: Node.js/Express backend with Socket.io.
- `src/`: Frontend React application.
  - `App.tsx`: Main application logic.
  - `components/`: UI components (Room, Lobby, Layout).
  - `types.ts`: TypeScript definitions.

## Setup Instructions

### Prerequisites
- Node.js (v16+)
- npm or yarn

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the backend server:
   ```bash
   npm run dev
   ```
   The server will start on port 3001.

3. Start the frontend:
   If using a bundler like Vite (recommended for production):
   ```bash
   npm run build
   # Serve the 'dist' folder
   ```
   *Note: In the current development environment, the frontend is served via the `index.html` entry point.*

### Usage

1. **Host**: Click "HOST A ROOM". Give it a name. Click "INITIATE UPLINK". Select the browser tab you want to stream audio from (ensure "Share tab audio" is checked).
2. **Listener**: Click on an active room in the lobby. The audio will auto-connect (you may need to interact with the page if autoplay is blocked).

## Deployment

### Backend (Railway / Render)
1. Push code to a repository.
2. Link repository to Railway/Render.
3. Set Build Command: `npm install`
4. Set Start Command: `node server.js`
5. Environment Variables:
   - `PORT`: (Automatically set by platform)

### Frontend (Vercel / Netlify)
1. Ensure `App.tsx` points to your deployed backend URL.
2. Deploy the static files.

## Tech Stack

- **Frontend**: React 18, Tailwind CSS
- **Backend**: Node.js, Express, Socket.io
- **Protocol**: WebRTC, WebSocket

---
*STERILIZATION IS A WEAPON OF THE RULERS • FREEDOM IS A LUXURY NOT A RIGHT*
