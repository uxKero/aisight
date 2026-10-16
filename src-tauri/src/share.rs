use std::sync::Mutex;

use windows::ApplicationModel::DataTransfer::{DataRequestedEventArgs, DataTransferManager};
use windows::Foundation::TypedEventHandler;
use windows::Storage::{IStorageItem, StorageFile};
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Shell::IDataTransferManagerInterop;
use windows::core::{HSTRING, Interface};
use windows_collections::IIterable;

static PENDING: Mutex<Option<(Vec<String>, String)>> = Mutex::new(None);
static REGISTERED: Mutex<bool> = Mutex::new(false);

fn fill(args: &DataRequestedEventArgs) -> windows_core::Result<()> {
    let Some((paths, title)) = PENDING.lock().unwrap().clone() else { return Ok(()) };
    let request = args.Request()?;
    let data = request.Data()?;
    data.Properties()?.SetTitle(&HSTRING::from(title.as_str()))?;
    let mut list = vec![];
    for path in &paths {
        let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path.replace('/', "\\")))?.get()?;
        list.push(Some(file.cast::<IStorageItem>()?));
    }
    let items: IIterable<IStorageItem> = IIterable::from(list);
    data.SetStorageItemsReadOnly(&items)
}

pub fn show(hwnd: HWND, paths: Vec<String>, title: String) -> Result<(), String> {
    *PENDING.lock().unwrap() = Some((paths, title));
    unsafe {
        let interop = windows_core::factory::<DataTransferManager, IDataTransferManagerInterop>().map_err(|e| e.to_string())?;
        let mut registered = REGISTERED.lock().unwrap();
        if !*registered {
            let manager: DataTransferManager = interop.GetForWindow(hwnd).map_err(|e| e.to_string())?;
            manager
                .DataRequested(&TypedEventHandler::new(|_, args: windows_core::Ref<DataRequestedEventArgs>| {
                    if let Some(args) = args.as_ref() {
                        fill(args)?;
                    }
                    Ok(())
                }))
                .map_err(|e| e.to_string())?;
            *registered = true;
        }
        interop.ShowShareUIForWindow(hwnd).map_err(|e| e.to_string())
    }
}
