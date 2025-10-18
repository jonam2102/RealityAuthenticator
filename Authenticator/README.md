# Authenticator - This is a tool that allows you to validate forensic aspects of real word posts and status using Gemini AI 

This workspace is a self-contained demo of a small forensic verification UI and a tiny Node/Express backend that supports:

Quick start (requires Node.js):

1. Install dependencies from the project root:

	npm install

2. Start the server:

	npm start

3. Open the app in a browser:

	http://localhost:3000

4. Register / Login:

	- Open `http://localhost:3000/login.html` to register a new user or sign in.
	- On successful login the server returns a token. The client stores the token in `localStorage` under `sessionToken` and redirects to `/`.

Startup (copy-paste)
--------------------

From the project root run:

```bash
# install dependencies (already done in CI):
npm install

# start server (defaults to port 3000):
npm start

# optionally start on a different port:
PORT=4000 npm start
```

Run smoke test (starts server unless SKIP_START=true):

```bash
# run the built-in smoke test (it will start the server unless SKIP_START is set):
npm run smoke-test

# if you already started the server separately, prevent the script from starting it again:
SKIP_START=true npm run smoke-test
```

Notes about environment and logs
------------------------------

- Default server port: `3000` (override with `PORT` env var)
- Logs: the append-only validation log is at `logs/validation.log`
- DB files: `db/users.json` and `db/sessions.json`

Notes:

Docker / Local container
------------------------

You can build and run the application in a Docker container locally.

Build and run with Docker:

```bash
# build image
docker build -t authenticator-local .

# run (maps port 3000)
docker run -p 3000:3000 -v $(pwd)/db:/usr/src/app/db -v $(pwd)/logs:/usr/src/app/logs authenticator-local
```

Using docker-compose (recommended for development):

```bash
docker-compose up --build
```

CI: there's a GitHub Actions workflow `.github/workflows/docker-smoke-test.yml` that builds the Docker image, runs it, waits for readiness, and executes the smoke test.

Deployment — full step-by-step
------------------------------

This section collects all the commands and notes someone needs to deploy and validate the application locally (Node or Docker) and what the CI workflow does.

Prerequisites
- Git checkout of this repository
- Node.js (for local Node runs and for running the smoke test locally)
- Docker and docker-compose (for container runs)

1) Quick local (Node)

```bash
# install dependencies
npm install

# start server (defaults to port 3000)
npm start

# open http://localhost:3000
```

2) Build and run in Docker

Notes: we include a Dockerfile that runs `server.js`. The container exposes 3000 by default. We recommend mounting `./db` and `./logs` so data and logs persist on the host.

```bash
# build the image
docker build -t authenticator-local .

# run the container (detached), map ports and mount volumes
docker run -d --name authenticator-local -p 3000:3000 \
	-v $(pwd)/db:/usr/src/app/db \
	-v $(pwd)/logs:/usr/src/app/logs \
	authenticator-local

# check logs
docker logs -f authenticator-local

# stop and remove
docker rm -f authenticator-local
```

Override the listening port inside the container if required:

```bash
docker run -d --name authenticator-local -p 4000:4000 -e PORT=4000 \
	-v $(pwd)/db:/usr/src/app/db \
	-v $(pwd)/logs:/usr/src/app/logs \
	authenticator-local
```

3) Using docker-compose (recommended for local development)

```bash
# build and start in the foreground
docker-compose up --build

# run in background
docker-compose up -d --build

# stop and remove
docker-compose down
```

4) Running the smoke test against a running container

The `scripts/smokeTest.js` script is used by CI and can be used locally. If the container is already running, prevent the smoke test script from starting another server by setting `SKIP_START=true`.

```bash
# if container already running
SKIP_START=true npm run smoke-test

# if you want the smoke test script to start the server itself (local Node run)
npm run smoke-test
```

5) What the GitHub Actions workflow does

- Workflow file: `.github/workflows/docker-smoke-test.yml` (this repo)
- Steps performed by the workflow:
	1. checkout the repo
	2. set up Docker buildx
	3. docker build -t authenticator-local:ci .
	4. docker run the container (binds repo `db/` and `logs/` into the container)
	5. wait for HTTP readiness at `http://localhost:3000/`
	6. run `npm ci` and `npm run smoke-test` with `SKIP_START=true`
	7. tear down the container

6) Troubleshooting & tips

- If the container fails to start due to permission errors on mounted volumes, ensure the `db/` and `logs/` directories exist and are writable by your Docker host user:

```bash
mkdir -p db logs
chmod 755 db logs
```

- If `port 3000` is in use on your host, use `-p HOST_PORT:CONTAINER_PORT` with `PORT` environment variable in the container (see examples above).
- To inspect running containers:

```bash
docker ps
docker logs <container-name>
```

7) Cleanup commands

```bash
# stop and remove a named container
docker rm -f authenticator-local || true

# remove the built image
docker rmi authenticator-local || true
```

8) Security reminder

- Mounting `./db` and `./logs` into a container means those host files are readable/writable by the container. Treat them as sensitive.
- This demo uses file-based JSON storage. For production use a managed database and implement HTTPS, better session management, and RBAC.

If you want, I can also:
- Add a small `Makefile` with targets for `make build`, `make up`, `make smoke-test`, and `make clean` to make these steps even easier.


Run walkthrough (exact commands we used)
-------------------------------------

These are the precise steps and commands used during development and debugging in this repository. Paste the commands into a terminal (zsh/bash) from the project root.

1) Check if port 3000 is in use and (if needed) stop the local process:

```bash
# show process listening on 3000
lsof -i :3000 -sTCP:LISTEN -n -P || true

# if a local node process is running, stop it (replace <PID> with the PID shown above)
kill <PID> || true

# re-check
lsof -i :3000 -sTCP:LISTEN -n -P || true
```

2) Build the node Docker image we use here (explicit name):

```bash
docker build -t authenticator-node:local -f Dockerfile .
```

3) Run the container (detached) with host `db/` and `logs/` mounted:

```bash
docker run -d --name authenticator-node -p 3000:3000 \
	-v $(pwd)/db:/usr/src/app/db \
	-v $(pwd)/logs:/usr/src/app/logs \
	authenticator-node:local
```

4) Wait for readiness (poll the root URL up to ~30s):

```bash
for i in {1..30}; do
	if curl -sSf http://localhost:3000/ >/dev/null 2>&1; then echo ready && break; fi
	sleep 1
done
```

5) Inspect container logs if readiness doesn't succeed:

```bash
docker logs authenticator-node --tail 200
```

6) Run the smoke test against the running container (prevents the test script from starting a server):

```bash
SKIP_START=true npm run smoke-test
```

7) Cleanup (stop and remove container, remove image):

```bash
docker rm -f authenticator-node || true
docker rmi authenticator-node:local || true
```

These commands mirror what was executed during verification and troubleshooting in this repo. If you'd like, I can add a `scripts/run-local.sh` shell helper that performs these steps (with safe prompts) or add a `Makefile` with these targets.


