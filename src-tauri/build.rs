fn main() {
    println!("cargo:rerun-if-env-changed=QUIET_UPDATER_PUBLIC_KEY");
    #[cfg(feature = "desktop")]
    tauri_build::build();
}
