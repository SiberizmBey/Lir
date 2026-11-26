import crypto from 'node:crypto';
import dgram from 'node:dgram';
import type http from 'node:http';
import os from 'node:os';
import type { Express, Request, Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';

export interface RemoteSoundSummary {
  id: string;
  title: string;
  category: string;
  hotkey: string;
  duration: number;
  volume: number;
  isFavorite: boolean;
  loop: boolean;
  addedAt: number;
}

export interface RemotePlaybackTrack {
  soundId: string;
  startedAt: number;
  duration: number;
  loop: boolean;
}

export interface RemoteVoicePresetInfo {
  id: string;
  name: string;
  badge: string;
}

export interface RemoteStateSnapshot {
  sounds: RemoteSoundSummary[];
  activePlaying: RemotePlaybackTrack[];
  routing: {
    masterVolume: number;
    playbackMode: 'overlap' | 'cutoff';
    primaryDeviceLabel: string;
    dualOutputEnabled: boolean;
  };
  voiceChanger: {
    enabled: boolean;
    preset: string;
    presets: RemoteVoicePresetInfo[];
  };
  updatedAt: number;
}

export interface RemoteHubConfig {
  enabled: boolean;
  deviceName: string;
  requirePin: boolean;
  pin: string;
}

interface PairedClientToken {
  token: string;
  clientName: string;
  pairedAt: number;
}

interface ConnectedAndroidClient {
  id: string;
  name: string;
  ip: string;
  connectedAt: number;
  socket: WebSocket;
}

const UDP_DISCOVERY_PORT = 41234;
const MDNS_MULTICAST_ADDR = '224.0.0.251';
const MDNS_PORT = 5353;
const MDNS_SERVICE_TYPE = '_lir._tcp.local';

function generateSixDigitPin(): string {
  return String(crypto.randomInt(100000, 999999));
}

export function getLocalLanIPv4Addresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const ifaceList of Object.values(interfaces)) {
    if (!ifaceList) continue;
    for (const iface of ifaceList) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address) {
        addresses.push(iface.address);
      }
    }
  }
  return Array.from(new Set(addresses));
}

function encodeDnsName(name: string): Buffer {
  const labels = name.replace(/\.$/, '').split('.').filter(Boolean);
  const parts: Buffer[] = [];
  for (const label of labels) {
    const buf = Buffer.from(label, 'utf8');
    parts.push(Buffer.from([buf.length]), buf);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

function parseDnsQuestionName(msg: Buffer, offset: number): { name: string; nextOffset: number } | null {
  const labels: string[] = [];
  let pos = offset;
  let jumped = false;
  let returnOffset = offset;

  for (let steps = 0; steps < 64; steps++) {
    if (pos >= msg.length) return null;
    const len = msg[pos];
    if (len === 0) {
      if (!jumped) returnOffset = pos + 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      if (pos + 1 >= msg.length) return null;
      const ptr = ((len & 0x3f) << 8) | msg[pos + 1];
      if (!jumped) returnOffset = pos + 2;
      pos = ptr;
      jumped = true;
      continue;
    }
    pos += 1;
    if (pos + len > msg.length) return null;
    labels.push(msg.subarray(pos, pos + len).toString('utf8'));
    pos += len;
  }

  return { name: labels.join('.').toLowerCase(), nextOffset: returnOffset };
}

function buildMdnsResponsePacket(
  instanceName: string,
  hostTarget: string,
  ipAddress: string,
  port: number,
  txtPairs: string[],
): Buffer {
  const safeInstance = `${instanceName.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32)}.${MDNS_SERVICE_TYPE}`;
  const serviceTypeBuf = encodeDnsName(MDNS_SERVICE_TYPE);
  const instanceBuf = encodeDnsName(safeInstance);
  const hostBuf = encodeDnsName(hostTarget);

  // Header: ID=0, Flags=0x8400 (Standard response, authoritative), QD=0, AN=4, NS=0, AR=0
  const header = Buffer.alloc(12);
  header.writeUInt16BE(0, 0);
  header.writeUInt16BE(0x8400, 2);
  header.writeUInt16BE(0, 4);
  header.writeUInt16BE(4, 6);

  const makeRecord = (nameBuf: Buffer, type: number, ttl: number, rdata: Buffer) => {
    const meta = Buffer.alloc(10);
    meta.writeUInt16BE(type, 0);
    meta.writeUInt16BE(0x0001, 2); // Class IN
    meta.writeUInt32BE(ttl, 4);
    meta.writeUInt16BE(rdata.length, 8);
    return Buffer.concat([nameBuf, meta, rdata]);
  };

  // 1. PTR _lir._tcp.local -> <instance>._lir._tcp.local
  const ptrRecord = makeRecord(serviceTypeBuf, 12, 120, instanceBuf);

  // 2. SRV <instance>._lir._tcp.local -> port + hostTarget
  const srvHead = Buffer.alloc(6);
  srvHead.writeUInt16BE(0, 0); // priority
  srvHead.writeUInt16BE(0, 2); // weight
  srvHead.writeUInt16BE(port, 4);
  const srvRecord = makeRecord(instanceBuf, 33, 120, Buffer.concat([srvHead, hostBuf]));

  // 3. TXT <instance>._lir._tcp.local
  const txtBuffers = txtPairs.map((entry) => {
    const b = Buffer.from(entry, 'utf8');
    return Buffer.concat([Buffer.from([Math.min(255, b.length)]), b.subarray(0, 255)]);
  });
  const txtRecord = makeRecord(instanceBuf, 16, 120, Buffer.concat(txtBuffers));

  // 4. A <hostTarget> -> IPv4
  const ipParts = ipAddress.split('.').map((n) => Math.max(0, Math.min(255, parseInt(n, 10) || 0)));
  const aRdata = Buffer.from(ipParts.length === 4 ? ipParts : [127, 0, 0, 1]);
  const aRecord = makeRecord(hostBuf, 1, 120, aRdata);

  return Buffer.concat([header, ptrRecord, srvRecord, txtRecord, aRecord]);
}

export class RemoteHub {
  private readonly deviceId: string;
  private port: number = 3000;
  private config: RemoteHubConfig = {
    enabled: true,
    deviceName: os.hostname() || 'Lir Desktop',
    requirePin: true,
    pin: generateSixDigitPin(),
  };

  private state: RemoteStateSnapshot = {
    sounds: [],
    activePlaying: [],
    routing: {
      masterVolume: 0.85,
      playbackMode: 'cutoff',
      primaryDeviceLabel: 'Varsayılan Sistem Çıkışı',
      dualOutputEnabled: false,
    },
    voiceChanger: {
      enabled: false,
      preset: 'natural',
      presets: [],
    },
    updatedAt: Date.now(),
  };

  private hostSockets = new Set<WebSocket>();
  private clientMap = new Map<string, ConnectedAndroidClient>();
  private pairedTokens = new Map<string, PairedClientToken>();
  private wss: WebSocketServer | null = null;
  private udpSocket: dgram.Socket | null = null;
  private mdnsSocket: dgram.Socket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor() {
    const hostSeed = `${os.hostname()}-${os.userInfo().username}`;
    this.deviceId = crypto.createHash('sha256').update(hostSeed).digest('hex').slice(0, 16);
  }

  public attach(app: Express, httpServer: http.Server, port: number) {
    this.port = port;
    this.registerRoutes(app);
    this.setupWebSocketServer(httpServer);
    this.startUdpDiscovery();
    this.startMdnsResponder();
  }

  private getPublicDiscoveryInfo() {
    return {
      protocol: 'lir-remote-v1',
      deviceId: this.deviceId,
      deviceName: this.config.deviceName,
      port: this.port,
      lanIps: getLocalLanIPv4Addresses(),
      wsPath: '/ws/remote',
      mdnsService: `${MDNS_SERVICE_TYPE}.`,
      udpDiscoveryPort: UDP_DISCOVERY_PORT,
      enabled: this.config.enabled,
      authRequired: this.config.requirePin,
      soundCount: this.state.sounds.length,
      activePlayingCount: this.state.activePlaying.length,
      voiceChangerEnabled: this.state.voiceChanger.enabled,
      hostConnected: this.hostSockets.size > 0,
    };
  }

  private getHostStatus() {
    return {
      enabled: this.config.enabled,
      deviceId: this.deviceId,
      deviceName: this.config.deviceName,
      port: this.port,
      lanIps: getLocalLanIPv4Addresses(),
      wsPath: '/ws/remote',
      mdnsService: `${MDNS_SERVICE_TYPE}.`,
      udpDiscoveryPort: UDP_DISCOVERY_PORT,
      requirePin: this.config.requirePin,
      pin: this.config.pin,
      connectedClients: Array.from(this.clientMap.values()).map((c) => ({
        id: c.id,
        name: c.name,
        ip: c.ip,
        connectedAt: c.connectedAt,
      })),
      hostConnected: this.hostSockets.size > 0,
    };
  }

  private isAuthorizedToken(token?: string | null): boolean {
    if (!this.config.requirePin) return true;
    if (!token) return false;
    return this.pairedTokens.has(token.trim());
  }

  private extractRequestToken(req: Request): string {
    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.slice(7).trim();
    }
    const qToken = req.query.token;
    if (typeof qToken === 'string') return qToken.trim();
    return '';
  }

  private broadcastToClients(payload: unknown) {
    const serialized = JSON.stringify(payload);
    for (const client of this.clientMap.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(serialized);
      }
    }
  }

  private broadcastClientsListToHost() {
    const payload = JSON.stringify({
      type: 'host:clients',
      connectedClients: this.getHostStatus().connectedClients,
    });
    for (const host of this.hostSockets) {
      if (host.readyState === WebSocket.OPEN) {
        host.send(payload);
      }
    }
  }

  private dispatchCommandToHost(command: Record<string, unknown>): boolean {
    if (!this.config.enabled) return false;
    let delivered = false;
    const serialized = JSON.stringify({
      type: 'remote:command',
      ...command,
      issuedAt: Date.now(),
    });
    for (const host of this.hostSockets) {
      if (host.readyState === WebSocket.OPEN) {
        host.send(serialized);
        delivered = true;
      }
    }
    return delivered;
  }

  private registerRoutes(app: Express) {
    // Public LAN discovery metadata
    app.get('/api/remote/info', (_req: Request, res: Response) => {
      res.json(this.getPublicDiscoveryInfo());
    });

    // Host UI status (used by Lir SettingsView)
    app.get('/api/remote/host-status', (_req: Request, res: Response) => {
      res.json(this.getHostStatus());
    });

    // Update remote bridge configuration from host UI
    app.post('/api/remote/host-config', (req: Request, res: Response) => {
      const body = (req.body || {}) as {
        enabled?: boolean;
        deviceName?: string;
        requirePin?: boolean;
        regeneratePin?: boolean;
      };

      if (typeof body.enabled === 'boolean') {
        this.config.enabled = body.enabled;
        if (!this.config.enabled) {
          for (const client of this.clientMap.values()) {
            try {
              client.socket.close(4003, 'Remote control disabled by host');
            } catch {
              // ignore
            }
          }
          this.clientMap.clear();
          this.broadcastClientsListToHost();
        }
      }
      if (typeof body.deviceName === 'string' && body.deviceName.trim()) {
        this.config.deviceName = body.deviceName.trim().slice(0, 48);
      }
      if (typeof body.requirePin === 'boolean') {
        this.config.requirePin = body.requirePin;
      }
      if (body.regeneratePin) {
        this.config.pin = generateSixDigitPin();
        this.pairedTokens.clear();
        for (const client of this.clientMap.values()) {
          try {
            client.socket.close(4001, 'Pairing PIN rotated');
          } catch {
            // ignore
          }
        }
        this.clientMap.clear();
        this.broadcastClientsListToHost();
      }

      res.json(this.getHostStatus());
    });

    // Android pairing endpoint
    app.post('/api/remote/pair', (req: Request, res: Response) => {
      if (!this.config.enabled) {
        return res.status(503).json({ error: 'Uzaktan kontrol ana bilgisayar tarafından kapalı.' });
      }
      const body = (req.body || {}) as { pin?: string; deviceName?: string };
      const submittedPin = typeof body.pin === 'string' ? body.pin.trim() : '';

      if (this.config.requirePin && submittedPin !== this.config.pin) {
        return res.status(401).json({ error: 'Geçersiz eşleştirme PIN kodu.' });
      }

      const token = crypto.randomBytes(24).toString('hex');
      const clientName =
        typeof body.deviceName === 'string' && body.deviceName.trim()
          ? body.deviceName.trim().slice(0, 48)
          : 'Android Cihaz';

      this.pairedTokens.set(token, {
        token,
        clientName,
        pairedAt: Date.now(),
      });

      return res.json({
        token,
        deviceId: this.deviceId,
        deviceName: this.config.deviceName,
        wsPath: '/ws/remote',
        port: this.port,
      });
    });

    // Current soundboard & voice state snapshot
    app.get('/api/remote/state', (req: Request, res: Response) => {
      if (!this.config.enabled) {
        return res.status(503).json({ error: 'Uzaktan kontrol kapalı.' });
      }
      const token = this.extractRequestToken(req);
      if (!this.isAuthorizedToken(token)) {
        return res.status(401).json({ error: 'Yetkilendirme gerekli.' });
      }
      return res.json({
        deviceId: this.deviceId,
        deviceName: this.config.deviceName,
        hostConnected: this.hostSockets.size > 0,
        ...this.state,
      });
    });

    // Generic command endpoint
    app.post('/api/remote/command', (req: Request, res: Response) => {
      if (!this.config.enabled) {
        return res.status(503).json({ error: 'Uzaktan kontrol kapalı.' });
      }
      const token = this.extractRequestToken(req);
      if (!this.isAuthorizedToken(token)) {
        return res.status(401).json({ error: 'Yetkilendirme gerekli.' });
      }
      const command = (req.body || {}) as Record<string, unknown>;
      if (typeof command.action !== 'string') {
        return res.status(400).json({ error: 'Komut action alanı gerekli.' });
      }
      const delivered = this.dispatchCommandToHost(command);
      return res.status(delivered ? 200 : 503).json({
        ok: delivered,
        hostConnected: this.hostSockets.size > 0,
      });
    });

    // REST convenience endpoints for Android Retrofit / OkHttp clients
    app.post('/api/remote/sounds/:id/play', (req: Request, res: Response) => {
      if (!this.config.enabled) return res.status(503).json({ error: 'Uzaktan kontrol kapalı.' });
      if (!this.isAuthorizedToken(this.extractRequestToken(req))) {
        return res.status(401).json({ error: 'Yetkilendirme gerekli.' });
      }
      const delivered = this.dispatchCommandToHost({
        action: 'sound:play',
        soundId: req.params.id,
      });
      return res.status(delivered ? 200 : 503).json({ ok: delivered });
    });

    app.post('/api/remote/sounds/:id/stop', (req: Request, res: Response) => {
      if (!this.config.enabled) return res.status(503).json({ error: 'Uzaktan kontrol kapalı.' });
      if (!this.isAuthorizedToken(this.extractRequestToken(req))) {
        return res.status(401).json({ error: 'Yetkilendirme gerekli.' });
      }
      const delivered = this.dispatchCommandToHost({
        action: 'sound:stop',
        soundId: req.params.id,
      });
      return res.status(delivered ? 200 : 503).json({ ok: delivered });
    });

    app.post('/api/remote/stop-all', (req: Request, res: Response) => {
      if (!this.config.enabled) return res.status(503).json({ error: 'Uzaktan kontrol kapalı.' });
      if (!this.isAuthorizedToken(this.extractRequestToken(req))) {
        return res.status(401).json({ error: 'Yetkilendirme gerekli.' });
      }
      const delivered = this.dispatchCommandToHost({ action: 'sound:stopAll' });
      return res.status(delivered ? 200 : 503).json({ ok: delivered });
    });

    app.post('/api/remote/volume', (req: Request, res: Response) => {
      if (!this.config.enabled) return res.status(503).json({ error: 'Uzaktan kontrol kapalı.' });
      if (!this.isAuthorizedToken(this.extractRequestToken(req))) {
        return res.status(401).json({ error: 'Yetkilendirme gerekli.' });
      }
      const body = (req.body || {}) as { masterVolume?: number; soundId?: string; volume?: number };
      if (typeof body.masterVolume === 'number') {
        const delivered = this.dispatchCommandToHost({
          action: 'master:volume',
          volume: body.masterVolume,
        });
        return res.status(delivered ? 200 : 503).json({ ok: delivered });
      }
      if (typeof body.soundId === 'string' && typeof body.volume === 'number') {
        const delivered = this.dispatchCommandToHost({
          action: 'sound:volume',
          soundId: body.soundId,
          volume: body.volume,
        });
        return res.status(delivered ? 200 : 503).json({ ok: delivered });
      }
      return res.status(400).json({ error: 'Geçersiz ses seviyesi isteği.' });
    });

    app.post('/api/remote/voice', (req: Request, res: Response) => {
      if (!this.config.enabled) return res.status(503).json({ error: 'Uzaktan kontrol kapalı.' });
      if (!this.isAuthorizedToken(this.extractRequestToken(req))) {
        return res.status(401).json({ error: 'Yetkilendirme gerekli.' });
      }
      const body = (req.body || {}) as { presetId?: string; toggle?: boolean };
      const delivered = body.presetId
        ? this.dispatchCommandToHost({ action: 'voice:preset', presetId: body.presetId })
        : this.dispatchCommandToHost({ action: 'voice:toggle' });
      return res.status(delivered ? 200 : 503).json({ ok: delivered });
    });
  }

  private setupWebSocketServer(httpServer: http.Server) {
    this.wss = new WebSocketServer({ noServer: true });

    httpServer.on('upgrade', (request, socket, head) => {
      try {
        const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
        if (url.pathname !== '/ws/remote') {
          return;
        }

        const role = url.searchParams.get('role') || 'client';
        if (role === 'client') {
          if (!this.config.enabled) {
            socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
            socket.destroy();
            return;
          }
          const token = url.searchParams.get('token') || '';
          if (!this.isAuthorizedToken(token)) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
          }
        }

        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.handleWsConnection(ws, request, url);
        });
      } catch {
        socket.destroy();
      }
    });

    this.heartbeatInterval = setInterval(() => {
      const pingPayload = JSON.stringify({ type: 'ping', ts: Date.now() });
      for (const client of this.clientMap.values()) {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.send(pingPayload);
        }
      }
    }, 25000);
    this.heartbeatInterval.unref();
  }

  private handleWsConnection(ws: WebSocket, request: http.IncomingMessage, url: URL) {
    const role = url.searchParams.get('role') || 'client';

    if (role === 'host') {
      this.hostSockets.add(ws);
      ws.send(
        JSON.stringify({
          type: 'host:clients',
          connectedClients: this.getHostStatus().connectedClients,
        }),
      );

      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as {
            type?: string;
            snapshot?: Partial<RemoteStateSnapshot>;
          };
          if (msg.type === 'host:sync' && msg.snapshot) {
            this.state = {
              sounds: Array.isArray(msg.snapshot.sounds) ? msg.snapshot.sounds : this.state.sounds,
              activePlaying: Array.isArray(msg.snapshot.activePlaying)
                ? msg.snapshot.activePlaying
                : this.state.activePlaying,
              routing: msg.snapshot.routing || this.state.routing,
              voiceChanger: msg.snapshot.voiceChanger || this.state.voiceChanger,
              updatedAt: Date.now(),
            };
            this.broadcastToClients({
              type: 'state:update',
              ...this.state,
            });
          }
        } catch {
          // ignore malformed frames
        }
      });

      ws.on('close', () => {
        this.hostSockets.delete(ws);
      });
      return;
    }

    // Android / Remote client connection
    const token = url.searchParams.get('token') || '';
    const pairedMeta = this.pairedTokens.get(token);
    const clientName =
      url.searchParams.get('name')?.trim().slice(0, 48) ||
      pairedMeta?.clientName ||
      'Android Cihaz';
    const clientId = crypto.randomUUID();
    const remoteIp =
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      request.socket.remoteAddress ||
      'LAN';

    this.clientMap.set(clientId, {
      id: clientId,
      name: clientName,
      ip: remoteIp.replace(/^::ffff:/, ''),
      connectedAt: Date.now(),
      socket: ws,
    });
    this.broadcastClientsListToHost();

    ws.send(
      JSON.stringify({
        type: 'state:init',
        deviceId: this.deviceId,
        deviceName: this.config.deviceName,
        hostConnected: this.hostSockets.size > 0,
        ...this.state,
      }),
    );

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        const msgType = typeof msg.type === 'string' ? msg.type : '';
        if (msgType === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }));
          return;
        }
        if (msgType === 'state:request') {
          ws.send(
            JSON.stringify({
              type: 'state:init',
              deviceId: this.deviceId,
              deviceName: this.config.deviceName,
              hostConnected: this.hostSockets.size > 0,
              ...this.state,
            }),
          );
          return;
        }
        const action = typeof msg.action === 'string' ? msg.action : msgType;
        if (action) {
          const delivered = this.dispatchCommandToHost({ ...msg, action });
          ws.send(JSON.stringify({ type: 'command:ack', action, ok: delivered }));
        }
      } catch {
        // ignore invalid payload
      }
    });

    ws.on('close', () => {
      this.clientMap.delete(clientId);
      this.broadcastClientsListToHost();
    });
  }

  private startUdpDiscovery() {
    try {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('error', (err) => {
        console.warn('[Lir Remote] UDP discovery socket inactive:', err.message);
        try {
          sock.close();
        } catch {
          // ignore
        }
        this.udpSocket = null;
      });

      sock.on('message', (msg, rinfo) => {
        if (!this.config.enabled) return;
        const text = msg.toString('utf8').trim();
        if (!text.includes('LIR_DISCOVER')) return;

        const reply = Buffer.from(JSON.stringify(this.getPublicDiscoveryInfo()), 'utf8');
        sock.send(reply, rinfo.port, rinfo.address, () => {});
      });

      sock.bind(UDP_DISCOVERY_PORT, () => {
        try {
          sock.setBroadcast(true);
        } catch {
          // ignore
        }
      });

      this.udpSocket = sock;
    } catch (err) {
      console.warn('[Lir Remote] UDP discovery unavailable:', err);
    }
  }

  private startMdnsResponder() {
    try {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('error', (err) => {
        console.warn('[Lir Remote] mDNS responder inactive:', err.message);
        try {
          sock.close();
        } catch {
          // ignore
        }
        this.mdnsSocket = null;
      });

      sock.on('message', (msg, rinfo) => {
        if (!this.config.enabled || msg.length < 12) return;
        const flags = msg.readUInt16BE(2);
        const isQuery = (flags & 0x8000) === 0;
        if (!isQuery) return;

        const qdCount = msg.readUInt16BE(4);
        let offset = 12;
        let wantsLir = false;

        for (let i = 0; i < qdCount; i++) {
          const parsed = parseDnsQuestionName(msg, offset);
          if (!parsed) break;
          offset = parsed.nextOffset + 4;
          if (
            parsed.name === MDNS_SERVICE_TYPE ||
            parsed.name === '_services._dns-sd._udp.local'
          ) {
            wantsLir = true;
            break;
          }
        }

        if (!wantsLir) return;
        const lanIps = getLocalLanIPv4Addresses();
        const primaryIp = lanIps[0] || '127.0.0.1';
        const hostTarget = `${os.hostname().replace(/[^a-zA-Z0-9-]/g, '-') || 'lir-host'}.local`;
        const packet = buildMdnsResponsePacket(
          this.config.deviceName,
          hostTarget,
          primaryIp,
          this.port,
          [
            `protocol=lir-remote-v1`,
            `deviceId=${this.deviceId}`,
            `name=${this.config.deviceName}`,
            `ws=/ws/remote`,
            `auth=${this.config.requirePin ? '1' : '0'}`,
          ],
        );
        sock.send(packet, MDNS_PORT, MDNS_MULTICAST_ADDR, () => {});
        if (rinfo.port !== MDNS_PORT) {
          sock.send(packet, rinfo.port, rinfo.address, () => {});
        }
      });

      sock.bind(MDNS_PORT, () => {
        try {
          sock.addMembership(MDNS_MULTICAST_ADDR);
          sock.setMulticastTTL(255);
        } catch {
          // ignore in restricted environments
        }
      });

      this.mdnsSocket = sock;
    } catch (err) {
      console.warn('[Lir Remote] mDNS unavailable:', err);
    }
  }

  public dispose() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    try {
      this.udpSocket?.close();
    } catch {
      // ignore
    }
    try {
      this.mdnsSocket?.close();
    } catch {
      // ignore
    }
    try {
      this.wss?.close();
    } catch {
      // ignore
    }
  }
}

export const remoteHub = new RemoteHub();
