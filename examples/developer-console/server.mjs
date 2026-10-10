/** Local-only BFF. No token or arbitrary upstream proxy is exposed to the browser. */
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { compileNavigation, isPosition, validateDraft } from './src/domain.ts';
import { createConnectionGateway } from './connection-gateway.mjs';
import { createSimulationGateway } from './simulation-gateway.mjs';
import { createControllerGateway } from './controller-gateway.mjs';

const fixture = {
  environmentUuid: 'fixture-environment',
  twins: [{ uuid: 'fixture-rover', name: 'Inspection rover', position: { x: 0, y: 0, z: 0 } }],
  waypoints: [
    { id: 'gate', name: 'Gate', position: { x: -55, y: -35, z: 0 } },
    { id: 'inspection', name: 'Inspection station', position: { x: 45, y: 30, z: 0 } },
    { id: 'return', name: 'Return point', position: { x: -10, y: 70, z: 0 } },
  ],
};

export function createGateway(settings, fetchApi = fetch) {
  const connected = settings.mode === 'connected';
  const allowedTwins = new Set(settings.twinUuids || []);
  const fixtureActions = new Set();
  const upstreamBase = new URL(settings.apiUrl);
  if (!['https:', 'http:'].includes(upstreamBase.protocol) || upstreamBase.username || upstreamBase.password)
    throw new Error('Configure an HTTP(S) API origin without embedded credentials.');
  if (connected && (!settings.token || !settings.environmentUuid))
    throw new Error('Connected mode requires CYBERWAVE_API_TOKEN and CYBERWAVE_ENVIRONMENT_UUID.');
  if (connected && !['localhost', '127.0.0.1', '[::1]'].includes(upstreamBase.hostname))
    throw new Error('These examples require a local Cyberwave API origin.');
  const anchor = settings.anchor;
  if (![anchor.longitude, anchor.latitude, anchor.height, anchor.yawDegrees].every(Number.isFinite)
      || Math.abs(anchor.longitude) > 180 || Math.abs(anchor.latitude) > 90)
    throw new Error('Invalid georeferencing anchor.');

  async function upstream(path, method = 'GET', body) {
    const response = await fetchApi(new URL(path, upstreamBase), {
      method, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${settings.token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw Object.assign(new Error(`Cyberwave rejected the request (${response.status}).`), { status: response.status });
    return response;
  }

  async function requireTwin(uuid) {
    if (allowedTwins.size && !allowedTwins.has(uuid)) throw Object.assign(new Error('Twin is outside the configured allowlist.'), { status: 403 });
    if (!connected) {
      if (!fixture.twins.some(twin => twin.uuid === uuid)) throw Object.assign(new Error('Unknown fixture twin.'), { status: 404 });
      return fixture.twins.find(twin => twin.uuid === uuid);
    }
    const twin = await (await upstream(`/api/v1/twins/${encodeURIComponent(uuid)}`)).json();
    if (twin.environment_uuid !== settings.environmentUuid)
      throw Object.assign(new Error('Twin is outside the configured environment.'), { status: 403 });
    return twin;
  }

  const controller = createControllerGateway(settings, upstream, requireTwin);
  const simulation = createSimulationGateway(settings, upstream);
  const connections = createConnectionGateway({ mqttUrl: settings.mqttUrl, mqttUsername: settings.mqttUsername, mqttPassword: settings.mqttPassword, mqttPrefix: settings.mqttPrefix, localToken: settings.token, localOrigin: upstreamBase.origin }, fetchApi);
  const server = createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
    try {
      const host = req.headers.host;
      if (![ `127.0.0.1:${req.socket.localPort}`, `localhost:${req.socket.localPort}` ].includes(host))
        return send(403, { detail: 'Local host required.' });
      const origin = req.headers.origin;
      if ((origin && origin !== 'http://127.0.0.1:5173') || (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !origin))
        return send(403, { detail: 'Use the local application origin.' });
      const url = new URL(req.url, 'http://127.0.0.1:8787');
      if (await connections(req, res, url, send)) return;
      if (url.search) return send(400, { detail: 'Query parameters are not supported by this adapter.' });
      if (req.method === 'GET' && url.pathname === '/api/snapshot') {
        let twins = fixture.twins, waypoints = fixture.waypoints, unsupportedWaypoints = 0;
        if (connected) {
          const prefix = `/api/v1/environments/${encodeURIComponent(settings.environmentUuid)}`;
          const [rawTwins, rawPoints] = await Promise.all([
            upstream(`${prefix}/twins`).then(r => r.json()), upstream(`${prefix}/waypoints`).then(r => r.json()),
          ]);
          twins = rawTwins.filter(twin => !allowedTwins.size || allowedTwins.has(twin.uuid)).map(twin => ({
            uuid: twin.uuid, name: twin.name,
            position: { x: twin.position_x, y: twin.position_y, z: twin.position_z },
          })).filter(twin => isPosition(twin.position));
          // Link-relative/reference waypoints require the server's pose resolver.
          waypoints = rawPoints.filter(point => (!point.frame || point.frame.type === 'environment') && isPosition(point.position))
            .map(point => ({ id: point.id, name: point.name, position: point.position }));
          unsupportedWaypoints = rawPoints.length - waypoints.length;
        }
        return send(200, { mode: connected ? 'connected' : 'fixture', environmentUuid: connected ? settings.environmentUuid : fixture.environmentUuid,
          anchor, executionEnabled: !connected || (settings.allowExecution && settings.georefVerified), twins, waypoints, unsupportedWaypoints });
      }
      if (await simulation.handle(req, url, send)) return;
      if (await controller.handle(req, url, send)) return;
      const route = url.pathname.match(/^\/api\/twins\/([a-zA-Z0-9_-]+)\/(execute|frame|actions\/([a-zA-Z0-9_-]+)(\/cancel)?)$/);
      if (!route) return send(404, { detail: 'Unknown adapter endpoint.' });
      const [, twinUuid, operation, actionId, cancel] = route;
      await requireTwin(twinUuid);
      if (operation === 'execute' && req.method === 'POST') {
        if (connected && !(settings.allowExecution && settings.georefVerified))
          return send(403, { detail: 'Connected execution requires execution enabled and a verified georeference.' });
        let size = 0, chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 65536) return send(413, { detail: 'Draft is too large.' });
          chunks.push(chunk);
        }
        const { draft } = JSON.parse(Buffer.concat(chunks).toString());
        const errors = validateDraft(draft);
        if (errors.length) return send(400, { detail: errors.join(' ') });
        const payload = compileNavigation(draft, connected ? settings.environmentUuid : fixture.environmentUuid);
        if (!connected) {
          const id = crypto.randomUUID(); fixtureActions.add(id);
          return send(200, { action_id: id, status: 'fixture_preview_completed', message: 'Fixture preview only. No physical command was sent.' });
        }
        return send(200, await (await upstream(`/api/v1/twins/${twinUuid}/navigation`, 'POST', payload)).json());
      }
      if (operation === 'frame' && req.method === 'GET') {
        if (!connected) return send(404, { detail: 'Fixture mode has no camera producer.' });
        const response = await upstream(`/api/v1/twins/${twinUuid}/latest-frame`);
        const contentType = response.headers.get('content-type') || '';
        if (!/^image\/(jpeg|png|webp)(;|$)/i.test(contentType)) return send(502, { detail: 'Camera did not return a supported image.' });
        res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
        res.end(Buffer.from(await response.arrayBuffer())); return;
      }
      if (actionId && ((!cancel && req.method === 'GET') || (cancel && req.method === 'POST'))) {
        if (!connected) {
          if (!fixtureActions.has(actionId)) return send(404, { detail: 'Unknown fixture action.' });
          return send(200, { action_id: actionId, status: 'fixture_preview_completed' });
        }
        if (cancel && !settings.allowExecution) return send(403, { detail: 'Connected commands are disabled.' });
        return send(200, await (await upstream(`/api/v1/twins/${twinUuid}/actions/${actionId}${cancel ? '/cancel' : ''}`,
          cancel ? 'POST' : 'GET', cancel ? {} : undefined)).json());
      }
      send(405, { detail: 'Unsupported method.' });
    } catch (error) {
      send(error instanceof SyntaxError ? 400 : error.status || 502,
        { detail: error instanceof SyntaxError ? 'Invalid JSON body.' : error.message });
    }
  });
  server.on('close', () => void controller.dispose());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.env.DEMO_MODE || 'fixture';
  if (!['fixture', 'connected'].includes(mode)) throw new Error('DEMO_MODE must be fixture or connected.');
  const number = (name, fallback) => Number(process.env[name] || fallback);
  const server = createGateway({ mode, apiUrl: process.env.CYBERWAVE_API_URL || 'http://localhost:8000',
    token: process.env.CYBERWAVE_API_TOKEN, environmentUuid: process.env.CYBERWAVE_ENVIRONMENT_UUID,
    twinUuids: (process.env.CYBERWAVE_TWIN_UUIDS || '').split(',').map(x => x.trim()).filter(Boolean),
    allowExecution: process.env.CYBERWAVE_ALLOW_EXECUTION === 'true', georefVerified: process.env.DEMO_GEOREF_VERIFIED === 'true',
    controllerTwinUuid: process.env.CYBERWAVE_CONTROLLER_TWIN_UUID, controllerUuid: process.env.CYBERWAVE_CONTROLLER_UUID,
    allowSimulationLaunch: process.env.DEMO_ALLOW_SIMULATION_LAUNCH === 'true',
    controllerTransport: process.env.DEMO_CONTROLLER_TRANSPORT || 'preview', mqttUrl: process.env.DEMO_MQTT_URL || 'mqtt://127.0.0.1:1883',
    mqttUsername: process.env.DEMO_MQTT_USERNAME, mqttPassword: process.env.DEMO_MQTT_PASSWORD,
    mqttPrefix: process.env.DEMO_MQTT_ENVIRONMENT_PREFIX || 'local',
    anchor: { longitude: number('DEMO_LONGITUDE', 12.4964), latitude: number('DEMO_LATITUDE', 41.9028),
      height: number('DEMO_ELLIPSOID_HEIGHT', 0), yawDegrees: number('DEMO_YAW_DEGREES', 0) },
  });
  server.listen(8787, '127.0.0.1', () => console.log(`Cyberwave adapter: http://127.0.0.1:8787 (${mode})`));
}
