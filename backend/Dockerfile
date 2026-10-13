FROM golang:1.26.2-alpine AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags="-s -w" \
    -o /main .

FROM alpine:3.22

RUN addgroup -S app && adduser -S -G app app \
    && apk add --no-cache ca-certificates

WORKDIR /app

COPY --from=builder /main .

USER app

EXPOSE 8080

ENTRYPOINT ["/app/main"]
