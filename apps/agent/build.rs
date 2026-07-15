fn main() {
    // CARGO_FEATURE_TRAY is set when building with --features tray (the tray binary).
    let is_tray = std::env::var("CARGO_FEATURE_TRAY").is_ok();

    if is_tray {
        // Decode the tray's PNG icon to raw RGBA once, at build time, so the
        // shipped binary never needs to link a PNG/zlib decoder. Inlined
        // decompression code is a well-known trigger for generic "packer/crypter"
        // AV heuristics (e.g. ESET's GenKryptik) on small GUI binaries, so keeping
        // decode-capable code out of the final exe avoids that class of false positive.
        let png_path = "src/assets/icon-agent.png";
        println!("cargo:rerun-if-changed={png_path}");
        let png_bytes = std::fs::read(png_path).expect("failed to read icon-agent.png");
        let img = image::load_from_memory(&png_bytes)
            .expect("failed to decode icon-agent.png")
            .into_rgba8();
        let (width, height) = img.dimensions();
        let out_dir = std::env::var("OUT_DIR").unwrap();
        std::fs::write(
            std::path::Path::new(&out_dir).join("icon_agent.rgba"),
            img.into_raw(),
        )
        .expect("failed to write decoded icon RGBA");
        std::fs::write(
            std::path::Path::new(&out_dir).join("icon_agent_dims.rs"),
            format!(
                "pub const ICON_AGENT_WIDTH: u32 = {width};\npub const ICON_AGENT_HEIGHT: u32 = {height};\n"
            ),
        )
        .expect("failed to write icon dimensions");
    }

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // Build each binary separately to get the correct embedded icon per exe.
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
        res.set("ProductVersion", "2.1.6");
        res.set("FileVersion", "2.1.6");
        res.set("OriginalFilename", original_filename);
        res.set("InternalName", original_filename);
        res.set("LegalCopyright", "Created by calirko");
        res.compile().unwrap();
    }
}
