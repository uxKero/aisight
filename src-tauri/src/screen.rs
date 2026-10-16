use windows::Win32::Graphics::Gdi::{
    BI_RGB, BITMAPINFO, BITMAPINFOHEADER, BitBlt, CAPTUREBLT, CreateCompatibleBitmap, CreateCompatibleDC, DIB_RGB_COLORS, DeleteDC,
    DeleteObject, GetDC, GetDIBits, ReleaseDC, SRCCOPY, SelectObject,
};
use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN};

pub struct Shot {
    pub x: i32,
    pub y: i32,
    pub image: image::RgbaImage,
}

pub fn grab() -> Result<Shot, String> {
    unsafe {
        let x = GetSystemMetrics(SM_XVIRTUALSCREEN);
        let y = GetSystemMetrics(SM_YVIRTUALSCREEN);
        let w = GetSystemMetrics(SM_CXVIRTUALSCREEN);
        let h = GetSystemMetrics(SM_CYVIRTUALSCREEN);
        if w <= 0 || h <= 0 {
            return Err("screen".into());
        }
        let screen = GetDC(None);
        let mem = CreateCompatibleDC(Some(screen));
        let bmp = CreateCompatibleBitmap(screen, w, h);
        let old = SelectObject(mem, bmp.into());
        let ok = BitBlt(mem, 0, 0, w, h, Some(screen), x, y, SRCCOPY | CAPTUREBLT).is_ok();
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut buf = vec![0u8; (w * h * 4) as usize];
        let lines = GetDIBits(mem, bmp, 0, h as u32, Some(buf.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
        SelectObject(mem, old);
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(mem);
        ReleaseDC(None, screen);
        if !ok || lines == 0 {
            return Err("screen".into());
        }
        for px in buf.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
        let image = image::RgbaImage::from_raw(w as u32, h as u32, buf).ok_or("screen")?;
        Ok(Shot { x, y, image })
    }
}


#[derive(Clone, serde::Serialize)]
pub struct WinInfo {
    pub hwnd: String,
    pub title: String,
    pub app: String,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
    pub minimized: bool,
}

fn frame_bounds(h: windows::Win32::Foundation::HWND) -> Option<windows::Win32::Foundation::RECT> {
    use windows::Win32::Graphics::Dwm::{DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute};
    let mut r = windows::Win32::Foundation::RECT::default();
    unsafe {
        DwmGetWindowAttribute(h, DWMWA_EXTENDED_FRAME_BOUNDS, &mut r as *mut _ as *mut _, std::mem::size_of_val(&r) as u32).ok()?;
    }
    Some(r)
}

fn cloaked(h: windows::Win32::Foundation::HWND) -> bool {
    use windows::Win32::Graphics::Dwm::{DWMWA_CLOAKED, DwmGetWindowAttribute};
    let mut v: u32 = 0;
    unsafe { DwmGetWindowAttribute(h, DWMWA_CLOAKED, &mut v as *mut _ as *mut _, 4).is_ok() && v != 0 }
}

pub fn windows_on_screen(origin_x: i32, origin_y: i32, own_pid: u32) -> Vec<WinInfo> {
    all_windows(origin_x, origin_y, own_pid).into_iter().filter(|w| !w.minimized).collect()
}

pub fn all_windows(origin_x: i32, origin_y: i32, own_pid: u32) -> Vec<WinInfo> {
    use windows::Win32::UI::WindowsAndMessaging::IsIconic;
    let mut out = vec![];
    for w in crate::win::top_windows() {
        if w.pid == own_pid || cloaked(w.hwnd) {
            continue;
        }
        let minimized = unsafe { IsIconic(w.hwnd).as_bool() };
        let Some(r) = frame_bounds(w.hwnd) else { continue };
        let (width, height) = (r.right - r.left, r.bottom - r.top);
        if !minimized && (width < 40 || height < 40) {
            continue;
        }
        let exe = crate::win::process_path(w.pid).map(|p| crate::win::exe_name(&p)).unwrap_or_default();
        if matches!(exe.to_ascii_lowercase().as_str(), "textinputhost.exe" | "shellexperiencehost.exe" | "searchhost.exe" | "startmenuexperiencehost.exe") {
            continue;
        }
        if exe.eq_ignore_ascii_case("explorer.exe") && w.title == "Program Manager" {
            continue;
        }
        out.push(WinInfo {
            hwnd: crate::win::hwnd_to_handle(w.hwnd),
            title: w.title.clone(),
            app: crate::win::friendly_app(&exe),
            x: r.left - origin_x,
            y: r.top - origin_y,
            w: width,
            h: height,
            minimized,
        });
    }
    out
}

pub fn capture_window(h: windows::Win32::Foundation::HWND) -> Result<image::RgbaImage, String> {
    use windows::Win32::Storage::Xps::{PRINT_WINDOW_FLAGS, PrintWindow};
    use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
    unsafe {
        let mut wr = windows::Win32::Foundation::RECT::default();
        GetWindowRect(h, &mut wr).map_err(|e| e.to_string())?;
        let fr = frame_bounds(h).unwrap_or(wr);
        let (w, hh) = (wr.right - wr.left, wr.bottom - wr.top);
        if w <= 0 || hh <= 0 {
            return Err("window".into());
        }
        let screen = GetDC(None);
        let mem = CreateCompatibleDC(Some(screen));
        let bmp = CreateCompatibleBitmap(screen, w, hh);
        let old = SelectObject(mem, bmp.into());
        let ok = PrintWindow(h, mem, PRINT_WINDOW_FLAGS(2)).as_bool();
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -hh,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut buf = vec![0u8; (w * hh * 4) as usize];
        let lines = GetDIBits(mem, bmp, 0, hh as u32, Some(buf.as_mut_ptr() as *mut _), &mut info, DIB_RGB_COLORS);
        SelectObject(mem, old);
        let _ = DeleteObject(bmp.into());
        let _ = DeleteDC(mem);
        ReleaseDC(None, screen);
        if !ok || lines == 0 {
            return Err("window".into());
        }
        for px in buf.chunks_exact_mut(4) {
            px.swap(0, 2);
            px[3] = 255;
        }
        let full = image::RgbaImage::from_raw(w as u32, hh as u32, buf).ok_or("window")?;
        let cx = (fr.left - wr.left).max(0) as u32;
        let cy = (fr.top - wr.top).max(0) as u32;
        let cw = ((fr.right - fr.left) as u32).min(w as u32 - cx);
        let ch = ((fr.bottom - fr.top) as u32).min(hh as u32 - cy);
        Ok(image::imageops::crop_imm(&full, cx, cy, cw, ch).to_image())
    }
}
