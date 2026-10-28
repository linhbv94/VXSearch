# Verify CI packages, SDK/signature/icon/resource seal. Requires macOS and 7-Zip.
import sys,json,tarfile,plistlib,struct,hashlib,tempfile,subprocess,collections,os,shutil
from pathlib import Path
app=Path(sys.argv[1]).resolve();folder=Path(sys.argv[2]).resolve();cfg=json.loads((app/'src_tauri/tauri.conf.json').read_text());version=cfg['version'];product=cfg['productName'];prefix=product.lower();evidence=[];done={x['platform'] for x in evidence}
sha=lambda b:hashlib.sha256(b).hexdigest()
for chip,cpu in [('silicon',0x100000c),('intel',0x1000007)]:
 if 'macos_'+chip in done:continue
 archive=folder/f'{prefix}_{version}_macos_{chip}.app.tar.gz'
 if not archive.exists():continue
 with tarfile.open(archive,'r:gz') as tar:
  names=tar.getnames();plist_name=next(n for n in names if n.endswith('.app/Contents/Info.plist'));bundle=plist_name.split('/Contents/')[0];info=plistlib.loads(tar.extractfile(plist_name).read());assert info['CFBundleIdentifier']==cfg['identifier'];assert info['CFBundleShortVersionString']==version
  icon=tar.extractfile(bundle+'/Contents/Resources/'+info['CFBundleIconFile']).read();assert icon==(app/'src_tauri/icons/icon.icns').read_bytes()
  exe=tar.extractfile(bundle+'/Contents/MacOS/'+info['CFBundleExecutable']).read();assert exe[:4]==b'\xcf\xfa\xed\xfe';assert struct.unpack_from('<I',exe,4)[0]==cpu
  pos=32;sdk=None
  for _ in range(struct.unpack_from('<I',exe,16)[0]):
   command,length=struct.unpack_from('<II',exe,pos)
   if command==0x24:sdk=struct.unpack_from("<I",exe,pos+12)[0]
   if command==0x32:sdk=struct.unpack_from('<I',exe,pos+16)[0]
   pos+=length
  assert sdk==0x1b0000,hex(sdk or 0)
  with tempfile.TemporaryDirectory(prefix='vx_icon_pkg_') as directory:
   root=Path(directory).resolve()
   for member in tar.getmembers():
    dest=root/member.name;assert dest.resolve().is_relative_to(root)
    assert member.isfile() or member.isdir() or member.issym()
    if member.issym():assert not Path(member.linkname).is_absolute() and (dest.parent/member.linkname).resolve().is_relative_to(root)
   tar.extractall(root)
   subprocess.run(['codesign','--verify','--deep','--strict',str(root/bundle)],check=True,capture_output=True)
  evidence.append({'platform':'macos_'+chip,'version':version,'identifier':info['CFBundleIdentifier'],'architecture':hex(cpu),'sdk':'27.0','icns_sha256':sha(icon),'icon_matches':True,'strict_codesign':True,'host_sha256':sha(exe)})
installer=folder/f'{prefix}_{version}_windows_x64_setup.exe'
if installer.exists() and 'windows_x64' not in done:
 seven=os.environ.get('VXSEARCH_7ZIP') or shutil.which('7zz') or shutil.which('7z')
 assert seven,'Install official 7-Zip CLI or set VXSEARCH_7ZIP to its executable'
 with tempfile.TemporaryDirectory(prefix='vx_win_pkg_') as directory:
  root=Path(directory);subprocess.run([seven,'x',str(installer),'-o'+str(root/'nsis'),'-y'],check=True,stdout=subprocess.DEVNULL)
  candidates=[]
  for p in (root/'nsis').rglob('*.exe'):
   b=p.read_bytes()
   if b[:2]!=b'MZ':continue
   pe=struct.unpack_from('<I',b,0x3c)[0]
   if b[pe:pe+4]==b'PE\0\0' and struct.unpack_from('<H',b,pe+4)[0]==0x8664:candidates.append(p)
  assert len(candidates)==1,[str(p) for p in candidates]
  executable=candidates[0];assert version.encode('utf-16le') in executable.read_bytes();subprocess.run([seven,'x',str(executable),'-o'+str(root/'pe'),'-y'],check=True,stdout=subprocess.DEVNULL)
  resources=[p.read_bytes() for p in (root/'pe/.rsrc/ICON').rglob('*') if p.is_file()]
  if cfg['identifier']=='com.vxsearch.desktop':
   manifests=[p.read_bytes() for p in (root/'pe/.rsrc/MANIFEST').rglob('*') if p.is_file()]
   assert any(b'Microsoft.Windows.Common-Controls' in m and b'6.0.0.0' in m for m in manifests)
  ico=(app/'src_tauri/icons/icon.ico').read_bytes();count=struct.unpack_from('<H',ico,4)[0];chunks=[]
  for i in range(count):
   length,offset=struct.unpack_from('<II',ico,6+16*i+8);chunks.append(ico[offset:offset+length])
  assert collections.Counter(map(sha,chunks))==collections.Counter(map(sha,resources))
  evidence.append({'platform':'windows_x64','executable':executable.name,'pe_machine':'AMD64','version_resource_contains':version,'icon_payloads':len(resources),'icon_matches':True,'ico_sha256':sha(ico)})
assert {e['platform'] for e in evidence}=={'macos_silicon','macos_intel','windows_x64'},'All three package checks are required'
(folder/'icon_evidence.json').write_text(json.dumps(evidence,indent=2)+'\n');print(json.dumps(evidence,indent=2))
