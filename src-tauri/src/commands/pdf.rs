//! 导出 PDF：直接调用 WebView2 的 PrintToPdf，无需依赖外部打印驱动。
//!
//! 说明：`with_webview` 的闭包在主线程执行，闭包内部通过 `wait_for_async_operation`
//! 抽取完成回调（内部会泵消息，避免主线程死锁），结果通过 channel 回传给命令线程。

#[cfg(windows)]
use tauri::Manager;

/// 关闭 WebView2 的浏览器快捷键（Ctrl+P / Ctrl+F / F3 / F12 等），
/// 让这些按键交给应用自身的快捷键体系处理。
#[cfg(windows)]
pub fn disable_browser_accelerators(app: &tauri::AppHandle) {
    use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Settings3;
    use windows::core::Interface;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.with_webview(|platform| {
        let controller = platform.controller();
        let Ok(core) = (unsafe { controller.CoreWebView2() }) else {
            return;
        };
        let Ok(settings) = (unsafe { core.Settings() }) else {
            return;
        };
        if let Ok(settings3) = settings.cast::<ICoreWebView2Settings3>() {
            unsafe {
                let _ = settings3.SetAreBrowserAcceleratorKeysEnabled(false);
            }
        }
    });
}

#[cfg(windows)]
#[tauri::command]
pub async fn print_to_pdf(app: tauri::AppHandle, path: String) -> Result<(), String> {    use tauri::Manager;
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2_7, ICoreWebView2Environment6,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows::core::{Interface, HSTRING};

    if path.trim().is_empty() {
        return Err("导出路径为空".to_string());
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "找不到主窗口".to_string())?;

    let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
    let target = path.clone();

    window
        .with_webview(move |platform| {
            let controller = platform.controller();
            let result: Result<(), String> = (|| {
                let core = unsafe { controller.CoreWebView2() }.map_err(|e| e.to_string())?;
                let core7: ICoreWebView2_7 = core.cast().map_err(|e| e.to_string())?;
                let environment = platform.environment();
                let env6: ICoreWebView2Environment6 =
                    environment.cast().map_err(|e| e.to_string())?;
                let settings = unsafe { env6.CreatePrintSettings() }
                    .map_err(|e| format!("创建打印设置失败: {e}"))?;
                unsafe {
                    settings
                        .SetShouldPrintBackgrounds(true)
                        .map_err(|e| e.to_string())?;
                    settings.SetMarginTop(0.6).map_err(|e| e.to_string())?;
                    settings.SetMarginBottom(0.6).map_err(|e| e.to_string())?;
                    settings.SetMarginLeft(0.55).map_err(|e| e.to_string())?;
                    settings.SetMarginRight(0.55).map_err(|e| e.to_string())?;
                    settings.SetScaleFactor(1.0).map_err(|e| e.to_string())?;
                }

                let file = HSTRING::from(target.as_str());
                let (done_tx, done_rx) = std::sync::mpsc::channel::<bool>();

                PrintToPdfCompletedHandler::wait_for_async_operation(
                    Box::new(move |handler| {
                        unsafe { core7.PrintToPdf(&file, &settings, &handler) }
                            .map_err(webview2_com::Error::WindowsError)?;
                        Ok(())
                    }),
                    Box::new(move |_hr, succeeded| {
                        let _ = done_tx.send(succeeded);
                        Ok(())
                    }),
                )
                .map_err(|e| format!("调用 PrintToPdf 失败: {e}"))?;

                match done_rx.recv_timeout(std::time::Duration::from_secs(180)) {
                    Ok(true) => Ok(()),
                    Ok(false) => Err("WebView2 未能完成 PDF 导出".to_string()),
                    Err(_) => Err("PDF 导出超时".to_string()),
                }
            })();

            let _ = tx.send(result);
        })
        .map_err(|e| format!("提交打印任务失败: {e}"))?;

    match rx.recv_timeout(std::time::Duration::from_secs(200)) {
        Ok(result) => result,
        Err(_) => Err("PDF 导出超时（未收到 WebView2 回执）".to_string()),
    }
}
