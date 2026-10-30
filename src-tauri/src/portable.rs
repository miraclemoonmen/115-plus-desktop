//! 便携版在插件、日志和 WebView 初始化前检查自身目录，不回落到系统数据目录。

use std::{
    fs, io,
    io::Write,
    path::{Path, PathBuf},
};
use tauri::utils::config::AppDirectoriesOverride;

fn data_directory(binary: &Path) -> io::Result<PathBuf> {
    let mut parent = binary
        .parent()
        .ok_or_else(|| io::Error::other("无法确定程序目录"))?;
    // macOS 的 data 放在 .app 旁边，不能修改已签名的应用包内容。
    if parent.file_name().is_some_and(|name| name == "MacOS")
        && let Some(contents) = parent
            .parent()
            .filter(|p| p.file_name().is_some_and(|n| n == "Contents"))
        && let Some(bundle) = contents
            .parent()
            .filter(|p| p.extension().is_some_and(|n| n == "app"))
    {
        parent = bundle
            .parent()
            .ok_or_else(|| io::Error::other("无法确定应用包目录"))?;
    }
    Ok(parent.join("data"))
}

fn check_writable(directory: &Path) -> io::Result<()> {
    fs::create_dir_all(directory)?;
    let probe = directory.join(format!(".write-check-{}", uuid::Uuid::new_v4()));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)?;
    let result = file.write_all(b"115+");
    drop(file);
    let cleanup = fs::remove_file(probe);
    result.and(cleanup)
}

pub fn prepare(context: &mut tauri::Context<tauri::Wry>) -> Result<(), String> {
    // current_binary 正确处理 AppImage 的挂载路径；根目录与启动时的工作目录无关。
    let binary =
        tauri::process::current_binary(&tauri::Env::default()).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    let runtime = runtime_directory(binary.parent().ok_or("无法确定程序目录")?)?;
    let data = data_directory(&binary).map_err(|e| e.to_string())?;
    check_writable(&data).map_err(|e| {
        format!(
            "无法写入 {}。请将整个程序文件夹移到可写位置后重试。\n{e}",
            data.display()
        )
    })?;

    #[cfg(windows)]
    prepare_runtime(&runtime)?;

    context.config_mut().app.app_directories_override = Some(AppDirectoriesOverride::Root(data));
    Ok(())
}

pub fn fail(error: impl std::fmt::Display) -> ! {
    rfd::MessageDialog::new()
        .set_title("115+")
        .set_level(rfd::MessageLevel::Error)
        .set_description(format!("便携版启动失败：{error}"))
        .show();
    std::process::exit(1);
}

#[cfg(windows)]
fn check_runtime_location(runtime: &Path) -> Result<(), String> {
    use std::path::{Component, Prefix};

    if matches!(
        runtime.components().next(),
        Some(Component::Prefix(prefix))
            if matches!(prefix.kind(), Prefix::UNC(..) | Prefix::VerbatimUNC(..))
    ) {
        return Err(
            "内置 WebView2 不支持从网络目录运行。请将整个程序文件夹移到本地磁盘后重试。".into(),
        );
    }
    Ok(())
}

#[cfg(windows)]
fn runtime_directory(directory: &Path) -> Result<PathBuf, String> {
    let runtime = directory.join("runtime");
    for name in ["msedgewebview2.exe", "msedge.dll", "icudtl.dat"] {
        if !runtime.join(name).is_file() {
            return Err(
                "未找到完整的内置 WebView2。请重新解压便携包，保留 runtime 文件夹。".into(),
            );
        }
    }
    // 解析映射盘、链接等实际位置后再检查，不改系统运行库或安全策略。
    let runtime = fs::canonicalize(runtime).map_err(|e| format!("无法读取内置 WebView2：{e}"))?;
    check_runtime_location(&runtime)?;
    let directory = fs::canonicalize(directory).map_err(|e| format!("无法读取程序目录：{e}"))?;
    if runtime.parent() != Some(directory.as_path()) {
        return Err("runtime 不能指向程序目录外的位置，请重新解压完整便携包后重试。".into());
    }
    Ok(runtime)
}

#[cfg(windows)]
fn prepare_runtime(runtime: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use winreg::{RegKey, enums::HKEY_LOCAL_MACHINE};

    let build = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey("SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion")
        .and_then(|key| key.get_value::<String, _>("CurrentBuildNumber"))
        .map_err(|e| format!("无法读取 Windows 版本：{e}"))?
        .parse::<u32>()
        .map_err(|e| e.to_string())?;
    if build < 22000 {
        // Fixed Runtime 120+ 在 Windows 10 上要求 AppContainer 能读取运行库。
        // 仅修改随包附带的 runtime 文件夹权限，不改系统配置，不需要管理员权限。
        let system_root = std::env::var_os("SystemRoot").ok_or("无法确定 Windows 系统目录")?;
        let output =
            std::process::Command::new(Path::new(&system_root).join("System32/icacls.exe"))
                .arg(runtime)
                .args([
                    "/grant",
                    "*S-1-15-2-1:(OI)(CI)(RX)",
                    "*S-1-15-2-2:(OI)(CI)(RX)",
                ])
                .creation_flags(0x08000000)
                .output()
                .map_err(|e| format!("无法设置运行库读取权限：{e}"))?;
        if !output.status.success() {
            return Err(
                "无法设置 runtime 文件夹的读取权限，请将整个程序文件夹移到可写位置后重试。".into(),
            );
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn network_runtime_is_rejected_but_local_long_paths_are_allowed() {
        for path in [r"\\server\share\runtime", r"\\?\UNC\server\share\runtime"] {
            assert!(check_runtime_location(Path::new(path)).is_err());
        }
        for path in [r"C:\便携目录\runtime", r"\\?\C:\便携目录 含空格\runtime"] {
            assert!(check_runtime_location(Path::new(path)).is_ok());
        }
    }

    #[cfg(windows)]
    #[test]
    fn incomplete_runtime_is_rejected_without_creating_data() {
        let dir = std::env::temp_dir().join(format!("115-runtime-{}", uuid::Uuid::new_v4()));
        let runtime = dir.join("runtime");
        fs::create_dir_all(&runtime).unwrap();
        for name in ["msedgewebview2.exe", "msedge.dll"] {
            fs::write(runtime.join(name), b"fixture").unwrap();
        }
        assert!(runtime_directory(&dir).is_err());
        assert!(!dir.join("data").exists());
        fs::write(runtime.join("icudtl.dat"), b"fixture").unwrap();
        assert_eq!(
            runtime_directory(&dir).unwrap(),
            fs::canonicalize(runtime).unwrap()
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn runtime_permission_setup_preserves_existing_grants_and_nearby_files() {
        let dir = std::env::temp_dir().join(format!("115-acl-{}", uuid::Uuid::new_v4()));
        let runtime = dir.join("runtime");
        fs::create_dir_all(&runtime).unwrap();
        let nearby = dir.join("untouched.txt");
        fs::write(&nearby, b"keep").unwrap();
        let icacls =
            PathBuf::from(std::env::var_os("SystemRoot").unwrap()).join("System32/icacls.exe");
        let before = std::process::Command::new(&icacls)
            .arg(&nearby)
            .output()
            .unwrap();
        assert!(before.status.success());
        let grant = std::process::Command::new(&icacls)
            .arg(&runtime)
            .args(["/grant", "*S-1-15-2-1:(W)"])
            .output()
            .unwrap();
        assert!(grant.status.success());
        prepare_runtime(&fs::canonicalize(&runtime).unwrap()).unwrap();
        let permissions = std::process::Command::new(&icacls)
            .arg(&runtime)
            .output()
            .unwrap();
        let permissions = String::from_utf8_lossy(&permissions.stdout);
        assert!(permissions.contains("(W)") || permissions.contains(",W)"));
        let after = std::process::Command::new(icacls)
            .arg(&nearby)
            .output()
            .unwrap();
        assert_eq!(before.stdout, after.stdout);
        assert_eq!(fs::read(nearby).unwrap(), b"keep");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn data_stays_next_to_the_binary_with_spaces_and_unicode() {
        let binary = Path::new("测试 便携目录").join("115+.exe");
        assert_eq!(
            data_directory(&binary).unwrap(),
            Path::new("测试 便携目录/data")
        );
    }

    #[test]
    fn mac_data_stays_outside_the_signed_bundle() {
        let binary = Path::new("便携目录/115+.app/Contents/MacOS/oof-plus-desktop");
        assert_eq!(data_directory(binary).unwrap(), Path::new("便携目录/data"));
    }

    #[test]
    fn ordinary_macos_named_directory_is_not_treated_as_a_bundle() {
        let binary = Path::new("测试/MacOS/program");
        assert_eq!(
            data_directory(binary).unwrap(),
            Path::new("测试/MacOS/data")
        );
    }

    #[test]
    fn creates_writable_data_without_leaving_probes() {
        let dir = std::env::temp_dir().join(format!("115-便携测试-{}", uuid::Uuid::new_v4()));
        check_writable(&dir).unwrap();
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        fs::remove_dir(dir).unwrap();
    }

    #[test]
    fn existing_credentials_are_not_overwritten() {
        let dir = std::env::temp_dir().join(format!("115-portable-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        fs::write(dir.join("user.json"), b"fixture credential").unwrap();
        check_writable(&dir).unwrap();
        assert_eq!(
            fs::read(dir.join("user.json")).unwrap(),
            b"fixture credential"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn file_in_place_of_data_directory_is_rejected() {
        let file = std::env::temp_dir().join(format!("115-portable-{}", uuid::Uuid::new_v4()));
        fs::write(&file, b"existing file").unwrap();
        assert!(check_writable(&file).is_err());
        assert_eq!(fs::read(&file).unwrap(), b"existing file");
        fs::remove_file(file).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn readonly_data_is_rejected_without_falling_back() {
        use std::os::unix::fs::PermissionsExt;
        let dir = std::env::temp_dir().join(format!("115-portable-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&dir).unwrap();
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o500)).unwrap();
        let result = check_writable(&dir);
        fs::set_permissions(&dir, fs::Permissions::from_mode(0o700)).unwrap();
        fs::remove_dir(&dir).unwrap();
        assert!(result.is_err());
    }
}
