# Native Viewport Stability Design

## Goal

Make Archery Master feel fixed and app-like on iPhone. The page must not pinch-zoom, double-tap zoom, drift horizontally, or rubber-band as one large web page. The existing `ARCHERY MASTER` header remains.

## Chosen Direction

Use a locked viewport shell across Safari and the installed PWA:

- Disable user scaling in the viewport metadata.
- Lock `html` and `body` to the visual viewport and prevent document-level overflow and overscroll.
- Make `main` the only vertical scrolling surface, with enough bottom padding for the fixed tab bar and safe area.
- Keep target input gestures isolated with the existing `touch-action:none`; normal app surfaces scroll vertically only.
- Prevent iOS gesture events and multi-touch moves from starting page zoom.
- Keep controls at a touch-safe size and inputs at 16px or larger so focus cannot trigger automatic zoom.

## iPhone Status Bar

The iPhone area containing the clock, signal, and battery stays visible. Its background must visually continue the app's dark top surface:

- Use one dark `theme-color` consistent with the header/background.
- Add the Apple standalone status-bar metadata required by the installed PWA.
- Preserve `viewport-fit=cover` and safe-area padding so content does not sit under the status icons.

## Interaction And Layout

- The top app header remains visible and keeps the settings button.
- The bottom navigation remains fixed.
- Only the content between them scrolls vertically.
- Horizontal page movement is impossible.
- Overlays and sheets remain fixed to the viewport and scroll internally when their content is tall.
- Score entry, target tapping, arrow dragging, text entry, and the on-screen keyboard must remain usable.

## Accessibility Trade-off

The user explicitly chose complete viewport locking, including disabling pinch zoom. Text and controls therefore need to remain readable without browser magnification. Existing focus styles and semantic controls stay intact.

## Verification

- Add a failing UI regression check for viewport metadata and the locked app-shell contract before implementation.
- Verify at 390x844 and 360x780 that the document does not overflow in either axis and `main` is the vertical scroller.
- Verify desktop remains usable.
- Re-run score entry, input-mode switching, overlay, and interaction audit checks.
- Confirm deployed version metadata, service-worker cache version, and the public GitHub Pages assets after publishing v81.
