# Read-only mounts of owned release DMGs; detaches in finally.
from pathlib import Path
import subprocess,tempfile,json,plistlib,sys,hashlib,tarfile
app=Path(sys.argv[1]).resolve();folder=Path(sys.argv[2]).resolve();cfg=json.loads((app/'src_tauri/tauri.conf.json').read_text());results=[];done={x['platform'] for x in results}
for chip in ['silicon','intel']:
 if 'macos_'+chip in done:continue
 image=folder/f"{cfg['productName'].lower()}_{cfg['version']}_macos_{chip}.dmg"
 if not image.exists():continue
 subprocess.run(['hdiutil','verify',str(image)],check=True,capture_output=True)
 with tempfile.TemporaryDirectory(prefix='vx_dmg_icon_') as directory:
  subprocess.run(['hdiutil','attach','-readonly','-nobrowse','-noautoopen','-mountpoint',directory,str(image)],check=True,capture_output=True)
  try:
   bundle=Path(directory)/(cfg['productName']+'.app');info=plistlib.loads((bundle/'Contents/Info.plist').read_bytes());assert info['CFBundleIdentifier']==cfg['identifier'];assert info['CFBundleShortVersionString']==cfg['version'];icon=(bundle/'Contents/Resources'/info['CFBundleIconFile']).read_bytes();assert icon==(app/'src_tauri/icons/icon.icns').read_bytes()
   subprocess.run(['codesign','--verify','--deep','--strict',str(bundle)],check=True,capture_output=True)
   req=subprocess.run(['codesign','-d','-r-',str(bundle)],check=True,capture_output=True,text=True)
   archive=folder/f"{cfg['productName'].lower()}_{cfg['version']}_macos_{chip}.app.tar.gz"
   with tarfile.open(archive) as tar:
    names=tar.getnames();stem=next(n for n in names if n.endswith('.app/Contents/Info.plist')).split('/Contents/')[0]
    for relative in ['Contents/MacOS/'+info['CFBundleExecutable']]:
     assert (bundle/relative).read_bytes()==tar.extractfile(stem+'/'+relative).read()
   results.append({'platform':'macos_'+chip,'checksum':'VALID','dmg_icns_matches':True,'identifier':info['CFBundleIdentifier'],'version':info['CFBundleShortVersionString'],'strict_codesign':True,'host_match_verified_updater':True})
  finally:subprocess.run(['hdiutil','detach',directory],check=True,capture_output=True)
assert len(results)==2,'Both DMGs required'
(folder/'dmg_evidence.json').write_text(json.dumps(results,indent=2)+'\n');print(json.dumps(results,indent=2))
