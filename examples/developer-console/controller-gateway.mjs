import { createHash, randomUUID } from 'node:crypto';
import { connectAsync } from 'mqtt';
import { createVelocityPreview, keyboardVelocity, velocityPacket } from './src/simulation.ts';

const localHost = url => ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname);
const failure = (message, status = 409) => Object.assign(new Error(message), { status });
async function readBody(req) {
  let bytes = 0; const chunks = [];
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 4096) throw failure('Input body is too large.', 413); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString());
}

/** Simulation-only controller-input boundary. No live mode or arbitrary topic/body. */
export function createControllerGateway(settings, upstream, requireTwin) {
  let session = null, broker = null, preview = null, received = 0, lastPacket = null, lastMotion = null;
  let transportError = '', lastAuthorization = 0, currentContext = null, authorizing = null, opening = false;
  const mqttEnabled = settings.mode === 'connected' && settings.controllerTransport === 'mqtt';
  if (mqttEnabled && (!localHost(settings.apiUrl) || !localHost(settings.mqttUrl)
      || !['mqtt:', 'mqtts:', 'ws:', 'wss:'].includes(new URL(settings.mqttUrl).protocol)))
    throw new Error('This example permits only a loopback Cyberwave API and MQTT broker.');
  if (settings.mqttPrefix && !/^[a-zA-Z0-9_-]*$/.test(settings.mqttPrefix)) throw new Error('Invalid MQTT environment prefix.');

  async function context() {
    if (settings.mode !== 'connected') return { twinUuid: 'fixture-rover', policyUuid: 'fixture-velocity-policy',
      name: 'Fixture velocity controller', revision: 'fixture-v1', limits: { linear: .5, angular: .8 }, lateral: true,
      transport: 'local-preview', contract: 'locomotion.velocity_command.v1' };
    if (!localHost(settings.apiUrl)) throw failure('Use the local Cyberwave backend for these controller examples.');
    if (!settings.controllerTwinUuid || !settings.controllerUuid) throw failure('Configure the simulation twin and controller UUIDs.');
    const twin = await requireTwin(settings.controllerTwinUuid);
    if (twin.controller_policy_uuid !== settings.controllerUuid) throw failure('Controller is not assigned to the configured twin.');
    const policy = await (await upstream(`/api/v1/controller-policies/${encodeURIComponent(settings.controllerUuid)}`)).json();
    const metadata = policy.metadata || {};
    if (metadata.execution_contract !== 'locomotion.velocity_command.v1'
        || metadata.runtime_kind !== 'simulation' || metadata.physical_enabled !== false)
      throw failure('Choose an explicitly simulation-only locomotion velocity policy.');
    const maxLinear = Math.min(metadata.max_linear_x, metadata.linear_y_supported ? metadata.max_linear_y : metadata.max_linear_x);
    if (![maxLinear, metadata.max_angular_z].every(value => Number.isFinite(value) && value > 0))
      throw failure('Controller must declare finite positive velocity limits.');
    return { twinUuid: twin.uuid, policyUuid: policy.uuid, name: policy.name,
      revision: `${twin.uuid}:${twin.controller_policy_uuid}:${policy.updated_at}`, limits: { linear: Math.min(.5, maxLinear), angular: Math.min(.8, metadata.max_angular_z) },
      lateral: metadata.linear_y_supported === true, transport: mqttEnabled ? 'local-cyberwave-mqtt' : 'local-preview',
      contract: metadata.execution_contract };
  }
  function consume(packet) {
    if (!session || packet.session_id !== session.id) return;
    try { preview.accept(packet, Date.now()); received++; lastPacket = packet;
      if (Math.hypot(packet.data.linear_x, packet.data.linear_y, packet.data.angular_z) > 0) lastMotion = packet;
    } catch { transportError = 'Dropped invalid or stale simulation input.'; }
  }
  function send(velocity, sequence) {
    if (!session) throw failure('Open a controller session first.');
    const packet = { ...velocityPacket(velocity, Date.now()), session_id: session.id, sequence };
    if (mqttEnabled) {
      if (!broker?.connected) throw failure('Broker disconnected. Commands are dropped; reopen the session.');
      broker.publish(session.topic, JSON.stringify(packet), { qos: 0, retain: false });
    } else consume(packet);
    return packet;
  }
  async function close() {
    if (session) { try { send({ linear_x: 0, linear_y: 0, angular_z: 0 }, ++session.sequence); } catch {} }
    session = null; if (broker) { await broker.endAsync(true); broker = null; }
  }
  const watchdog = setInterval(() => {
    if (!session) return;
    if (settings.mode === 'connected' && Date.now() - lastAuthorization >= 1000 && !authorizing) {
      const owned = session;
      authorizing = context().then(checked => {
        if (session !== owned) return;
        if (checked.revision !== currentContext.revision) {
          transportError = 'Controller changed. Reopen after reviewing it.'; return close();
        }
        lastAuthorization = Date.now();
      }).catch(() => {
        if (session === owned) { transportError = 'Authorization check failed; controller session closed.'; return close(); }
      }).finally(() => { authorizing = null; });
    }
    if (Date.now() - session.lastInput > 300 && !session.stopped) {
      session.stopped = true;
      try { send({ linear_x: 0, linear_y: 0, angular_z: 0 }, session.sequence); } catch { transportError = 'Control lost; local preview expired. Reopen the session.'; }
    }
    if (Date.now() > session.expires) void close();
    preview?.tick(Date.now());
  }, 30); watchdog.unref();

  return {
    async handle(req, url, sendResponse) {
      if (!url.pathname.startsWith('/api/controller/')) return false;
      const route = url.pathname.slice('/api/controller/'.length);
      if (route === 'context' && req.method === 'GET') { sendResponse(200, await context()); return true; }
      if (route === 'open' && req.method === 'POST') {
        if (session || opening) throw failure('A controller session already owns this example. Close it before reopening.');
        opening = true;
        try {
        // Resolve the configured target entirely on the server. The browser cannot select a topic or policy.
        currentContext = await context();
        preview = createVelocityPreview(currentContext.limits); received = 0; lastPacket = null; lastMotion = null; transportError = '';
        const id = randomUUID(), topic = `${settings.mqttPrefix || ''}cyberwave/twin/${currentContext.twinUuid}/command`;
        if (mqttEnabled) {
          const password = settings.mqttPassword || settings.token;
          if (!password) throw failure('Server-held MQTT credentials are required.');
          const username = settings.mqttUsername || `cwh_${createHash('sha256').update(password).digest('hex')}`;
          broker = await connectAsync(settings.mqttUrl, { username, password, clientId: `cyberwave-example-${id}`,
            reconnectPeriod: 0, connectTimeout: 3000, clean: true, queueQoSZero: false });
          broker.on('error', () => { transportError = 'MQTT transport failed. Reopen the session.'; });
          broker.on('offline', () => { transportError = 'MQTT offline; input expired without replay.'; });
          broker.on('message', (incoming, bytes) => {
            if (incoming === topic && bytes.length < 4096) { try { consume(JSON.parse(bytes.toString())); } catch {} }
          });
          try { const grants = await broker.subscribeAsync(topic, { qos: 0 });
            if (grants.some(grant => grant.qos === 128)) throw failure('Broker denied controller-topic observation.');
          } catch (error) { await broker.endAsync(true); broker = null; throw error; }
        }
        session = { id, topic, sequence: 0, lastInput: Date.now(), lastSent: 0, stopped: true, expires: Date.now() + 600000 };
        lastAuthorization = Date.now();
        sendResponse(200, { ...currentContext, sessionId: id, expiresAt: session.expires }); return true;
        } finally { opening = false; }
      }
      if (route === 'state' && req.method === 'GET') {
        sendResponse(200, { active: !!session, transport: currentContext?.transport, received, lastPacket, lastMotion,
          preview: preview?.tick(Date.now()), transportError }); return true;
      }
      if (route === 'close' && req.method === 'POST') {
        const body = await readBody(req);
        if (!session || body.sessionId !== session.id) throw failure('Unknown controller session.');
        await close(); sendResponse(200, { closed: true }); return true;
      }
      if (route === 'input' && req.method === 'POST') {
        const body = await readBody(req), now = Date.now();
        if (!session || body.sessionId !== session.id || now > session.expires) throw failure('Session expired.');
        if (!Number.isSafeInteger(body.sequence) || body.sequence <= session.sequence
            || !Number.isFinite(body.sentAt) || now - body.sentAt > 250 || body.sentAt > now + 100)
          throw failure('Stale or out-of-order input is not replayed.', 400);
        let velocity;
        try { velocity = keyboardVelocity(body.keys, currentContext.limits); }
        catch { throw failure('Unknown or invalid keyboard input.', 400); }
        if (!currentContext.lateral) velocity.linear_y = 0;
        if (now - session.lastSent < 40 && Object.values(velocity).some(Boolean)) throw failure('Input rate exceeded.', 429);
        // Refresh authorization off the input path. Never hold an old setpoint while waiting on REST.
        if (settings.mode === 'connected' && now - lastAuthorization > 2000) {
          await close(); throw failure('Authorization is stale. Reopen the controller session.');
        }
        session.sequence = body.sequence; session.lastInput = now; session.lastSent = now;
        session.stopped = !Object.values(velocity).some(Boolean);
        const packet = send(velocity, body.sequence);
        sendResponse(200, { submitted: true, transport: currentContext.transport, packet }); return true;
      }
      sendResponse(404, { detail: 'Unknown controller endpoint.' }); return true;
    },
    async dispose() { clearInterval(watchdog); await close(); },
  };
}
