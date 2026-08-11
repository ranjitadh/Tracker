// ─────────────────────────────────────────────────────────────
// Active application detection.
//
// Returns ONLY the application name — never document names, window
// titles, URLs or typed content. Best effort: if the OS refuses
// (permission not granted) it returns None and tracking simply
// records no app usage for that interval.
// ─────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
pub fn active_app_name() -> Option<String> {
    use objc2_app_kit::NSWorkspace;

    let workspace = NSWorkspace::sharedWorkspace();
    workspace
        .frontmostApplication()?
        .localizedName()
        .map(|name| name.to_string())
}

#[cfg(target_os = "windows")]
pub fn active_app_name() -> Option<String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd == 0 {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return None;
        }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle == 0 {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(handle, 0, buf.as_mut_ptr(), &mut size);
        CloseHandle(handle);
        if ok == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..size as usize]);
        let exe = std::path::Path::new(&path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| path.clone());
        if exe.is_empty() { None } else { Some(exe) }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn active_app_name() -> Option<String> {
    None
}

// ── tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_option_never_panics() {
        // Must never panic; may legitimately return None in CI.
        let _ = active_app_name();
    }
}
