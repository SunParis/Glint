# selection-hook Windows extension

Linux applies the shared JavaScript/type declarations for build consistency but uses the unmodified upstream Linux x64 prebuild. It does not compile this Windows extension or call its copy-mode API; Linux selection is PRIMARY-only.

`selection-hook-2.1.1.patch` extends the pinned MIT dependency with
`setClipboardOnly(boolean)`. Both automatic and manual capture pass this flag in
the existing worker configuration snapshot. When enabled, neither UIA nor MSAA
is queried; failed copies never fall back to potentially incorrect accessibility
text. Global application exclusions and clipboard enablement still apply.

The patch also checks source-window focus before copying and before accepting
the result, rejects pre-existing clipboard changes in explicit copy mode, and
restores an originally empty clipboard. It reuses the upstream clipboard format
backup, copy shortcuts, polling, and cancellation machinery.

Automatic forced-copy capture still rejects crosshair/custom drawing and screenshot
cursors, with explicit custom-cursor exceptions for PDF readers including Zotero.
`native/clipboard-capture.*` keeps the initial backup read-only: it no longer clears
the clipboard before sending copy. Only new text owned by the source process can
be restored, and image/file payloads are never claimed. The sequence check and
restoration share a single clipboard lock, so a later screenshot or manual copy
wins. Failed/aborted copies do not overwrite the clipboard. History deletion uses
the matched history ID without holding the system clipboard across the WinRT call.

Glint's `native/clipboard-history.*` helper uses the Windows history API to attempt
removal of a temporary copy. It excludes pre-existing IDs, matches exact text
within the capture time window, and stops when the clipboard changes or more
than one record matches. Restoration adds the documented Windows exclusion
format to avoid another history entry or cloud upload. History access is bounded
and optional; unsupported/disabled history does not prevent capture. This cannot
guarantee that a temporary copy never appears, reverse a history eviction, or
clean a third-party clipboard manager. Ambiguous and delayed records are retained.

Run `npm run test:clipboard-history` for policy and Windows API checks. The live
test skips when history is disabled or near capacity, without changing the user's
preferences or evicting existing entries. It deletes only its own generated test
records and restores the clipboard. Regular Electron smoke checks capture behavior.
Use `npm run test:clipboard-history -- -CaptureOnly` for deterministic capture,
image/file race, restoration and cursor tests without touching the system clipboard.
`-CaptureLive` also checks real Windows text/image restoration and screenshot races
using history-excluded fixtures, then restores the original clipboard if unchanged.

`npm ci` applies and compiles the patch using Python and Visual Studio C++ tools.
The native module and history tests use C++20 so C++/WinRT uses standard coroutines,
without relying on the experimental coroutine headers removed by newer MSVC.
Builds verify its source and binary fingerprint; the patched binary replaces the
Windows x64 prebuild used in both development and packaged apps. Do not update
the dependency without reviewing and regenerating this patch. Upstream's MIT
license remains included in the distribution.
