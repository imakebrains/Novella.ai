fn main() {
    // Cargo will not re-run this script just because an icon changed, and
    // tauri_build does not ask it to. The Windows icon is baked into the
    // executable by a resource compiled HERE, so without these lines a
    // regenerated icon sits on disk looking correct while every build keeps
    // shipping the one that was current the last time some Rust source
    // happened to change. That is exactly what happened: icon.ico was
    // rebuilt at 16:05 and the binary carrying the old art was stamped
    // 12:42, so the app wore the default Tauri mark for a day.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    println!("cargo:rerun-if-changed=icons/icon.icns");
    // The brand art the icons are generated FROM, so replacing the source
    // and re-running scripts/make-icons.py reaches the binary too.
    println!("cargo:rerun-if-changed=../assets/brand");

    tauri_build::build()
}
