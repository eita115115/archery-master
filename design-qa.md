# Neon Sight Design QA

- Source visual truth: `C:\Users\eita2\.codex\generated_images\019eeb33-113e-7722-89aa-5cf1bfa77f60\exec-815745f4-f0e1-40e7-b2ce-2e4a4636b9af.png`
- Implementation screenshot: `artifacts/ui-smoke/iphone-390.png`
- Combined comparison: `artifacts/design-qa/neon-sight-compare.png`
- Viewport: 390 x 844
- State: home, no practice records, dark Neon Sight theme

**Findings**

No actionable P0, P1, or P2 differences remain.

- Fonts and typography: The implementation uses the existing Japanese system sans stack with heavier title weight and tracked Latin branding. It keeps the reference hierarchy and remains readable without loading a web font at the range.
- Spacing and layout rhythm: Brand, title, condition row, reticle action, empty state, and tab bar follow the reference order. The implementation adds the required local-storage notice below the empty state; this is an intentional product-safety deviation.
- Colors and visual tokens: Near-black background, restrained teal lines, white text, and an amber center point map to the selected reference. Disabled and secondary states remain quieter than the primary action.
- Image quality and asset fidelity: The generated 1024px app-icon master matches the selected art direction and produces clean 512px and 180px derivatives. The home reticle reuses the repository icon library; it remains sharp at all viewport sizes.
- Copy and content: Promotional and unsupported wording was removed from home, record setup, history heroes, and manifest metadata. Data-loss and training-only warnings remain where relevant.
- Icons: Navigation and settings use the existing SVG icon library. Emoji in the settings rows was replaced with the same icon family. The iOS/PWA icon was checked at 180px.
- States and interactions: Home tabs, condition sheet, record start, analysis, history, statistics, and settings were opened at mobile width. The oversized reticle no longer intercepts the condition button.
- Accessibility: Semantic buttons and labels remain, focus outlines use amber contrast, touch targets remain at least 44px, zoom is allowed, and reduced-motion CSS disables the new decorative animations.
- Responsiveness: Automated screenshots passed at 360 x 780, 390 x 844, and 1280 x 800 with no horizontal overflow.

**Open Questions**

- None blocking. The reference image was center-cropped to the 390 x 844 comparison ratio because Image Gen returned a taller source canvas.

**Implementation Checklist**

- [x] Match information hierarchy and dark Neon Sight palette.
- [x] Keep existing app logic and storage contracts.
- [x] Verify empty states and primary interactions.
- [x] Verify mobile and desktop overflow.
- [x] Verify PWA icon derivatives.

**Patches Made During QA**

- Reduced reticle stroke weight and center-point size.
- Prevented the decorative reticle from intercepting condition-button taps.
- Removed empty-state shortcuts and weekly metrics when no sessions exist.
- Replaced stale `+` button instructions and ambiguous empty-state copy.
- Restyled pills, settings rows, safety notes, and icons for Neon Sight.
- Corrected `インダア` to `インドア`.

**Follow-up Polish**

- [P3] The reference includes four small cardinal reticle ticks. They were not added because the existing icon library supplies a simpler target mark and custom decorative SVG/CSS art is outside the project asset rules.

final result: passed
