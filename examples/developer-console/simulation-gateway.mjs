/** Explicit backend simulation lifecycle, separate from input leases and renderers. */
export function createSimulationGateway(settings, upstream) {
  let ownedId = null, starting = false, outcomeUnknown = false;
  const path = `/api/v1/environments/${encodeURIComponent(settings.environmentUuid || '')}/simulations`;
  const allowed = settings.mode === 'connected' && settings.allowSimulationLaunch === true;
  const fail = (detail, status = 409) => Object.assign(new Error(detail), { status });
  const list = async () => settings.mode === 'connected' ? (await upstream(path)).json() : { active_simulations: [] };
  return {
    async handle(req, url, send) {
      if (!url.pathname.startsWith('/api/simulation/')) return false;
      if (url.pathname === '/api/simulation/status' && req.method === 'GET') {
        const result = await list();
        send(200, { launchEnabled: allowed, ownedId, outcomeUnknown, active: (result.active_simulations || []).map(row => ({
          simulationId: row.simulation_id, status: row.status, ready: row.simulation_ready === true,
        })) }); return true;
      }
      if (req.method === 'POST' && url.pathname === '/api/simulation/start') {
        if (!allowed) throw fail('Enable simulation launch on the server for a dedicated local test environment.');
        if (outcomeUnknown) throw fail('Start outcome is unknown. Inspect Cyberwave before another request.');
        if (starting || ownedId) throw fail('This example already owns a simulation request.');
        starting = true;
        try {
          if ((await list()).active_simulations?.length) throw fail('An existing simulation is active. This example will not replace it.');
          // Fixed CPU settings and finite lifetime; never accept arbitrary runtime/model/controller fields.
          let result;
          try { result = await (await upstream(path, 'POST', { backend: 'mujoco', duration: 30, stream_data: false,
            auto_run_controllers: false, runtime: { interface: 'basic', physics_device: 'cpu', controller_device: 'cpu', num_envs: 1 } })).json(); }
          catch (error) { if (!error.status || error.status >= 500) outcomeUnknown = true; throw error; }
          const id = result.simulation?.simulation_id;
          if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) { outcomeUnknown = true; throw fail('Simulation outcome is unknown. Inspect Cyberwave; do not retry automatically.'); }
          ownedId = id; send(200, { simulationId: id, status: result.simulation.status || 'requested' }); return true;
        } finally { starting = false; }
      }
      if (req.method === 'POST' && url.pathname === '/api/simulation/stop') {
        if (!ownedId) throw fail('This example does not own a simulation request.');
        // Stop only the returned identity, never a browser-selected workload or all environments.
        const result = await (await upstream(`${path}/${encodeURIComponent(ownedId)}/stop`, 'POST', {})).json();
        ownedId = null; send(200, { status: result.status || 'stop-requested' }); return true;
      }
      send(404, { detail: 'Unknown simulation endpoint.' }); return true;
    },
  };
}
