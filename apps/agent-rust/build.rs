fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // CARGO_FEATURE_TRAY is set when building with --features tray (the tray binary).
        // Build each binary separately to get the correct embedded icon per exe.
        let is_tray = std::env::var("CARGO_FEATURE_TRAY").is_ok();

        let (icon, product_name, description, original_filename) = if is_tray {
            (
                "src/assets/icon-agent.ico",
                "Backupr Agent",
                "Backupr tray agent",
                "backupr-tray.exe",
            )
        } else {
            (
                "src/assets/icon-service.ico",
                "Backupr Service",
                "Backupr backup service",
                "backupr-service.exe",
            )
        };

        let mut res = winresource::WindowsResource::new();
        res.set_icon(icon);
        res.set("ProductName", product_name);
        res.set("FileDescription", description);
        res.set("CompanyName", "calirko");
        res.set("ProductVersion", "2.1.2");
        res.set("FileVersion", "2.1.2");
        res.set("OriginalFilename", original_filename);
        res.set("InternalName", original_filename);
        res.set("LegalCopyright", "Created by calirko");
        res.compile().unwrap();
    }
}
