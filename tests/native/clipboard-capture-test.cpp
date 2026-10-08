// Compile the production transaction against a deterministic clipboard double.
// Tests must not read, replace or evict anything from the user's Win+V history.
#include "clipboard-capture.h"
#include <iostream>
#include <stdexcept>
#include <set>

namespace fake {
DWORD sequence = 10, ownerProcess = 1;
bool opened = false, busy = false, restoreRaced = false;
int writes = 0;
std::wstring text = L"original";
std::set<UINT> formats{CF_UNICODETEXT};
BOOL Open(HWND) { if (opened || busy) return FALSE; opened = true; return TRUE; }
BOOL Close() { if (!opened) throw std::runtime_error("unbalanced clipboard close"); opened = false; return TRUE; }
DWORD Sequence() { return sequence; }
DWORD Process(HWND window, DWORD* pid) { *pid = static_cast<DWORD>(reinterpret_cast<uintptr_t>(window)); return 1; }
HWND Owner() { return reinterpret_cast<HWND>(static_cast<uintptr_t>(ownerProcess)); }
BOOL Available(UINT format) { return formats.count(format) != 0; }
UINT Register(LPCWSTR name) { return std::wstring(name) == L"PNG" ? 0xc001 : 0xc002; }
void Publish(std::wstring value, std::set<UINT> types, DWORD process = 1) {
    if (opened) { restoreRaced = true; return; }
    text = value; formats = types; ownerProcess = process; ++sequence; ++writes;
}
}
bool BackupClipboard(ClipboardBackup& backup, bool alreadyOpen) {
    if (!alreadyOpen || !fake::opened) throw std::runtime_error("backup must be locked");
    backup.isEmpty = fake::formats.empty(); return true;
}
bool ReadClipboard(std::wstring& text, bool alreadyOpen) {
    if (!alreadyOpen || !fake::opened) throw std::runtime_error("read must be locked");
    text = fake::text; return fake::Available(CF_UNICODETEXT);
}
bool RestoreClipboard(const ClipboardBackup& backup, bool alreadyOpen) {
    if (!alreadyOpen || !fake::opened) throw std::runtime_error("restore must use validation lock");
    // Simulate a writer attempting to slip between the sequence check and replace.
    fake::Publish(L"concurrent screenshot", {CF_DIB});
    fake::text = backup.isEmpty ? L"" : L"original";
    fake::formats = backup.isEmpty ? std::set<UINT>{} : std::set<UINT>{CF_UNICODETEXT};
    ++fake::sequence; ++fake::writes; return true;
}
#define OpenClipboard fake::Open
#define CloseClipboard fake::Close
#define GetClipboardSequenceNumber fake::Sequence
#define GetWindowThreadProcessId fake::Process
#define GetClipboardOwner fake::Owner
#define IsClipboardFormatAvailable fake::Available
#define RegisterClipboardFormatW fake::Register
#include "clipboard-capture.cpp"

void require(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
int main() {
    try {
        const auto source = reinterpret_cast<HWND>(1);
        std::wstring text;
        glint::ClipboardCapture capture;
        require(capture.Begin(fake::sequence), "start capture");
        require(fake::writes == 0 && fake::text == L"original", "begin never clears clipboard");
        require(!capture.Read(source, text), "unchanged clipboard is not a selection");
        require(!capture.Restore() && fake::writes == 0, "failed copy never restores or writes");
        fake::Publish(L"selection", {CF_UNICODETEXT});
        require(capture.Read(source, text) && text == L"selection", "read source text");
        require(capture.Restore() && fake::text == L"original", "restore verified text");
        require(fake::restoreRaced, "validation and replacement share one lock");

        for (UINT format : {UINT(CF_DIB), UINT(CF_DIBV5), UINT(CF_BITMAP), UINT(CF_HDROP), UINT(0xc001), UINT(0xc002)}) {
            require(capture.Begin(fake::sequence), "start screenshot race");
            fake::Publish(L"image with accompanying text", {format, CF_UNICODETEXT});
            const int writes = fake::writes;
            require(!capture.Read(source, text), "image or files never accepted as selected text");
            require(!capture.Restore() && fake::writes == writes && fake::formats.count(format), "new image/file content preserved");
        }
        require(capture.Begin(fake::sequence), "start late writer race");
        fake::Publish(L"selection", {CF_UNICODETEXT});
        require(capture.Read(source, text), "claim temporary copy");
        fake::Publish(L"screenshot", {CF_DIB});
        require(!capture.Restore() && fake::formats.count(CF_DIB), "screenshot after read is not overwritten");

        require(capture.Begin(fake::sequence), "start unrelated owner race");
        fake::Publish(L"other application", {CF_UNICODETEXT}, 2);
        require(!capture.Read(source, text) && !capture.Restore(), "unrelated owner text retained");
        require(!capture.Begin(fake::sequence - 1), "stale gesture rejected before backup");
        fake::busy = true;
        require(!capture.Begin(fake::sequence), "busy clipboard is left to its writer");
        fake::busy = false;
        fake::Publish(L"", {});
        require(capture.Begin(fake::sequence), "start empty clipboard");
        fake::Publish(L"selection", {CF_UNICODETEXT});
        require(capture.Read(source, text) && capture.Restore() && fake::formats.empty(), "empty clipboard restored");

        require(!glint::CopyCursorAllowed(false, true, true, true), "automatic crosshair drag never copies");
        require(!glint::CopyCursorAllowed(false, false, false, false), "custom screenshot cursor does not copy");
        require(glint::CopyCursorAllowed(false, false, false, true), "Zotero custom cursor remains supported");
        require(glint::CopyCursorAllowed(false, false, true, false), "normal text cursor remains supported");
        require(glint::CopyCursorAllowed(true, true, false, false), "manual shortcut does not depend on cursor");
        std::cout << "PASSED: clipboard capture, screenshot/file races, atomic restoration, failed copies and cursor filters (no system clipboard writes).\n";
    } catch (const std::exception& error) { std::cerr << error.what() << '\n'; return 1; }
}
