# ── Stage 1: build frontend ──
FROM node:20-alpine AS web-builder
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

# ── Stage 2: build go binary ──
FROM golang:1.25-alpine AS api-builder
WORKDIR /api
RUN apk add --no-cache git
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api
RUN go install github.com/pressly/goose/v3/cmd/goose@latest

# ── Stage 3: assemble final image ──
FROM nginx:alpine
RUN apk add --no-cache ca-certificates tzdata

COPY nginx/nginx.conf /etc/nginx/nginx.conf

COPY --from=web-builder /web/dist /app/dist

COPY --from=api-builder /out/api /app/api
COPY --from=api-builder /go/bin/goose /usr/local/bin/goose
COPY backend/migrations /app/migrations

COPY scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080
CMD ["/entrypoint.sh"]
