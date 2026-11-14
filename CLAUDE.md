# Rules for working in this repo

## Who this is for
- The owner is not a programmer. Explain every change in one or two plain sentences.
- They use the app mostly on an iPhone, and test on a Windows laptop.
- It is a personal project for one person. No accounts, no sign-up, no pricing, no ads.

## How to build
- One web app that runs straight from GitHub Pages. `index.html` sits at the repo root.
- Plain HTML, CSS and JavaScript. No frameworks, no build step, no npm install needed to run it.
- Split code into a few small files (`index.html`, `styles.css`, `app.js`, plus one file per big feature) once a file passes about 600 lines.
- Mobile first: design for a 390px wide screen, large tap targets, works one-handed. It must also look fine on a laptop.
- Free only. Never add a paid service. Never commit an API key, token or password.

## Data
- All of the owner's data stays on their device, in the browser (localStorage for small data, IndexedDB for photos or large data).
- Always provide Export backup and Import backup buttons, and never break an older backup file.
- Never commit the owner's personal data, photos or logs to this repo. Use made-up sample data for demos.

## Working style
- Follow `PLAN.md` in order. Finish and test one step before starting the next.
- Keep commits small, with a message that says what changed for the user.
- After each step, update the checklist in `PLAN.md` and add two or three lines to `NOTES.md` on what was built and how to test it.
- If something in the plan is unclear or risky, stop and ask instead of guessing.
- Before saying a step is done, open the app and try the feature the way the owner would.
