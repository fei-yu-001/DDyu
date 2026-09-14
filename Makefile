.PHONY: help run build build-linux frontend frontend-dev blog lint vet test tidy swagger check

# 配置文件路径；可用 CONFIG=... 覆盖。
CONFIG ?= $(CURDIR)/config.yaml
# 独立 Go 构建缓存，避免污染全局环境。
GOCACHE_DIR ?= $(CURDIR)/.gocache
# 二进制输出目录（已在 .gitignore 中排除）。
BIN_DIR ?= $(CURDIR)/dist

help:
	@echo "可用目标："
	@echo "  run           本地启动服务（读取 config.yaml）"
	@echo "  build         构建当前平台二进制"
	@echo "  build-linux   交叉编译 linux/amd64 单二进制（用于服务器部署）"
	@echo "  frontend      安装依赖并构建前端产物"
	@echo "  frontend-dev  启动前端开发服务器"
	@echo "  blog          安装依赖并构建博客静态产物（输出到 static/blog）"
	@echo "  check         完整质量闸门：go build + go vet + go test + 前端 lint/build"
	@echo "  test / vet / lint / tidy / swagger"

run:
	cd backend && GOCACHE="$(GOCACHE_DIR)" go run ./cmd/grok2api --config "$(abspath $(CONFIG))" $(RUN_ARGS)

build:
	mkdir -p "$(BIN_DIR)"
	cd backend && GOCACHE="$(GOCACHE_DIR)" go build -trimpath -ldflags "-s -w" -o "$(BIN_DIR)/ddyu-site" ./cmd/grok2api

# 单静态二进制：无 CGO、无运行时依赖，直接丢到服务器即可运行。
build-linux:
	mkdir -p "$(BIN_DIR)"
	cd backend && GOCACHE="$(GOCACHE_DIR)" CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
		go build -trimpath -ldflags "-s -w" -o "$(BIN_DIR)/ddyu-site-linux-amd64" ./cmd/grok2api

frontend:
	cd frontend && pnpm install && pnpm build

frontend-dev:
	cd frontend && pnpm dev

blog:
	cd blog && pnpm install && pnpm build

lint:
	cd frontend && pnpm lint

vet:
	cd backend && GOCACHE="$(GOCACHE_DIR)" go vet ./...

test:
	cd backend && GOCACHE="$(GOCACHE_DIR)" go test ./...

tidy:
	cd backend && GOCACHE="$(GOCACHE_DIR)" go mod tidy

swagger:
	cd backend && GOCACHE="$(GOCACHE_DIR)" go run github.com/swaggo/swag/cmd/swag@v1.16.6 init \
		-g main.go \
		-d cmd/grok2api,internal/transport/http \
		--parseInternal \
		--output docs \
		--outputTypes go,json,yaml

# 每阶段收尾必须全绿，避免裁剪过程中出现编译断裂。
check:
	cd backend && GOCACHE="$(GOCACHE_DIR)" go build ./...
	cd backend && GOCACHE="$(GOCACHE_DIR)" go vet ./...
	cd backend && GOCACHE="$(GOCACHE_DIR)" go test ./...
	cd frontend && pnpm lint
	cd frontend && pnpm build
	cd blog && pnpm install && pnpm build
