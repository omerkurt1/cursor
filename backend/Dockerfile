##############################################################################
# Stage 1 — build
##############################################################################
FROM golang:1.23-alpine AS builder

RUN apk add --no-cache ca-certificates git

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w" \
    -o /server \
    ./cmd/server

##############################################################################
# Stage 2 — minimal runtime (scratch = zero attack surface, ~7 MB image)
##############################################################################
FROM scratch

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /server /server

EXPOSE 8080

ENTRYPOINT ["/server"]
