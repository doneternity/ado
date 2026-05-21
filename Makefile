.PHONY: dev migrate migrate-down sqlc test lint build install-tools

dev:
	docker compose up

migrate:
	cd backend && goose -dir migrations postgres "$$DATABASE_URL" up

migrate-down:
	cd backend && goose -dir migrations postgres "$$DATABASE_URL" down

sqlc:
	cd backend && sqlc generate

test:
	cd backend && go test -race ./...
	cd frontend && npm test -- --run

lint:
	cd backend && go vet ./... && golangci-lint run
	cd frontend && npm run lint && npm run typecheck

install-tools:
	go install github.com/pressly/goose/v3/cmd/goose@latest
	go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
	go install github.com/air-verse/air@latest

build:
	docker build -t ado:local .
