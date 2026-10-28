import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {verifySignature} from './verify_signature.mjs';
import {validateAssetLayout} from './release_layout.mjs';
const [folder, metadataPath] = process.argv.slice(2);
const config=JSON.parse(readFileSync('src_tauri/tauri.conf.json','utf8'));
const manifest=JSON.parse(readFileSync(join(folder,'latest.json'),'utf8'));
const metadata=JSON.parse(readFileSync(metadataPath,'utf8'));
assert.equal(manifest.version,config.version); assert.equal(metadata.tagName,`v${config.version}`);
validateAssetLayout(config,manifest,metadata.assets);
const checks=[];const unique=new Set();
for(const [platform,entry] of Object.entries(manifest.platforms)){
 const name=decodeURIComponent(new URL(entry.url).pathname.split('/').at(-1));
 assert.equal(entry.url,`https://github.com/linhbv94/VXSearch/releases/download/v${config.version}/${name}`);
 const bytes=readFileSync(join(folder,name));verifySignature(bytes,config.plugins.updater.pubkey,entry.signature);
 if(!unique.has(name)){
  const corrupt=Buffer.from(bytes);corrupt[Math.floor(corrupt.length/2)]^=1;
  assert.throws(()=>verifySignature(corrupt,config.plugins.updater.pubkey,entry.signature));unique.add(name);
 }
 checks.push({platform,name,signature:true,tamper_rejected:true});
}
assert.equal(unique.size,3);
writeFileSync(join(folder,'signature_evidence.json'),JSON.stringify(checks,null,2)+'\n');
console.log('Three unique packages, all manifest aliases and tamper rejection verified.');
