import React from 'react';
import {useAppUpdater, checkForUpdates, installUpdate, restartAfterUpdate, dismissUpdateNotice} from '../services/app_updater';
export const AppUpdates: React.FC<{notice?: boolean}> = ({notice = false}) => {
 const update = useAppUpdater();
 const busy = ['checking','downloading','installing'].includes(update.status);
 if (notice && !update.noticeVisible) return null;
 const messages = {
 idle:'Tự kiểm tra phiên bản mới khi mở ứng dụng.', checking:'Đang kiểm tra cập nhật…',
 current:'Bạn đang dùng phiên bản mới nhất.', available:`Có phiên bản mới v${update.version}.`,
 downloading:`Đang tải cập nhật${update.progress === undefined ? '…' : `: ${update.progress}%`}`,
 installing:'Đang xác minh và cài đặt cập nhật…', installed:'Đã cài cập nhật. Khởi động lại để dùng phiên bản mới.',
 error:'Chưa cập nhật được. Kiểm tra kết nối và thử lại.', disabled:'Cập nhật hoạt động trong bản ứng dụng đã cài.'
 };
 return <section className="vx-card" aria-label="Cập nhật ứng dụng" style={notice ? {position:'fixed',bottom:24,right:16,zIndex:90,width:'min(360px, calc(100vw - 32px))',boxShadow:'0 8px 24px #0005'} : undefined}>
 <div style={{display:'flex',alignItems:'start',justifyContent:'space-between',gap:12}}>
 <p role="status" aria-live="polite" style={{fontSize:12}}>{messages[update.status]}</p>
 {notice && !busy && <button className="vx-btn" aria-label="Để sau" onClick={dismissUpdateNotice}>×</button>}
 </div>
 {update.status==='available' && <p style={{fontSize:11,color:'var(--text-muted)'}}>Ứng dụng sẽ tải, cài và khởi động lại. Chỉ mục và thư mục theo dõi được giữ lại.</p>}
 {update.error && <details style={{fontSize:11,overflowWrap:'anywhere'}}><summary>Chi tiết lỗi</summary>{update.error}</details>}
 {update.status!=='disabled' && <button type="button" className="vx-btn vx-btn-primary" disabled={busy} onClick={()=>void(update.status==='available'?installUpdate():update.status==='installed'?restartAfterUpdate():checkForUpdates())}>
 {busy?'Đang xử lý…':update.status==='available'?'Cập nhật & khởi động lại':update.status==='installed'?'Khởi động lại':'Kiểm tra cập nhật'}
 </button>}
 </section>;
};
