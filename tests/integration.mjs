// Integration checks run against a disposable local database, never production.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.TEST_BASE_URL || 'http://localhost:3100';
if (!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Tests require a local test server.');
let cookie='';
async function api(path, method='GET', data, authenticated=true) {
 const res=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(authenticated && cookie ? {Cookie:cookie}: {})},...(data!==undefined ? {body:JSON.stringify(data)}:{})});
 return {status:res.status, body:await res.json(), cookie:res.headers.get('set-cookie')};
}
const email=`qa-${randomUUID()}@example.test`;
let r=await api('/api/auth/register','POST',{email,password:'Validation-password-42',name:'GuideFlow QA'});
assert.equal(r.status,200,JSON.stringify(r.body)); cookie=r.cookie.split(';')[0];
r=await api('/api/guides','POST',{title:'QA: reliable guide',description:'A disposable regression guide',steps:[{instruction:'Open the workspace',notes:'Original note',screenshotDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',clickPosition:{x:0,y:0,viewportWidth:100,viewportHeight:100}},{instruction:'Invite a teammate'}]});
assert.equal(r.status,201,JSON.stringify(r.body)); let guide=r.body.guide;
const guideId=guide.id; const screenshotUrl=guide.steps[0].screenshotUrl; assert.ok(screenshotUrl); assert.equal(guide.steps[0].clickPositionX,0);
r=await api(`/api/guides/${guideId}`,'PATCH',{expectedVersion:guide.version,title:'QA: edited guide',steps:[{id:guide.steps[1].id,instruction:'Invite your team first',notes:'Updated note'},{id:guide.steps[0].id,instruction:'Then open the workspace'}]});
assert.equal(r.status,200,JSON.stringify(r.body)); guide=r.body.guide;
assert.equal(guide.steps[0].instruction,'Invite your team first'); assert.equal(guide.steps[0].notes,'Updated note'); assert.equal(guide.steps[1].index,1); assert.equal(guide.steps[1].screenshotUrl,screenshotUrl); const reloaded=await api(`/api/guides/${guideId}`); assert.equal(reloaded.body.guide.steps[0].notes,'Updated note');
r=await api(`/api/guides/${guideId}`,'PATCH',{expectedVersion:1,title:'stale'}); assert.equal(r.status,409);
r=await api(`/api/guides/${guideId}`,'PATCH',{steps:[{instruction:123}]}); assert.equal(r.status,400);
r=await api(`/api/guides/${guideId}`,'GET',undefined,false); assert.equal(r.status,403);
r=await api(`/api/guides/${guideId}`,'PATCH',{status:'archived'}); assert.equal(r.body.guide.status,'archived');
r=await api(`/api/guides/${guideId}`,'PATCH',{status:'draft'}); assert.equal(r.body.guide.status,'draft');
r=await api(`/api/guides/${guideId}`,'PATCH',{status:'published'}); assert.equal(r.body.guide.status,'published');
r=await api(`/api/guides/${guideId}/share`,'POST',{accessMode:'unlisted'}); assert.equal(r.status,200); const share=r.body.shareLink;
let page=await fetch(`${base}/view/${share.token}`); assert.equal(page.status,200); const html=await page.text(); assert.ok(html.includes('QA: edited guide')); assert.ok(html.includes('Invite your team first')); assert.ok(!html.includes('Application error'));
r=await api(`/api/embed/${share.token}`,'GET',undefined,false); assert.equal(r.status,200);
r=await api(`/api/guides/${guideId}/share`,'POST',{accessMode:'private'}); const privateToken=r.body.shareLink.token;
r=await api(`/api/embed/${privateToken}`,'GET',undefined,false); assert.equal(r.status,404);
r=await api(`/api/guides/${guideId}/share`,'DELETE',{shareLinkId:share.id}); assert.equal(r.status,200);
r=await api(`/api/embed/${share.token}`,'GET',undefined,false); assert.equal(r.status,404);
r=await api('/api/templates','POST',{name:'unauthorized'},false); assert.equal(r.status,401);
r=await api('/api/auth/login','POST',{email,password:'Validation-password-42'},false); assert.equal(r.status,200);
// Keep this isolated guide available for manual reader and dashboard checks.
r=await api(`/api/guides/${guideId}/share`,'POST',{accessMode:'unlisted'});
console.log(JSON.stringify({result:'PASS: registration, login, step edits/reorder, stale-save protection, validation, archive/restore, publish, shared reader, private/revoked links, authorization',guideId,readerUrl:`${base}/view/${r.body.shareLink.token}`,testEmail:email}));
