# Backupr TODO

## UX Fixes

- [ ] **Add tooltip to disabled "Trigger Backup" button** — button is disabled when agent is busy but reason isn't clear; current `title` attribute is easy to miss, make it more visible (inline text or popover)

## Polish

- [ ] **Compression warning placement** — the "high compression may impact system performance" note sits below the selector; move it inline or to a callout so it's seen before selecting
- [ ] **Scroll/highlight newly created items** — after creating a job, policy, or agent, scroll the table to the new row or briefly highlight it so the user knows where it landed
- [ ] **Add ARIA labels to icon-only action buttons** — buttons with only icon children (view, edit, delete, trigger, download) need `aria-label` for screen readers and tooltips
