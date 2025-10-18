IMAGE_NAME ?= authenticator-node:local
CONTAINER_NAME ?= authenticator-node
PORT ?= 3000

.PHONY: build run up logs smoke clean

build:
	docker build -t $(IMAGE_NAME) -f Dockerfile .

run: build
	docker run -d --name $(CONTAINER_NAME) -p $(PORT):$(PORT) \
		-v $(PWD)/db:/usr/src/app/db \
		-v $(PWD)/logs:/usr/src/app/logs \
		-e PORT=$(PORT) $(IMAGE_NAME)

up: build
	docker-compose up --build

logs:
	docker logs -f $(CONTAINER_NAME)

smoke:
	SKIP_START=true npm run smoke-test

clean:
	docker rm -f $(CONTAINER_NAME) || true
	docker rmi $(IMAGE_NAME) || true
