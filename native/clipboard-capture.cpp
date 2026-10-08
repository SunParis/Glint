#include "clipboard-capture.h"

namespace glint {
namespace {
struct ClipboardAccess {
    bool opened = OpenClipboard(nullptr) != FALSE;
    ~ClipboardAccess() { if (opened) CloseClipboard(); }
};
bool HasImageOrFiles() {
    return IsClipboardFormatAvailable(CF_BITMAP) || IsClipboardFormatAvailable(CF_DIB) ||
        IsClipboardFormatAvailable(CF_DIBV5) || IsClipboardFormatAvailable(CF_HDROP) ||
        IsClipboardFormatAvailable(RegisterClipboardFormatW(L"PNG")) ||
        IsClipboardFormatAvailable(RegisterClipboardFormatW(L"image/png"));
}
}

bool ClipboardCapture::Begin(DWORD expectedSequence) {
    started_ = claimed_ = false;
    ClipboardAccess access;
    if (!access.opened) return false;
    // A writer may have completed while we were opening the clipboard. Do not
    // initiate a copy using a gesture that predates that write.
    if (GetClipboardSequenceNumber() == expectedSequence && BackupClipboard(backup_, true)) {
        initial_ = GetClipboardSequenceNumber(); // delayed rendering may advance it
        started_ = true;
    }
    return started_;
}

bool ClipboardCapture::Unchanged() const {
    return started_ && GetClipboardSequenceNumber() == initial_;
}

bool ClipboardCapture::Read(HWND source, std::wstring& text) {
    text.clear();
    if (!started_) return false;
    ClipboardAccess access;
    if (!access.opened) return false;
    DWORD sourceProcess = 0, ownerProcess = 0;
    GetWindowThreadProcessId(source, &sourceProcess);
    GetWindowThreadProcessId(GetClipboardOwner(), &ownerProcess);
    const bool valid = GetClipboardSequenceNumber() != initial_ && sourceProcess &&
        ownerProcess == sourceProcess && !HasImageOrFiles() && ReadClipboard(text, true) && !text.empty();
    if (valid) {
        copied_ = GetClipboardSequenceNumber();
        claimed_ = true;
    }
    if (!valid) text.clear();
    return valid;
}

bool ClipboardCapture::Restore() {
    if (!claimed_) return false;
    ClipboardAccess access;
    if (!access.opened) return false;
    // Check and replacement share a single OpenClipboard interval: no other
    // writer can slip between validation and EmptyClipboard.
    const bool restored = GetClipboardSequenceNumber() == copied_ && RestoreClipboard(backup_, true);
    claimed_ = false;
    return restored;
}
}
