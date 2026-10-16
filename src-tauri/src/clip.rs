use std::io::Cursor;

use windows::Win32::Foundation::{HANDLE, HGLOBAL};
use windows::Win32::Graphics::Gdi::{BI_RGB, BITMAPINFOHEADER};
use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, RegisterClipboardFormatW, SetClipboardData};
use windows::Win32::System::Memory::{GMEM_MOVEABLE, GlobalAlloc, GlobalLock, GlobalUnlock};
use windows::Win32::System::Ole::{CF_DIB, CF_HDROP};
use windows::Win32::UI::Shell::DROPFILES;
use windows::core::w;

fn global(bytes: &[u8]) -> Result<HGLOBAL, String> {
    unsafe {
        let h = GlobalAlloc(GMEM_MOVEABLE, bytes.len()).map_err(|e| e.to_string())?;
        let p = GlobalLock(h) as *mut u8;
        if p.is_null() {
            return Err("GlobalLock".into());
        }
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), p, bytes.len());
        let _ = GlobalUnlock(h);
        Ok(h)
    }
}

fn hdrop(paths: &[String]) -> Vec<u8> {
    let header = DROPFILES { pFiles: std::mem::size_of::<DROPFILES>() as u32, fWide: true.into(), ..Default::default() };
    let mut out = unsafe { std::slice::from_raw_parts(&header as *const _ as *const u8, std::mem::size_of::<DROPFILES>()).to_vec() };
    for p in paths {
        for u in p.encode_utf16().chain([0u16]) {
            out.extend_from_slice(&u.to_le_bytes());
        }
    }
    out.extend_from_slice(&0u16.to_le_bytes());
    out
}

fn dib(img: &image::RgbaImage) -> Vec<u8> {
    let (w, h) = img.dimensions();
    let header = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: w as i32,
        biHeight: h as i32,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        biSizeImage: w * h * 4,
        ..Default::default()
    };
    let mut out = unsafe { std::slice::from_raw_parts(&header as *const _ as *const u8, std::mem::size_of::<BITMAPINFOHEADER>()).to_vec() };
    out.reserve((w * h * 4) as usize);
    for y in (0..h).rev() {
        for x in 0..w {
            let p = img.get_pixel(x, y).0;
            out.extend_from_slice(&[p[2], p[1], p[0], p[3]]);
        }
    }
    out
}

pub fn set_image_files(paths: &[String]) -> Result<(), String> {
    let natives: Vec<String> = paths.iter().map(|p| p.replace('/', "\\")).collect();
    let native = natives.first().ok_or("no image")?.clone();
    let png = std::fs::read(&native).map_err(|e| e.to_string())?;
    let img = image::load(Cursor::new(&png), image::ImageFormat::Png).map_err(|e| e.to_string())?.to_rgba8();
    let drop = hdrop(&natives);
    let dib = dib(&img);
    unsafe {
        let mut opened = false;
        for _ in 0..10 {
            if OpenClipboard(None).is_ok() {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(30));
        }
        if !opened {
            return Err("clipboard_busy".into());
        }
        let result = (|| {
            EmptyClipboard().map_err(|e| e.to_string())?;
            let png_format = RegisterClipboardFormatW(w!("PNG"));
            SetClipboardData(png_format, Some(HANDLE(global(&png)?.0))).map_err(|e| e.to_string())?;
            SetClipboardData(CF_DIB.0 as u32, Some(HANDLE(global(&dib)?.0))).map_err(|e| e.to_string())?;
            SetClipboardData(CF_HDROP.0 as u32, Some(HANDLE(global(&drop)?.0))).map_err(|e| e.to_string())?;
            Ok::<(), String>(())
        })();
        let _ = CloseClipboard();
        result
    }
}
