# Race the City Frontend

Angular static frontend for Race the City.

From the frontend directory, start or stop the development server with:

```powershell
npm run frontend:dev
npm run frontend:stop
```

The development server reads `../backend/.env.dev`.

In either config:

- `FRONTEND_PORT` selects the Angular server port.
- `BACKEND_PORT_HOST` selects the `/api` proxy target on `127.0.0.1`.

For local development, start the backend separately by running `npm run backend:dev` from the
backend directory. In production, the backend container starts from its Dockerfile command.

GitHub Pages deploys from `.github/workflows/deploy-pages.yml`.

There is no production frontend server command. GitHub Actions runs the Angular build directly and deploys the static output to GitHub Pages.

The landing page includes the public booking calendar and request form. The host console manages availability groups and pending/confirmed booking applications.

Set the repository variable `RACE_THE_CITY_API_URL` to the public backend origin, for example:

```text
https://api.racethecity.app
```
