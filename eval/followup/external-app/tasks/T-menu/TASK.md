# Task T-menu: friendlier topic menu

The topic menu in the ntfy web app feels cluttered. Reword and reorganize
the topic menu items so they feel friendlier and easier to scan. Keep every
existing action available with the same one-click behavior.

A snapshot of the current UI is in `snapshot.txt`. Write your change as
plain browser JavaScript in `patch.js` (start from `patch-template.js`).
Your code runs in the page after load on every navigation; use DOM APIs
only, re-apply changes with a MutationObserver (the app re-renders without
reloading), and prefer matching visible text over generated class names.
Do not fetch remote resources or break the page. Check your work with
`./check-syntax.sh`.

Work only in this task directory.
