.PHONY: up test lint migrate

up:
	docker compose up -d postgres redis

migrate:
	go run ./cmd/migrate up

test:
	go test -race -count=1 ./...

lint:
	golangci-lint run
