import {UpdateStatus} from './shared/settings_ui';
import {useAppUpdater,checkForUpdates,installUpdate,restartAfterUpdate,dismissUpdateNotice} from '../services/app_updater';
// Presentation is shared; the existing app controller retains lifecycle/guards/identity.
export function AppUpdates({language='vi',notice=false}:{language?:'vi'|'en';notice?:boolean}) {
 const update=useAppUpdater();
 return <UpdateStatus language={language} notice={notice} update={update} onCheck={()=>checkForUpdates()} onInstall={installUpdate} onRestart={restartAfterUpdate} onDismiss={dismissUpdateNotice}/>;
}
