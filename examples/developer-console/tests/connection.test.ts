import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../server.mjs';
const settings = { mode: 'fixture', apiUrl: 'http://localhost:8000', token: 'local-only-secret', anchor: { longitude: 0, latitude: 0, height: 0, yawDegrees: 0 } };
async function run(upstream, callback) {
  const server = createGateway(settings, upstream); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`; let cookie = '', connectionId = '';
  const request = async (path, method = 'GET', body, origin = 'http://127.0.0.1:5173', extraHeaders = {}) => {
    const result = await fetch(base + path, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-Cyberwave-Connection': connectionId, ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (result.headers.get('set-cookie')) cookie = result.headers.get('set-cookie').split(';')[0];
    if (path === '/gateway/connection' && method === 'POST' && result.ok) connectionId = (await result.clone().json()).connectionId;
    return result;
  };
  try { await callback(request); } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
test('production is read-only and does not inherit the local token', async () => {
  const calls = [];
  await run(async (url, opts) => { calls.push({ url: String(url), opts }); return Response.json([]); }, async request => {
    const connection = await request('/gateway/connection', 'POST', { baseUrl: 'https://api.cyberwave.com' });
    assert.equal((await connection.json()).authenticated, false);
    assert.match(connection.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await request('/gateway/rest/api/v1/assets?limit=12')).status, 200);
    assert.equal((await request('/gateway/rest/api/v1/assets', 'POST', {})).status, 405);
    assert.equal((await request('/gateway/rest/api/v1/twins/robot/navigation')).status, 403);
    assert.equal(calls.length, 1); assert.equal(calls[0].opts.headers.Authorization, undefined);
  });
});
test('another tab reconnecting cannot silently retarget a stale client, including same-origin account changes', async () => {
  const calls = [];
  await run(async (url, opts) => { calls.push(opts); return Response.json([]); }, async request => {
    const first = await (await request('/gateway/connection', 'POST', {baseUrl:'http://localhost:8000'})).json();
    for (const baseUrl of ['https://api.cyberwave.com', 'http://localhost:8000']) {
      await request('/gateway/connection', 'POST', {baseUrl,token:'different-account'});
      const staleHeaders={'X-Cyberwave-Connection':first.connectionId};
      const stale = await request('/gateway/rest/api/v1/assets','GET',undefined,'http://127.0.0.1:5173',staleHeaders);
      assert.equal(stale.status,409);
      assert.match((await stale.json()).detail,/another tab/);
      assert.equal((await request('/gateway/rest/api/v1/workflows/w/execute','POST',{},'http://127.0.0.1:5173',staleHeaders)).status,409);
    }
    assert.equal(calls.length,0);
    assert.equal((await request('/gateway/rest/api/v1/assets')).status,200);
  });
});
test('a malformed asset URL does not fail the whole catalog response',async()=>{
  await run(async()=>Response.json([{urdf_file:'http://[broken',name:'Broken'},{glb_file:'https://storage.example.com/model.glb',name:'Valid'}]),async request=>{
    await request('/gateway/connection','POST',{baseUrl:'https://api.cyberwave.com'});
    const response=await request('/gateway/rest/api/v1/assets');
    assert.equal(response.status,200);
    assert.equal((await response.json()).length,2);
  });
});
test('inspection writes are local, authenticated, bounded to metadata routes',async()=>{
  const calls=[];
  await run(async(url,opts)=>{calls.push({url:String(url),opts});return Response.json({uuid:'campaign'});},async request=>{
    await request('/gateway/connection','POST',{baseUrl:'https://api.cyberwave.com',token:'remote-token'});
    assert.equal((await request('/gateway/rest/api/v1/environments/env/inspection-campaigns','POST',{external_id:'demo'})).status,405);
    await request('/gateway/connection','POST',{baseUrl:'http://localhost:8000'});
    assert.equal((await request('/gateway/rest/api/v1/environments/env/inspection-campaigns','POST',{external_id:'demo'})).status,200);
    assert.equal((await request('/gateway/rest/api/v1/twins/twin/missions/mission/execute','POST',{})).status,405);
    assert.equal((await request('/gateway/rest/api/v1/environments/env/inspection-campaigns','DELETE')).status,405);
    assert.equal(calls.length,1); assert.equal(calls[0].opts.method,'POST'); assert.equal(calls[0].opts.headers.Authorization,'Bearer local-only-secret');
    assert.deepEqual(JSON.parse(calls[0].opts.body),{external_id:'demo'});
  });
});
test('reconnect invalidates the previous session and disconnect revokes it', async () => {
  const auth = [];
  await run(async (url, opts) => { auth.push(opts.headers.Authorization); return Response.json([]); }, async request => {
    await request('/gateway/connection', 'POST', { baseUrl: 'http://localhost:8000' });
    await request('/gateway/rest/api/v1/environments');
    await request('/gateway/connection', 'POST', { baseUrl: 'https://custom.example.com', token: 'custom-secret' });
    await request('/gateway/rest/api/v1/environments');
    await request('/gateway/connection', 'DELETE');
    assert.equal((await request('/gateway/rest/api/v1/environments')).status, 401);
    assert.deepEqual(auth, ['Bearer local-only-secret', 'Bearer custom-secret']);
  });
});
test('only discovered model resources can load and storage receives no API token', async () => {
  const calls = [];
  await run(async (url, opts) => {
    calls.push({ url: String(url), opts });
    return String(url).includes('/api/v1/assets') ? Response.json([{ urdf_file: 'https://static.cyberwave.com/media/urdf_projects/robot/urdf/robot.urdf' }]) : new Response('mesh');
  }, async request => {
    await request('/gateway/connection', 'POST', { baseUrl: 'https://api.cyberwave.com', token: 'production-test-token' });
    assert.equal((await request('/gateway/media?url=https%3A%2F%2Funrelated.example.com%2Ffile')).status, 403);
    await request('/gateway/rest/api/v1/assets');
    const model = 'https://static.cyberwave.com/media/urdf_projects/robot/dae/base.dae';
    const result = await request('/gateway/media?url=' + encodeURIComponent(model)); assert.equal(await result.text(), 'mesh');
    assert.equal(calls[0].opts.headers.Authorization, 'Bearer production-test-token');
    assert.equal(calls[1].opts.headers, undefined); assert.equal(calls[1].opts.redirect, 'error');
    assert.equal((await request('/gateway/media?url=' + encodeURIComponent('https://static.cyberwave.com/media/urdf_projects/robot/../other/secret'))).status, 403);
  });
});
test('untrusted origins cannot establish, reuse or delete a connection', async () => {
  await run(async () => Response.json([]), async request => {
    assert.equal((await request('/gateway/connection', 'POST', { baseUrl: 'https://api.cyberwave.com' }, 'https://unrelated.example.com')).status, 403);
    await request('/gateway/connection', 'POST', { baseUrl: 'https://api.cyberwave.com' });
    assert.equal((await request('/gateway/connection', 'DELETE', undefined, 'https://unrelated.example.com')).status, 403);
    assert.equal((await request('/gateway/connection')).status, 200);
  });
});
test('recording materialization status survives the read-only gateway', async () => {
  await run(async () => Response.json({detail:'Preparing media',playback_readiness:{}},{status:202}),async request=>{
    await request('/gateway/connection','POST',{baseUrl:'https://api.cyberwave.com'});
    assert.equal((await request('/gateway/rest/api/v1/environments/env/recordings/recording/data')).status,202);
    assert.equal((await request('/gateway/rest/api/v1/twins/twin/missions/mission/execute')).status,403);
  });
});
test('only returned camera URLs are registered; nested unrelated metadata stays denied',async()=>{
  const url='https://storage.example.com/camera.mp4?signature=temporary';
  await run(async()=>Response.json({items:{twin_data:{camera:{camera:{signed_url:url}}}},metadata:{signed_url:'https://unrelated.example.com/private'}}),async request=>{
    await request('/gateway/connection','POST',{baseUrl:'https://api.cyberwave.com'});
    await request('/gateway/rest/api/v1/environments/env/recordings/id/data');
    assert.equal((await request('/gateway/media?url='+encodeURIComponent(url))).status,200);
    assert.equal((await request('/gateway/media?url='+encodeURIComponent('https://unrelated.example.com/private'))).status,403);
  });
});

test('video byte ranges preserve 206 and never forward API credentials',async()=>{
  const resource='https://storage.example.com/movie.mp4';
  await run(async(url,opts)=>{
    if(String(url).includes('/api/v1/'))return Response.json({items:{twin_data:{robot:{camera:{signed_url:resource}}}}});
    assert.deepEqual(opts.headers,{Range:'bytes=0-3'});
    return new Response('test',{status:206,headers:{'Content-Type':'video/mp4','Content-Range':'bytes 0-3/100','Content-Length':'4','Accept-Ranges':'bytes'}});
  },async request=>{
    await request('/gateway/connection','POST',{baseUrl:'https://api.cyberwave.com',token:'api-secret'});
    await request('/gateway/rest/api/v1/environments/env/recordings/active_recording/data');
    const response=await request('/gateway/media?url='+encodeURIComponent(resource),'GET',undefined,'http://127.0.0.1:5173',{Range:'bytes=0-3'});
    assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 0-3/100');assert.equal(await response.text(),'test');
  });
});

test('workflow writes require a local authenticated session and origin; errors remain actionable',async()=>{
 const calls=[];
 await run(async(url,opts)=>{calls.push({url:String(url),opts});return Response.json({detail:'Node changed. Reload.'},{status:409});},async request=>{
  await request('/gateway/connection','POST',{baseUrl:'https://api.cyberwave.com',token:'remote'});
  assert.equal((await request('/gateway/rest/api/v1/workflows/w/activate','POST')).status,405);
  await request('/gateway/connection','POST',{baseUrl:'http://localhost:8000'});
  assert.equal((await request('/gateway/rest/api/v1/workflows/w/nodes/n','PUT',{},'')).status,403);
  const result=await request('/gateway/rest/api/v1/workflows/w/nodes/n','PUT',{expected_updated_at:'r1'});
  assert.equal(result.status,409);assert.equal((await result.json()).detail,'Node changed. Reload.');
  assert.equal((await request('/gateway/rest/api/v1/workflows/w/clone','PUT',{})).status,405);
  assert.equal((await request('/gateway/rest/api/v1/workflows/w','POST',{})).status,405);
  await request('/gateway/rest/api/v1/workflows/w/execute','POST',{});
  await request('/gateway/rest/api/v1/workflows/executions/run/cancel','POST');
  await request('/gateway/rest/api/v1/workflows/w/executions/run');
  assert.equal(calls.length,4);
 });
});

test('human responses and dataset reviews keep local write restrictions and scope media to returned samples', async () => {
  const calls = [];
  await run(async (url, options) => {calls.push({url:String(url),options});return Response.json({items:[{source_sha256:'a'.repeat(64),file_url:'https://storage.example.com/review.png'}]});}, async request => {
    await request('/gateway/connection','POST',{baseUrl:'https://api.cyberwave.com',token:'remote-token'});
    assert.equal((await request('/gateway/rest/api/v1/workflow-actions/action/respond','POST',{decision:'approved'})).status,405);
    await request('/gateway/connection','POST',{baseUrl:'http://localhost:8000'});
    assert.equal((await request('/gateway/rest/api/v1/workflow-actions/action/respond','POST',{decision:'approved'})).status,200);
    assert.equal((await request('/gateway/rest/api/v1/datasets/d/samples/s/review','POST',{status:'approved',revision:1,annotations:[]})).status,200);
    assert.equal((await request('/gateway/rest/api/v1/datasets/d/samples')).status,200);
    assert.equal((await request('/gateway/media?url='+encodeURIComponent('https://storage.example.com/review.png'))).status,200);
    assert.equal(calls.at(-1).options.headers?.Authorization,undefined);
    assert.equal((await request('/gateway/media?url='+encodeURIComponent('https://storage.example.com/unrelated.png'))).status,403);
  });
});
