import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext();
const calls=[],checks=[],errors=[];let pending=null,sequence=0,main=null,failSubmit=false;
const settings={theme:'dark',global_hotkey:'CommandOrControl+Shift+F',close_to_tray:true,auto_select_input:true,debounce_ms:100};
await context.exposeBinding('__fixtureIpc',async ({page},command,args={})=>{
 calls.push({view:page.url().includes('view=quick_search')?'popup':'main',command,args});
 if(command==='get_settings')return{value:{...settings}};
 if(command==='get_pending_search')return{value:pending};
 if(command==='ack_pending_search'){if(pending?.id===args.id)pending=null;return{value:{success:true}};}
 if(command==='submit_quick_search'){
  if(failSubmit)return{error:{code:'E_WINDOW',message:'Không thể mở cửa sổ kết quả.',details:null}};
  await new Promise(r=>setTimeout(r,80));pending={id:++sequence,query:args.query};
  if(main)await main.evaluate(request=>window.__fixtureEmit('quick_search_requested',request),pending);
  return{value:{success:true}};
 }
 if(command==='get_system_status')return{value:{total_roots:0,total_files:0,total_size_bytes:0,db_size_bytes:0,is_any_scanning:false,platform:'macos',app_version:'0.1.0',hotkey_error:null}};
 if(command==='get_watched_roots')return{value:[]};
 if(command==='search_files')return{value:{items:[],total_matched:0,took_ms:1}};
 if(command.startsWith('plugin:window|'))return{value:false};
 return{value:{success:true}};
});
await context.addInitScript(()=>{
 let serial=0;const callbacks=new Map(),listeners=new Map();
 window.__fixtureEmit=(event,payload)=>{for(const l of listeners.values())if(l.event===event)callbacks.get(l.handler)?.({event,payload,id:l.id});};
 window.isTauri=true;window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:location.search.includes('quick_search')?'quick_search':'main'},currentWebview:{label:'main'}},transformCallback(fn){const id=++serial;callbacks.set(id,fn);return id;},unregisterCallback(id){callbacks.delete(id);},async invoke(command,args={}){
  if(command==='plugin:event|listen'){const id=++serial;listeners.set(id,{...args,id});return id;}
  if(command==='plugin:event|unlisten'){listeners.delete(args.eventId);return;}
  const reply=await window.__fixtureIpc(command,args);if(reply.error)throw reply.error;return reply.value;
 }};window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
});
const popup=await context.newPage();popup.on('pageerror',e=>errors.push(e.message));await popup.setViewportSize({width:380,height:64});
async function check(name,fn){await fn();checks.push({name,status:'passed'});console.log('PASS '+name);}
const url=process.env.VXSEARCH_UI_URL||'http://127.0.0.1:1420';
try{
 await popup.goto(url+'/?view=quick_search');
 const input=popup.getByRole('textbox',{name:'Từ khóa tìm kiếm nhanh'}),button=popup.getByRole('button',{name:'Tìm',exact:true});
 await check('compact popup only search controls without full App polling',async()=>{
  await input.waitFor();assert.equal(await popup.locator('input').count(),1);assert.equal(await popup.locator('button').count(),1);assert.equal(await popup.locator('.vx-titlebar').count(),0);
  assert.equal(await popup.evaluate(()=>document.documentElement.scrollWidth<=380&&document.documentElement.scrollHeight<=64),true);
  assert.equal(calls.filter(c=>c.view==='popup'&&['get_system_status','get_watched_roots','search_files'].includes(c.command)).length,0);
 });
 await check('empty and IME Enter never submit',async()=>{
  await input.fill('  ');assert.equal(await button.isDisabled(),true);await input.press('Enter');await input.fill('Báo cáo .pdf');await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,keyCode:229,bubbles:true});assert.equal(calls.filter(c=>c.command==='submit_quick_search').length,0);await input.dispatchEvent('compositionend');
 });
 await check('query persists for cold main and is acknowledged after delivery',async()=>{
  await input.press('Enter');for(let i=0;i<50&&!pending;i++)await new Promise(r=>setTimeout(r,20));assert.equal(pending?.query,'Báo cáo .pdf');
  main=await context.newPage();main.on('pageerror',e=>errors.push(e.message));await main.setViewportSize({width:720,height:540});await main.goto(url);
  await main.waitForFunction(()=>document.querySelector('.vx-search-input')?.value==='Báo cáo .pdf');
  for(let i=0;i<30&&pending;i++)await new Promise(r=>setTimeout(r,20));assert.equal(pending,null);
  assert.equal(await main.locator('.vx-app-badge img').count(),0);assert.equal(await main.locator('.vx-app-badge svg').count(),1);
 });
 await check('ready main receives Unicode and duplicate Enter is blocked',async()=>{
  const before=calls.filter(c=>c.command==='submit_quick_search').length;await input.fill('  ảnh #2026 & final  ');await input.press('Enter');await input.press('Enter');
  await main.waitForFunction(()=>document.querySelector('.vx-search-input')?.value==='  ảnh #2026 & final  ');assert.equal(calls.filter(c=>c.command==='submit_quick_search').length,before+1);
 });
 await check('structured submit error is readable and retry stays available',async()=>{
  await popup.waitForFunction(()=>!document.querySelector('button').disabled);failSubmit=true;await button.click();await popup.getByRole('status').filter({hasText:'Không thể mở cửa sổ kết quả.'}).waitFor();assert.equal(await button.isEnabled(),true);failSubmit=false;
 });
 await check('Escape hides popup without changing main query',async()=>{
  const previous=await main.locator('.vx-search-input').inputValue();await input.press('Escape');await popup.waitForFunction(()=>document.querySelector('[role=status]')?.textContent==='');
  assert.equal(calls.filter(c=>c.command==='hide_quick_search').length,1);assert.equal(await main.locator('.vx-search-input').inputValue(),previous);
 });
 await check('reopen selects query and reloads saved light theme',async()=>{
  settings.theme='light';await popup.evaluate(()=>window.__fixtureEmit('quick_search_focus',null));await popup.waitForFunction(()=>document.documentElement.classList.contains('light'));
  assert.equal(await input.evaluate(i=>document.activeElement===i&&i.selectionStart===0&&i.selectionEnd===i.value.length),true);await popup.screenshot({path:new URL('../docs/qa/quick_search_light.png',import.meta.url).pathname});
 });assert.deepEqual(errors,[]);
}catch(error){checks.push({name:'failure',status:'failed',error:String(error)});await popup.screenshot({path:new URL('../docs/qa/quick_search_failure.png',import.meta.url).pathname});throw error;}
finally{await writeFile(new URL('../docs/qa/popup_test_results.json',import.meta.url),JSON.stringify({evidence_class:'browser_explicit_two_window_IPC_fixture',checks,errors,calls,pending},null,2)+'\n');await browser.close();}
