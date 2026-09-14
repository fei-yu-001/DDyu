package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// TestExampleConfigMatchesSchema 保证仓库中的 config.example.yaml 始终能被当前
// schema 解析，并守住几条安全默认值。
//
// 配置模板是使用者复制的起点：一旦它与配置结构脱节，新部署会在启动时直接失败；
// 一旦它的安全默认值被改坏（例如放开可信代理范围、开启 Swagger），
// 这种问题会沿着模板扩散到每一次部署。
func TestExampleConfigMatchesSchema(t *testing.T) {
	path := filepath.Join("..", "..", "..", "..", "config.example.yaml")
	if _, err := os.Stat(path); err != nil {
		t.Skipf("跳过：未找到配置模板 %s", path)
	}

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("config.example.yaml 无法被当前 schema 解析: %v", err)
	}

	if cfg.Server.SwaggerEnabled {
		t.Error("配置模板不应开启 Swagger：公网部署会暴露完整接口结构")
	}

	if len(cfg.Server.TrustedProxies) == 0 {
		t.Error("配置模板应显式声明 trustedProxies，避免使用者误信任意转发头")
	}
	for _, proxy := range cfg.Server.TrustedProxies {
		trimmed := strings.TrimSpace(proxy)
		if trimmed == "0.0.0.0/0" || trimmed == "::/0" {
			t.Errorf("配置模板出现不受限的可信代理 %q：任何人都能伪造客户端 IP", trimmed)
		}
	}
}
