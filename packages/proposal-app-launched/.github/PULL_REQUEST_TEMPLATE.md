# Summary

This PR includes several small fixes and UX improvements intended to prepare the app for deployment:

- Remove legacy company default in UI and migrate existing localStorage entries
- Point frontend to hosted backend when env var is unset
- Fix email verification redirect default to Vercel frontend
- Move "Provided On" field above customer name and make it full-width in forms/print view
- Parse pasted full addresses into street/city/state/zip and show only street on the street line
- Add Contact Picker handler (uses browser Contact Picker API) and remove the visible pick button
- Add minimal PWA manifest and index.html head links so the app can be saved to phone homescreens

# Steps to test
1. Run the app locally with `npm run dev` and verify UI changes (company header, provided-on placement, address behavior).
2. Inspect `public/manifest.json` and `index.html` for PWA links.

# Notes
- PR target: `main` <- `deploy-fixes`
- See commit history for individual commits and descriptions.
