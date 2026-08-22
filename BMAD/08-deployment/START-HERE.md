# Deployment

Current target: Railway.

Flow:
Git → CI → Tests → Build → Railway Staging → Smoke Tests → Production

Use separate staging and production environments.
Never commit secrets.
Never use production DB for local development.
