/// Text for whoever started the exe. The release exe is a GUI app with no
/// console of its own: output that is redirected (a pipe or a file) is used
/// as is, otherwise the parent's console (cmd, PowerShell) is borrowed; the
/// prompt may already be showing by then.
pub fn print(text: &str) {
    use windows_sys::Win32::System::Console::{AttachConsole, GetStdHandle, ATTACH_PARENT_PROCESS, STD_OUTPUT_HANDLE};
    unsafe {
        if GetStdHandle(STD_OUTPUT_HANDLE).is_null() {
            AttachConsole(ATTACH_PARENT_PROCESS);
        }
    }
    println!("\n{text}");
}
