// Run Tauri with an explicit SDK and verify binaries before tauri-action can upload.
import {spawnSync,execFileSync} from 'node:child_process';
import {readdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('..',import.meta.url));
const frontend=resolve(repo,".");
const native=resolve(repo,"src_tauri");
const gate=resolve(repo,'scripts/macos_sdk_gate.mjs');
const env={...process.env};
const cliArgs=process.argv.slice(2);
const cargoSeparator=cliArgs.indexOf("--");
const tauriArgs=cliArgs.slice(0,cargoSeparator<0?cliArgs.length:cargoSeparator);
const inspectionOnly=tauriArgs.some(a=>["--help","-h","--version","-V"].includes(a));
if(process.platform==='darwin' && !inspectionOnly) {
 execFileSync(process.execPath,[gate],{env,stdio:'inherit'});
 env.SDKROOT=execFileSync('xcrun',['--sdk','macosx','--show-sdk-path'],{env,encoding:'utf8'}).trim();
}
const cli=resolve(frontend,'node_modules/@tauri-apps/cli/tauri.js');
const result=spawnSync(process.execPath,[cli,...process.argv.slice(2)],{cwd:frontend,env,stdio:'inherit'});
if(result.error) throw result.error;
if(result.status!==0) process.exit(result.status??1);
if(process.platform==='darwin' && process.argv[2]==='build' && !inspectionOnly) {
 const t=process.argv.indexOf('--target');
 const target=t>=0?process.argv[t+1]:(process.argv.find(a=>a.startsWith('--target='))?.slice(9)??null);
 if(target && !target.includes('apple-darwin')) process.exit(0);
 const directory=env.CARGO_TARGET_DIR?resolve(frontend,env.CARGO_TARGET_DIR):join(native,'target');
 const binary=join(directory,...(target?[target]:[]),process.argv.includes('--debug')?'debug':'release',"vxsearch");
 execFileSync(process.execPath,[gate,'--artifact',binary],{env,stdio:'inherit'});
}
