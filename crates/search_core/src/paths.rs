use crate::models::*;
use std::{
    fs,
    path::{Path, PathBuf},
};
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

pub fn normalize(text: &str) -> String {
    text.nfd()
        .filter(|c| !is_combining_mark(*c))
        .flat_map(char::to_lowercase)
        .map(|c| if c == 'đ' { 'd' } else { c })
        .collect()
}
pub(crate) fn path_text(path: &Path) -> Result<String> {
    path.to_str().map(str::to_owned).ok_or_else(|| {
        AppError::new(
            "E_PATH_ENCODING",
            "Đường dẫn không phải Unicode hợp lệ; giữ chỉ mục cũ.",
        )
    })
}
pub(crate) fn canonical_root(path: &str) -> Result<PathBuf> {
    if path.trim().is_empty() || !Path::new(path).is_absolute() {
        return Err(AppError::new(
            "E_INVALID_PATH",
            "Cần đường dẫn thư mục tuyệt đối.",
        ));
    }
    let p = dunce::canonicalize(path).map_err(io_error)?;
    if !fs::metadata(&p).map_err(io_error)?.is_dir() {
        return Err(AppError::new(
            "E_INVALID_PATH",
            "Đường dẫn không phải thư mục.",
        ));
    }
    path_text(&p)?;
    Ok(p)
}
pub(crate) fn io_error(e: std::io::Error) -> AppError {
    AppError::new(
        if e.kind() == std::io::ErrorKind::PermissionDenied {
            "E_ACCESS_DENIED"
        } else {
            "E_PATH_NOT_FOUND"
        },
        e.to_string(),
    )
}
pub(crate) fn identity(path: &Path) -> Result<String> {
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        use std::os::unix::fs::MetadataExt;
        let m = fs::metadata(path).map_err(io_error)?;
        Ok(format!("unix:{}:{}", m.dev(), m.ino()))
    }
    #[cfg(target_os = "macos")]
    {
        use std::os::unix::{ffi::OsStrExt, fs::MetadataExt};
        let metadata = fs::metadata(path).map_err(io_error)?;
        let c_path = std::ffi::CString::new(path.as_os_str().as_bytes())
            .map_err(|_| AppError::new("E_INVALID_PATH", "Đường dẫn chứa NUL."))?;
        #[repr(C)]
        struct VolumeInfo {
            length: u32,
            uuid: [u8; 16],
        }
        let mut attrs: libc::attrlist = unsafe { std::mem::zeroed() };
        attrs.bitmapcount = libc::ATTR_BIT_MAP_COUNT;
        attrs.volattr = libc::ATTR_VOL_INFO | libc::ATTR_VOL_UUID;
        let mut info = VolumeInfo {
            length: 0,
            uuid: [0; 16],
        };
        let result = unsafe {
            libc::getattrlist(
                c_path.as_ptr(),
                &mut attrs as *mut _ as *mut libc::c_void,
                &mut info as *mut _ as *mut libc::c_void,
                std::mem::size_of::<VolumeInfo>(),
                0,
            )
        };
        if result != 0 {
            return Err(io_error(std::io::Error::last_os_error()));
        }
        if info.length < 20 || info.uuid == [0; 16] {
            return Err(AppError::new(
                "E_IDENTITY_UNKNOWN",
                "Không xác định được UUID phân vùng; giữ chỉ mục cũ.",
            ));
        }
        let uuid: String = info.uuid.iter().map(|byte| format!("{byte:02x}")).collect();
        Ok(format!("mac:{uuid}:{}", metadata.ino()))
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::{
            Foundation::{CloseHandle, INVALID_HANDLE_VALUE},
            Storage::FileSystem::{
                CreateFileW, GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION,
                FILE_FLAG_BACKUP_SEMANTICS, FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE,
                FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
            },
        };
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        unsafe {
            let handle = CreateFileW(
                wide.as_ptr(),
                FILE_READ_ATTRIBUTES,
                FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                std::ptr::null(),
                OPEN_EXISTING,
                FILE_FLAG_BACKUP_SEMANTICS,
                std::ptr::null_mut(),
            );
            if handle == INVALID_HANDLE_VALUE {
                return Err(io_error(std::io::Error::last_os_error()));
            }
            let mut info: BY_HANDLE_FILE_INFORMATION = std::mem::zeroed();
            let ok = GetFileInformationByHandle(handle, &mut info);
            CloseHandle(handle);
            if ok == 0 {
                return Err(io_error(std::io::Error::last_os_error()));
            }
            Ok(format!(
                "win:{}:{}:{}",
                info.dwVolumeSerialNumber, info.nFileIndexHigh, info.nFileIndexLow
            ))
        }
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = path;
        Err(AppError::new(
            "E_IDENTITY_UNKNOWN",
            "Nền tảng chưa hỗ trợ định danh thư mục.",
        ))
    }
}
pub(crate) fn ensure_identity(path: &Path, expected: &str) -> Result<()> {
    if identity(path)? != expected {
        return Err(AppError::new(
            "E_IDENTITY_CHANGED",
            "Thư mục hoặc phân vùng đã thay đổi. Chọn Định vị lại để xác nhận.",
        ));
    }
    Ok(())
}
pub(crate) fn removable(path: &Path) -> bool {
    #[cfg(target_os = "macos")]
    {
        path.starts_with("/Volumes")
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        false
    }
}
pub(crate) fn file_type(ext: &str, is_dir: bool) -> &'static str {
    if is_dir {
        return "directory";
    }
    match ext {
        "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "txt" | "md" | "rtf" | "csv"
        | "odt" => "document",
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" | "bmp" | "heic" | "ico" | "tiff"
        | "psd" | "ai" => "image",
        "mp4" | "mkv" | "mov" | "avi" | "wmv" | "webm" | "m4v" | "flv" => "video",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" => "audio",
        "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "c" | "cpp" | "h" | "html" | "css"
        | "json" | "yaml" | "yml" | "toml" | "sql" | "sh" | "swift" => "code",
        "zip" | "tar" | "gz" | "7z" | "rar" | "bz2" | "xz" => "archive",
        _ => "other",
    }
}
