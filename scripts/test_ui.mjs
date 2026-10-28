// UI contract tests use a deliberate IPC fixture. Native engine evidence is separate.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const {chromium}=await import(process.env.VXSEARCH_PLAYWRIGHT_MODULE ?? 'playwright');
const directory=new URL('../docs/qa/',import.meta.url);
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,channel:process.env.VXSEARCH_BROWSER_CHANNEL || 'chrome'});
const checks=[];
const page=await browser.newPage({viewport:{width:720,height:540},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{
 const callbacks=new Map(),listeners=new Map();let serial=0;
 const item=(id,name,root_id=1)=>({id,root_id,name,path:`/fixture/${root_id===1?'work':'offline'}/${name}`,parent_dir:`/fixture/${root_id===1?'work':'offline'}`,extension:name.split('.').pop(),file_type:name.endsWith('.mp3')?'audio':name.endsWith('.png')?'image':'document',size_bytes:1024+id,modified_at:1793142000000,is_directory:false,is_offline:root_id===2});
 const data=Array.from({length:120},(_,i)=>item(i+1,`document_${String(i+1).padStart(3,'0')}.pdf`));
 data[0]=item(1,'Báo cáo tài chính.pdf');data[1]=item(2,'offline_copy.pdf',2);data[2]=item(3,'soundtrack.mp3');data[3]=item(4,'photo.png');
 const root=(id,path,status='WATCHING_ACTIVE')=>({id,path,alias:null,status,total_files:id===1?119:1,total_size_bytes:123456,is_removable:id===2,last_scan_at:1793142000000,error_message:status==='WATCHING_ACTIVE'?null:'Thư mục không khả dụng.'});
 const qa=window.__qa={calls:[],failSettings:false,failMerge:true,nextPick:'/fixture/parent',platform:'macos',maxRows:120,roots:[root(1,'/fixture/work'),root(2,'/fixture/offline','UNAVAILABLE_OFFLINE')],settings:{global_hotkey:'CommandOrControl+Shift+F',close_to_tray:true,auto_select_input:true,debounce_ms:100,theme:'dark'},emit(event,payload){for(const l of listeners.values())if(l.event===event)callbacks.get(l.handler)?.({event,id:l.id,payload});}};
 window.isTauri=true;window.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main'}},transformCallback(fn){const id=++serial;callbacks.set(id,fn);return id;},unregisterCallback(id){callbacks.delete(id);},async invoke(command,args={}){
  qa.calls.push({command,args});
  if(command==='plugin:event|listen'){const id=++serial;listeners.set(id,{...args,id});return id;}
  if(command==='plugin:event|unlisten'){listeners.delete(args.eventId);return;}
  if(command==='get_system_status')return{total_roots:qa.roots.length,total_files:data.length,total_size_bytes:123456,db_size_bytes:123456,is_any_scanning:false,platform:qa.platform,app_version:'0.1.0',hotkey_error:null};
  if(command==='get_watched_roots')return qa.roots;
  if(command==='get_settings')return {...qa.settings};
  if(command==='search_files'){
   const p=args.params;const query=p.query.trim();
   if(query==='old'||query==='new'){await new Promise(r=>setTimeout(r,query==='old'?700:30));return{items:[item(900,query+'.pdf')],total_matched:1,took_ms:1};}
   if(query==='force-error')throw{code:'E_QUERY',message:'Truy vấn fixture thất bại.',details:null};
   const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase();
   let rows=data.slice(0,qa.maxRows).filter(i=>(p.root_id==null||i.root_id===p.root_id)&&(p.filter_type==='all'||i.file_type===p.filter_type)&&normalize(i.path).includes(normalize(query)));
   return{items:rows.slice(p.offset,p.offset+p.limit),total_matched:rows.length,took_ms:1.25};
  }
  if(command==='update_settings'){if(qa.failSettings)throw{code:'E_HOTKEY_OCCUPIED',message:'Phím tắt fixture bị chiếm.',details:null};qa.settings={...args.settings};return{success:true};}
  if(command==='reset_settings'){qa.settings.theme='dark';return{...qa.settings};}
  if(command==='vacuum_database')return{success:true,db_size_before_bytes:123456,db_size_after_bytes:100000};
  if(command==='pick_folder')return qa.nextPick;
  if(command==='add_watched_root'){if(qa.failMerge)throw{code:'E_PARENT_OF_EXISTING',message:'Gộp các thư mục đã có?',details:{covered_root_ids:[1,2]}};qa.roots.push(root(3,args.path));return{success:true,root_id:3,status:'SCANNING_INITIAL'};}
  if(command==='confirm_merge_roots'){qa.roots=[root(3,args.parentPath)];qa.failMerge=false;return{success:true,new_root_id:3};}
  if(command==='remove_watched_root'){qa.roots=qa.roots.filter(r=>r.id!==args.rootId);return{success:true,removed_files_count:120};}
  if(command.startsWith('plugin:window|'))return false;
  return{success:true};
 }};
 window.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
});
async function check(name,fn){await fn();checks.push({name,status:'passed'});console.log('PASS '+name);}
async function calls(command){return page.evaluate(command=>window.__qa.calls.filter(c=>c.command===command),command);}
try{
 await page.goto(process.env.VXSEARCH_UI_URL || 'http://127.0.0.1:1420');
 const search=page.locator('.vx-search-input');
 await page.locator('.vx-result-row').first().waitFor();
 await check('initial page limited to 50 rows',async()=>assert.equal(await page.locator('.vx-result-row').count(),50));
 await page.screenshot({path:new URL('ui_results_dark.png',directory).pathname});
 await check('offline open/reveal disabled, copy available',async()=>{
  const row=page.locator('.vx-result-row').filter({hasText:'offline_copy.pdf'});
  assert.equal(await row.getByRole('button',{name:'Mở tệp',exact:true}).isDisabled(),true);
  assert.equal(await row.getByRole('button',{name:/Chép đường dẫn|Sao chép đường dẫn/}).isEnabled(),true);
 });
 await check('late old response cannot replace latest query',async()=>{
  await search.fill('old');await page.waitForFunction(()=>window.__qa.calls.some(c=>c.command==='search_files'&&c.args.params.query==='old'));
  await search.fill('new');await page.locator('.vx-result-row').filter({hasText:'new.pdf'}).waitFor();
  await page.waitForTimeout(750);assert.equal(await page.locator('.vx-result-row').first().innerText().then(t=>t.includes('new.pdf')),true);
 });
 await check('audio chip and root filter invoke correct payload',async()=>{
  await search.fill('');await page.getByRole('tab',{name:'Âm thanh',exact:true}).click();
  await page.locator('.vx-result-row').filter({hasText:'soundtrack.mp3'}).waitFor();
  await page.waitForFunction(()=>window.__qa.calls.filter(c=>c.command==='search_files').at(-1)?.args.params.filter_type==='audio'&&document.querySelectorAll('.vx-result-row').length===1);
  const last=(await calls('search_files')).at(-1);assert.equal(last.args.params.filter_type,'audio');
  await page.getByRole('tab',{name:'Tất cả',exact:true}).click();
  await page.locator('select').first().selectOption('2');
  await page.locator('.vx-result-row').filter({hasText:'offline_copy.pdf'}).waitFor();
  assert.equal((await calls('search_files')).at(-1).args.params.root_id,2);
  await page.locator('select').first().selectOption('');
 });
 await check('native search_focus selects input',async()=>{
  await search.fill('focus');await page.evaluate(()=>window.__qa.emit('search_focus',null));
  await page.waitForFunction(()=>{const i=document.querySelector('.vx-search-input');return document.activeElement===i&&i.selectionStart===0&&i.selectionEnd===i.value.length;});
 });
 await check('open_panel settings, failed save rollback, focus trap',async()=>{
  await page.evaluate(()=>window.__qa.emit('open_panel','settings'));
  const dialog=page.getByRole('dialog',{name:'Cài đặt VXSearch'});await dialog.waitFor();
  await page.evaluate(()=>{window.__qa.failSettings=true;});
  await dialog.getByRole('button',{name:/Sáng/}).click();
  await page.getByText('Phím tắt fixture bị chiếm.',{exact:true}).waitFor();
  assert.equal(await page.locator('html').getAttribute('class'),'dark');
  await page.evaluate(()=>{window.__qa.failSettings=false;});
  await dialog.getByRole('button',{name:/Sáng/}).click();await page.waitForFunction(()=>document.documentElement.classList.contains('light'));
  await dialog.getByRole('button',{name:/Ủng hộ tác giả/}).click();
  const qr=dialog.locator('img[src="/support_qr.png"]');await page.waitForFunction(()=>{const i=document.querySelector('img[src="/support_qr.png"]');return i?.complete&&i.naturalWidth>0;});assert.equal(await qr.evaluate(i=>i.complete&&i.naturalWidth>0),true);
  await page.screenshot({path:new URL('ui_support_light.png',directory).pathname});
  await page.keyboard.press('Tab');assert.equal(await dialog.evaluate(d=>d.contains(document.activeElement)),true);
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 });
 await check('button Enter does not trigger file Open',async()=>{
  await search.fill('');await page.locator('.vx-result-row').first().waitFor();
  const before=(await calls('open_file')).length;
  const settings=page.getByRole('button',{name:'Cài đặt VXSearch',exact:true});await settings.focus();await page.keyboard.press('Enter');
  await page.getByRole('dialog',{name:'Cài đặt VXSearch'}).waitFor();assert.equal((await calls('open_file')).length,before);
  await page.keyboard.press('Escape');
 });
 await check('pagination bounded and deleted last page recovers without loading lock',async()=>{
  await search.fill('');await page.waitForFunction(()=>document.querySelectorAll('.vx-result-row').length===50);
  await page.getByRole('button',{name:'Trang sau',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.vx-result-row')?.textContent.includes('document_051.pdf'));
  await page.waitForTimeout(3100);assert.equal(await page.locator('.vx-result-row').first().innerText().then(t=>t.includes('document_051.pdf')),true);
  await page.getByRole('button',{name:'Trang sau',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.vx-result-row').length===20);
  await page.evaluate(()=>{window.__qa.maxRows=60;window.__qa.emit('index_changed',{affected_roots:[1],delta_count:60});});
  await page.waitForFunction(()=>document.querySelectorAll('.vx-result-row').length===10);
  assert.equal(await page.getByRole('button',{name:'Trang trước',exact:true}).isEnabled(),true);
  await page.evaluate(()=>{window.__qa.maxRows=120;});
  await page.getByRole('button',{name:'Trang trước',exact:true}).click();
 });
 await check('query failure clears stale actionable results',async()=>{
  await search.fill('force-error');await page.getByText('Truy vấn fixture thất bại.',{exact:true}).waitFor();
  assert.equal(await page.locator('.vx-result-row').count(),0);await search.fill('');await page.locator('.vx-result-row').first().waitFor();
 });
 await check('IME Enter never opens selected result',async()=>{
  await search.focus();const before=(await calls('open_file')).length;
  await search.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true,bubbles:true});assert.equal((await calls('open_file')).length,before);
 });
 await check('folder merge confirms exact covered root IDs',async()=>{
  await page.evaluate(()=>window.__qa.emit('open_panel','folders'));
  const dialog=page.getByRole('dialog',{name:/Quản lý/});await dialog.waitFor();
  await dialog.getByRole('button',{name:'Thêm thư mục...',exact:true}).click();
  await dialog.getByRole('button',{name:'Đồng ý gộp chỉ mục',exact:true}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),true);
  assert.equal(await dialog.getByRole('button',{name:'Đồng ý gộp chỉ mục',exact:true}).count(),0);
  await dialog.getByRole('button',{name:'Thêm thư mục...',exact:true}).click();
  await dialog.getByRole('button',{name:'Đồng ý gộp chỉ mục',exact:true}).click();
  await page.waitForFunction(()=>window.__qa.calls.some(c=>c.command==='confirm_merge_roots'));
  assert.deepEqual((await calls('confirm_merge_roots')).at(-1).args,{parentPath:'/fixture/parent',coveredRootIds:[1,2]});
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 });
 await check('minimum viewport and no horizontal overflow',async()=>{
  await page.setViewportSize({width:640,height:440});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  assert.equal(await page.locator('.vx-result-row').first().locator('.vx-cell-actions button').last().evaluate(b=>b.getBoundingClientRect().right<=window.innerWidth),true);
  assert.equal(await page.locator('.vx-footer-right').evaluate(f=>[...f.children].every(e=>e.getBoundingClientRect().height<=20)),true);
  await page.screenshot({path:new URL('ui_640.png',directory).pathname});
 });
 await check('Windows composition through platform DTO',async()=>{
  await page.evaluate(()=>{window.__qa.platform='windows';});
  await page.waitForFunction(()=>document.querySelector('.vx-titlebar.is-windows'));
  assert.equal(await page.locator('.vx-app-badge').count(),0);
  assert.equal(await page.getByRole('button',{name:'Thu nhỏ',exact:true}).count(),1);
  await page.screenshot({path:new URL('ui_windows_mock.png',directory).pathname});
  await search.fill('document');await page.getByRole('button',{name:'Tệp',exact:true}).click();
  const before=(await calls('hide_window')).length;await page.keyboard.press('Escape');
  assert.equal(await search.inputValue(),'document');assert.equal((await calls('hide_window')).length,before);
 });
 assert.deepEqual(errors,[]);
}catch(error){checks.push({name:'failure',status:'failed',error:String(error)});await page.screenshot({path:new URL('ui_failure.png',directory).pathname});throw error;}
finally{await writeFile(new URL('ui_test_results.json',directory),JSON.stringify({evidence_class:'browser_with_explicit_IPC_fixture',checks,errors},null,2)+'\n');await browser.close();}
