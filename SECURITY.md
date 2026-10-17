# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's **"Report a vulnerability"**
(Security → Advisories) on this repository, not in a public issue. Include steps to reproduce
with **synthetic data only**. Never include real passport data.

We aim to acknowledge reports within 7 days.

## Scope

Things we consider security issues:

- Any network request made by the core library, the OCR package or the playground (other than
  the playground loading its own static files).
- A way to make `parseMrz` throw, hang, or use excessive memory/CPU on crafted input.
- Script injection in the playground (e.g. via MRZ text or image metadata).
- A weakness in the playground's Content-Security-Policy that allows data to leave the page.
- Supply-chain issues in the published packages.

## Design notes

- `parseMrz` never throws; the correction search has a fixed budget.
- The playground renders all text with `textContent`, never `innerHTML`, and runs under a CSP
  with `default-src 'none'` and `connect-src 'self'`; its OCR worker starts from a `blob:` URL so
  the policy applies inside the worker.
- No telemetry, analytics or storage anywhere.
