# Task T-settings: friendlier settings page

The ntfy settings page feels too technical for non-experts. Reword and
reorganize the Notifications settings rows so they feel friendlier and
easier to understand. Keep every existing option and every existing value
available.

A snapshot of the current UI is in `snapshot.txt`. Write your change as
plain browser JavaScript in `patch.js` (start from `patch-template.js`).
Your code runs in the page after load on every navigation; use DOM APIs
only, re-apply changes with a MutationObserver (the app re-renders without
reloading), and prefer matching visible text over generated class names.
Do not fetch remote resources or break the page. Check your work with
`./check-syntax.sh`.

Work only in this task directory.
