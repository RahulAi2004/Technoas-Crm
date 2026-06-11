# Deploying Technocas CRM on the server (Docker)

The server (31.97.110.197) already runs PostgreSQL (`decoinks-postgres`, port 5436)
and Qdrant (port 6333). This deploys the CRM **frontend + backend** as two new
containers that connect to those.

## One-time deploy (run in PuTTY on the server)

```bash
# 1) Make a separate folder and clone the repo into it
mkdir -p ~/technocas-crm && cd ~/technocas-crm
git clone https://github.com/RahulAi2004/Technoas-Crm.git .

# 2) Create the backend env file with REAL secrets
cp server/.env.example server/.env
nano server/.env       # fill DATABASE_URL password, QDRANT_API_KEY, OPENAI_API_KEY  → Ctrl+O, Enter, Ctrl+X

# 3) Build and start
docker compose up -d --build

# 4) Check
docker compose ps
docker compose logs -f backend     # should show "Postgres connected" + "API running"
```

Open: **http://31.97.110.197:8190**  (login: info@technocas.com)

## Update later (after new commits)
```bash
cd ~/technocas-crm
git pull
docker compose up -d --build
```

## Useful
```bash
docker compose logs -f backend     # backend logs
docker compose restart backend     # restart API
docker compose down                # stop everything
```

## Notes
- Frontend (nginx) serves the built React app and proxies `/api` → backend container.
- Change the public port by editing `docker-compose.yml` (`"8190:80"`).
- Meta webhook URL (if used): `http://31.97.110.197:8190/api/webhooks/meta`
- The backend reaches Postgres/Qdrant via the values in `server/.env`.
