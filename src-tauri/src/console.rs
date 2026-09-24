use windows_sys::Win32::Foundation::INVALID_HANDLE_VALUE;
use windows_sys::Win32::System::Console::{
    AttachConsole, GetStdHandle, WriteConsoleInputW, ATTACH_PARENT_PROCESS, INPUT_RECORD, INPUT_RECORD_0, KEY_EVENT,
    KEY_EVENT_RECORD, KEY_EVENT_RECORD_0, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE,
};

/// Text for whoever started the exe. The release exe is a GUI app with no
/// console of its own: output that is redirected (a pipe or a file) is used
/// as is, otherwise the parent's console (cmd, PowerShell) is borrowed.
pub fn print(text: &str) {
    // SAFETY: plain Win32 calls with constant arguments; a failed attach just leaves no console.
    let borrowed = unsafe { GetStdHandle(STD_OUTPUT_HANDLE).is_null() && AttachConsole(ATTACH_PARENT_PROCESS) != 0 };
    println!("\n{text}");
    if borrowed {
        press_enter();
    }
}

/// An interactive shell doesn't wait for a GUI app, so its prompt is already
/// showing above our text and the cursor looks stuck after it. An Enter in
/// the console's input makes the shell draw a fresh prompt below.
///
/// Known trade-off: where the caller does wait (a .bat file, `start /wait`),
/// the Enter reaches whatever reads input next, such as a later `pause`.
fn press_enter() {
    let key = |down| INPUT_RECORD {
        EventType: KEY_EVENT as u16,
        Event: INPUT_RECORD_0 {
            KeyEvent: KEY_EVENT_RECORD {
                bKeyDown: down,
                wRepeatCount: 1,
                wVirtualKeyCode: 0x0D,  // VK_RETURN
                wVirtualScanCode: 0x1C, // the Enter key's scan code
                uChar: KEY_EVENT_RECORD_0 { UnicodeChar: '\r' as u16 },
                dwControlKeyState: 0,
            },
        },
    };
    let events = [key(1), key(0)];
    let mut written = 0;
    // SAFETY: `events` outlives the call and `written` is a valid out pointer;
    // after AttachConsole the standard input handle is the borrowed console's.
    unsafe {
        let input = GetStdHandle(STD_INPUT_HANDLE);
        if !input.is_null() && input != INVALID_HANDLE_VALUE {
            // Best effort: if it fails, the user presses Enter themselves.
            let _ = WriteConsoleInputW(input, events.as_ptr(), events.len() as u32, &mut written);
        }
    }
}
