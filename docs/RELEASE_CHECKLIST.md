# Release checklist

## Read-only data

- [ ] Finance audit returns the selected period and reports the source (`finance` or `statistics`).
- [ ] Analytics inventory uses the current POST warehouse report and records `204` as an empty result.
- [ ] Supplies reconciliation is marked preliminary until an opening stock snapshot exists.
- [ ] Content cards and Prices records are joined only by `nmID`; missing prices remain visible.
- [ ] Catalog pagination continues until WB returns an empty page.

## Accuracy

- [ ] Unknown cost is never replaced with zero.
- [ ] Barcode-level cost and advertising mappings take priority over `nmID`.
- [ ] Every incomplete metric has an explicit coverage warning.
- [ ] No conclusion about shortage is shown without an opening stock balance.

## UI and safety

- [ ] Workspace navigation opens Overview, Actions, Products, Control and Scenarios separately.
- [ ] Tables scroll horizontally on mobile widths.
- [ ] Tokens are used in memory only and are never written to the repository or local history.
- [ ] Price writes require an explicit confirmation and a post-write status check.

## Verification commands

```powershell
npm.cmd test
node --check public/app.js
node --check src/server.js
```

Real-token verification must be performed locally with freshly issued tokens and must not be committed to Git.
