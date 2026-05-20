fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("src/assets/icon.ico");
        res.set("ProductName", "Backupr Agent");
        res.set("CompanyName", "calirko");
        res.set("FileDescription", "Backupr backup agent service");
        res.set("ProductVersion", "2.0.6");
        res.set("FileVersion", "2.0.6");
        res.set("OriginalFilename", "backupr-agent.exe");
        res.set("InternalName", "backupr-agent");
        res.set("LegalCopyright", "Created by calirko");
        res.compile().unwrap();
    }
}
