package relational

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/chenyme/grok2api/backend/internal/domain/account"
	modeldomain "github.com/chenyme/grok2api/backend/internal/domain/model"
)

func TestModelNamespaceMigrationPreservesAliasesRouteIDsAndKeyPermissions(t *testing.T) {
	ctx := context.Background()
	database := openTestDatabase(t)
	now := time.Now().UTC()
	build := modelRouteModel{
		PublicID: "grok-4.3", Provider: string(account.ProviderBuild), UpstreamModel: "grok-4.3",
		Capability: string(modeldomain.CapabilityResponses), Origin: string(modeldomain.OriginDiscovered), Enabled: true,
	}
	web := modelRouteModel{
		PublicID: "grok-4.3-web", Provider: string(account.ProviderWeb), UpstreamModel: "grok-4.3",
		Capability: string(modeldomain.CapabilityResponses), Origin: string(modeldomain.OriginCatalog), Enabled: true,
	}
	if err := database.db.WithContext(ctx).Create(&build).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.db.WithContext(ctx).Create(&web).Error; err != nil {
		t.Fatal(err)
	}
	key := clientKeyModel{
		Name: "namespace-migration", Prefix: "namespace", SecretHash: strings.Repeat("a", 64), EncryptedSecret: "encrypted",
		Enabled: true, RPMLimit: 60, MaxConcurrent: 4, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.db.WithContext(ctx).Create(&key).Error; err != nil {
		t.Fatal(err)
	}
	if err := database.db.WithContext(ctx).Create(&clientKeyModelPermission{ClientKeyID: key.ID, ModelRouteID: web.ID}).Error; err != nil {
		t.Fatal(err)
	}

	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	repository := NewModelRepository(database)
	buildAfter, err := repository.GetByPublicIDIncludingDisabled(ctx, "Build/grok-4.3")
	if err != nil || buildAfter.ID != build.ID {
		t.Fatalf("build route after migration = %#v, err = %v", buildAfter, err)
	}
	legacyBuild, err := repository.GetByPublicIDIncludingDisabled(ctx, "grok-4.3")
	if err != nil || legacyBuild.ID != build.ID {
		t.Fatalf("legacy Build alias = %#v, err = %v", legacyBuild, err)
	}
	webAfter, err := repository.GetByPublicIDIncludingDisabled(ctx, "Web/grok-4.3-web")
	if err != nil || webAfter.ID != web.ID {
		t.Fatalf("web route after migration = %#v, err = %v", webAfter, err)
	}
	if err := repository.ReplaceProviderRoutes(ctx, account.ProviderWeb, []modeldomain.Route{{
		PublicID: "Web/grok-4.3", Provider: account.ProviderWeb, UpstreamModel: "grok-4.3",
		Capability: modeldomain.CapabilityResponses, Enabled: true,
	}}); err != nil {
		t.Fatal(err)
	}
	webAfter, err = repository.GetByPublicIDIncludingDisabled(ctx, "Web/grok-4.3")
	if err != nil || webAfter.ID != web.ID {
		t.Fatalf("canonical Web route = %#v, err = %v", webAfter, err)
	}
	for _, alias := range []string{"grok-4.3-web", "Web/grok-4.3-web"} {
		value, lookupErr := repository.GetByPublicIDIncludingDisabled(ctx, alias)
		if lookupErr != nil || value.ID != web.ID {
			t.Fatalf("Web alias %q = %#v, err = %v", alias, value, lookupErr)
		}
	}
	var permission clientKeyModelPermission
	if err := database.db.WithContext(ctx).Where("client_key_id = ? AND model_route_id = ?", key.ID, web.ID).First(&permission).Error; err != nil {
		t.Fatalf("client-key permission did not survive model rename: %v", err)
	}
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatalf("namespace migration is not idempotent: %v", err)
	}
}

func TestModelNamespaceMigrationSkipsStrippedProviderRoutes(t *testing.T) {
	ctx := context.Background()
	database := openTestDatabase(t)

	// 存量库里可能留有已剥离渠道（Console）的历史目录路由。这类行已经没有任何
	// 可用的 Provider 命名空间，无法规范化；迁移必须跳过它们，否则会早于启动
	// 装配阶段的 ReplaceProviderRoutes(provider, nil) 清理而中止整个启动。
	stale := modelRouteModel{
		PublicID: "Console/grok-4.3", Provider: string(account.ProviderConsole), UpstreamModel: "grok-4.3",
		Capability: string(modeldomain.CapabilityResponses), Origin: string(modeldomain.OriginCatalog), Enabled: true,
	}
	if err := database.db.WithContext(ctx).Create(&stale).Error; err != nil {
		t.Fatal(err)
	}

	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatalf("namespace migration must tolerate stripped providers: %v", err)
	}

	// 启动装配阶段用空目录覆盖已剥离渠道，残留路由应被清掉。
	repository := NewModelRepository(database)
	if err := repository.ReplaceProviderRoutes(ctx, account.ProviderConsole, nil); err != nil {
		t.Fatal(err)
	}
	var remaining int64
	if err := database.db.WithContext(ctx).Model(&modelRouteModel{}).
		Where("provider = ?", account.ProviderConsole).Count(&remaining).Error; err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatalf("stale stripped-provider routes survive cleanup: %d", remaining)
	}
}
