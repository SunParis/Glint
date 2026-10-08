#pragma once
#include "clipboard.h"

namespace glint {
// Read-only backup until the source publishes a verified text copy. Never claim
// an image/file update, and compare the claimed sequence under the restore lock.
class ClipboardCapture {
public:
    bool Begin(DWORD expectedSequence);
    bool Unchanged() const;
    bool Read(HWND source, std::wstring& text);
    bool Restore();
private:
    ClipboardBackup backup_;
    DWORD initial_ = 0;
    DWORD copied_ = 0;
    bool started_ = false;
    bool claimed_ = false;
};

// Explicit copy mode skips UIA, but must not interpret arbitrary custom/crosshair
// cursors (screen capture, drawing, resizing) as text selection.
inline bool CopyCursorAllowed(bool manual, bool crosshair, bool textOrPointer, bool compatibleReader) {
    return manual || (!crosshair && (textOrPointer || compatibleReader));
}
}
