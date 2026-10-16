use std::sync::mpsc;
use std::time::Duration;

use windows::Foundation::TypedEventHandler;
use windows::Graphics::Capture::{Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Win32::Foundation::{HMODULE, HWND};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_SDK_VERSION,
    D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING, D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::System::WinRT::Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::core::Interface;

pub fn capture(hwnd: HWND) -> Result<image::RgbaImage, String> {
    let raw = hwnd.0 as isize;
    std::thread::spawn(move || capture_inner(HWND(raw as *mut _)))
        .join()
        .map_err(|_| "capture thread".to_string())?
}

fn capture_inner(hwnd: HWND) -> Result<image::RgbaImage, String> {
    let e = |x: windows_core::Error| x.to_string();
    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_MULTITHREADED);
        let interop = windows_core::factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>().map_err(e)?;
        let item: GraphicsCaptureItem = interop.CreateForWindow(hwnd).map_err(e)?;

        let mut device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )
        .map_err(e)?;
        let device = device.ok_or("d3d")?;
        let context = context.ok_or("d3d")?;
        let dxgi: IDXGIDevice = device.cast().map_err(e)?;
        let inspectable = CreateDirect3D11DeviceFromDXGIDevice(&dxgi).map_err(e)?;
        let d3d: IDirect3DDevice = inspectable.cast().map_err(e)?;

        let size = item.Size().map_err(e)?;
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(&d3d, DirectXPixelFormat::B8G8R8A8UIntNormalized, 1, size).map_err(e)?;
        let session = pool.CreateCaptureSession(&item).map_err(e)?;
        let _ = session.SetIsBorderRequired(false);
        let _ = session.SetIsCursorCaptureEnabled(false);

        let (tx, rx) = mpsc::channel::<Direct3D11CaptureFrame>();
        pool.FrameArrived(&TypedEventHandler::new(move |p: windows_core::Ref<Direct3D11CaptureFramePool>, _| {
            if let Some(p) = p.as_ref() {
                if let Ok(frame) = p.TryGetNextFrame() {
                    let _ = tx.send(frame);
                }
            }
            Ok(())
        }))
        .map_err(e)?;
        session.StartCapture().map_err(e)?;
        let frame = rx.recv_timeout(Duration::from_millis(1500)).map_err(|_| "no frame".to_string());
        let _ = session.Close();
        let _ = pool.Close();
        let frame = frame?;

        let surface = frame.Surface().map_err(e)?;
        let access: IDirect3DDxgiInterfaceAccess = surface.cast().map_err(e)?;
        let texture: ID3D11Texture2D = access.GetInterface().map_err(e)?;
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        texture.GetDesc(&mut desc);
        desc.Usage = D3D11_USAGE_STAGING;
        desc.BindFlags = 0;
        desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ.0 as u32;
        desc.MiscFlags = 0;
        let mut staging: Option<ID3D11Texture2D> = None;
        device.CreateTexture2D(&desc, None, Some(&mut staging)).map_err(e)?;
        let staging = staging.ok_or("staging")?;
        context.CopyResource(&staging, &texture);
        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        context.Map(&staging, 0, D3D11_MAP_READ, 0, Some(&mut mapped)).map_err(e)?;
        let (w, h) = (desc.Width, desc.Height);
        let mut out = vec![0u8; (w * h * 4) as usize];
        let src = mapped.pData as *const u8;
        for row in 0..h as usize {
            let line = std::slice::from_raw_parts(src.add(row * mapped.RowPitch as usize), (w * 4) as usize);
            let dst = &mut out[row * (w * 4) as usize..(row + 1) * (w * 4) as usize];
            for (d, s) in dst.chunks_exact_mut(4).zip(line.chunks_exact(4)) {
                d[0] = s[2];
                d[1] = s[1];
                d[2] = s[0];
                d[3] = 255;
            }
        }
        context.Unmap(&staging, 0);
        image::RgbaImage::from_raw(w, h, out).ok_or_else(|| "frame".to_string())
    }
}
