package relational

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/chenyme/grok2api/backend/internal/domain/account"
	"github.com/chenyme/grok2api/backend/internal/domain/media"
	"github.com/chenyme/grok2api/backend/internal/repository"
)

func TestReconcileProviderLinksUsesOnlyHighConfidenceIdentity(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "account-links.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	repo := NewAccountRepository(database)
	digest := strings.Repeat("a", 64)
	identity := "sso_" + digest[:32]
	web := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "web", SourceKey: "sso:" + digest,
		UserID: "user-1", EgressIdentity: identity,
	})
	nsfwEnabledAt := time.Date(2026, 7, 18, 12, 0, 0, 0, time.UTC)
	if err := repo.MarkWebNSFWEnabled(ctx, web.ID, nsfwEnabledAt); err != nil {
		t.Fatal(err)
	}
	if err := repo.MarkWebTermsAccepted(ctx, web.ID, account.CurrentWebTermsVersion, nsfwEnabledAt); err != nil {
		t.Fatal(err)
	}
	build := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "build", SourceKey: "build-1", UserID: "user-1",
	})
	for _, id := range []uint64{build.ID, web.ID} {
		if err := repo.ReconcileProviderLinks(ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	web, err = repo.Get(ctx, web.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(web.LinkedAccounts) != 1 || web.LinkedAccounts[0].Provider != account.ProviderBuild {
		t.Fatalf("web links = %#v", web.LinkedAccounts)
	}
	build, err = repo.Get(ctx, build.ID)
	if err != nil {
		t.Fatal(err)
	}
	if build.EgressIdentity != identity || web.EgressIdentity != identity {
		t.Fatalf("egress identities web=%q build=%q", web.EgressIdentity, build.EgressIdentity)
	}
	if web.WebNSFWEnabledAt == nil || build.WebNSFWEnabledAt == nil || !web.WebNSFWEnabledAt.Equal(nsfwEnabledAt) || !build.WebNSFWEnabledAt.Equal(nsfwEnabledAt) {
		t.Fatalf("shared NSFW markers web=%v build=%v", web.WebNSFWEnabledAt, build.WebNSFWEnabledAt)
	}
	if web.WebTermsAcceptedAt == nil || build.WebTermsAcceptedAt == nil || !web.WebTermsAcceptedAt.Equal(nsfwEnabledAt) || !build.WebTermsAcceptedAt.Equal(nsfwEnabledAt) {
		t.Fatalf("shared terms markers web=%v build=%v", web.WebTermsAcceptedAt, build.WebTermsAcceptedAt)
	}
	if web.WebTermsAcceptedVersion != account.CurrentWebTermsVersion || build.WebTermsAcceptedVersion != account.CurrentWebTermsVersion {
		t.Fatalf("shared terms versions web=%d build=%d", web.WebTermsAcceptedVersion, build.WebTermsAcceptedVersion)
	}
	if build.LinkedAccountID != web.ID || build.LinkedProvider != account.ProviderWeb {
		t.Fatalf("reverse links build=%#v", build.LinkedAccounts)
	}
	for _, provider := range []account.Provider{account.ProviderWeb, account.ProviderBuild} {
		values, listErr := repo.ListEnabled(ctx, provider)
		if listErr != nil {
			t.Fatal(listErr)
		}
		if len(values) != 1 || values[0].EgressIdentity != identity {
			t.Fatalf("routing identities for %s = %#v", provider, values)
		}
	}
	if _, err := repo.UpdateTokens(ctx, web.ID, "rotated-encrypted-token", "", time.Time{}, 0); err != nil {
		t.Fatal(err)
	}
	web, err = repo.Get(ctx, web.ID)
	if err != nil || web.EgressIdentity != identity {
		t.Fatalf("token update changed egress identity: %q err=%v", web.EgressIdentity, err)
	}

	emailWeb := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "email-web", SourceKey: "sso:" + strings.Repeat("b", 64), Email: "same@example.com",
	})
	_ = createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "email-build", SourceKey: "email-build", Email: "same@example.com",
	})
	if err := repo.ReconcileProviderLinks(ctx, emailWeb.ID); err != nil {
		t.Fatal(err)
	}
	emailWeb, err = repo.Get(ctx, emailWeb.ID)
	if err != nil || len(emailWeb.LinkedAccounts) != 0 {
		t.Fatalf("email-only account was linked: %#v err=%v", emailWeb.LinkedAccounts, err)
	}

	multiWeb := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "multi-web", SourceKey: "sso:" + strings.Repeat("d", 64), UserID: "shared-user",
	})
	for _, teamID := range []string{"team-a", "team-b"} {
		_ = createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
			Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "multi-" + teamID, SourceKey: "multi-" + teamID, UserID: "shared-user", TeamID: teamID,
		})
	}
	if err := repo.ReconcileProviderLinks(ctx, multiWeb.ID); err != nil {
		t.Fatal(err)
	}
	multiWeb, err = repo.Get(ctx, multiWeb.ID)
	if err != nil || len(multiWeb.LinkedAccounts) != 0 {
		t.Fatalf("ambiguous user was linked: %#v err=%v", multiWeb.LinkedAccounts, err)
	}

	if err := repo.Delete(ctx, web.ID); err != nil {
		t.Fatal(err)
	}
	build, buildErr := repo.Get(ctx, build.ID)
	if buildErr != nil || len(build.LinkedAccounts) != 0 {
		t.Fatalf("deleting Web affected linked account: build=%#v/%v", build, buildErr)
	}
}

func TestInitializeSchemaBackfillsStableWebEgressIdentity(t *testing.T) {
	ctx := context.Background()
	database, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "legacy-account-links.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	repo := NewAccountRepository(database)
	digest := strings.Repeat("c", 64)
	web := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "legacy-web", SourceKey: "sso:" + digest,
		FailureCount: 3, LastError: "preserve-me",
	})
	build := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "legacy-build", SourceKey: "legacy-build",
	})
	if err := repo.LinkWebToBuild(ctx, web.ID, build.ID); err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	if err := repo.SaveQuotaWindows(ctx, web.ID, account.WebTierAuto, now, []account.QuotaWindow{{
		AccountID: web.ID, Mode: "weekly", Remaining: 7, Total: 10, WindowSeconds: 3600, SyncedAt: &now, Source: account.QuotaSourceUpstream,
	}}); err != nil {
		t.Fatal(err)
	}
	if err := database.db.Migrator().DropConstraint(&webAccountProfileModel{}, "chk_web_account_profiles_egress_identity"); err != nil {
		t.Fatal(err)
	}
	if err := database.db.Migrator().DropColumn(&webAccountProfileModel{}, "EgressIdentity"); err != nil {
		t.Fatal(err)
	}
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatalf("migration is not idempotent: %v", err)
	}
	web, err = repo.Get(ctx, web.ID)
	if err != nil {
		t.Fatal(err)
	}
	build, err = repo.Get(ctx, build.ID)
	if err != nil {
		t.Fatal(err)
	}
	windows, err := repo.GetQuotaWindows(ctx, []uint64{web.ID})
	if err != nil {
		t.Fatal(err)
	}
	wantIdentity := "sso_" + digest[:32]
	if web.EgressIdentity != wantIdentity || build.EgressIdentity != wantIdentity || web.FailureCount != 3 || web.LastError != "preserve-me" || len(windows[web.ID]) != 1 || windows[web.ID][0].Remaining != 7 {
		t.Fatalf("migration result web=%#v buildIdentity=%q windows=%#v", web, build.EgressIdentity, windows[web.ID])
	}
}

func createLinkedAccountTestCredential(t *testing.T, ctx context.Context, repo *AccountRepository, value account.Credential) account.Credential {
	t.Helper()
	value.EncryptedAccessToken = "encrypted"
	value.Enabled = true
	value.AuthStatus = account.AuthStatusActive
	value.Priority = account.DefaultPriority
	value.MaxConcurrent = account.DefaultMaxConcurrent
	stored, _, err := repo.UpsertByIdentity(ctx, value)
	if err != nil {
		t.Fatal(err)
	}
	return stored
}

func TestResolveLinkedDeleteIDsWebAndTwoHop(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "linked-delete-resolve.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	repo := NewAccountRepository(database)

	webLinked := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "web-linked", SourceKey: "sso:" + strings.Repeat("e", 64), UserID: "u-link",
	})
	build := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "build-linked", SourceKey: "build-link", UserID: "u-link",
	})
	if err := repo.LinkWebToBuild(ctx, webLinked.ID, build.ID); err != nil {
		t.Fatal(err)
	}
	if err := repo.ReconcileProviderLinks(ctx, webLinked.ID); err != nil {
		t.Fatal(err)
	}
	webOnly := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "web-only", SourceKey: "sso:" + strings.Repeat("f", 64),
	})
	// Same email as webLinked's potential peers but no link rows for this web.
	_ = createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "email-build", SourceKey: "email-build-only", Email: "same@example.com",
	})

	// Web no targets → roots only
	res, err := repo.ResolveLinkedDeleteIDs(ctx, account.ProviderWeb, []uint64{webLinked.ID, webOnly.ID}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(res.FinalIDs) != 2 || res.LinkedByProvider[account.ProviderBuild] != 0 {
		t.Fatalf("no targets resolution = %#v", res)
	}

	// Web + build only
	res, err = repo.ResolveLinkedDeleteIDs(ctx, account.ProviderWeb, []uint64{webLinked.ID, webOnly.ID}, []account.Provider{account.ProviderBuild})
	if err != nil {
		t.Fatal(err)
	}
	if res.LinkedByProvider[account.ProviderBuild] != 1 || !containsID(res.FinalIDs, build.ID) {
		t.Fatalf("web+build = %#v", res)
	}

	// Build 作为根可以反向展开到 Web
	res, err = repo.ResolveLinkedDeleteIDs(ctx, account.ProviderBuild, []uint64{build.ID}, []account.Provider{account.ProviderWeb})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.FinalIDs) != 2 || !containsID(res.FinalIDs, build.ID) || !containsID(res.FinalIDs, webLinked.ID) {
		t.Fatalf("build+web = %#v", res)
	}

	// Target includes current provider → error
	if _, err := repo.ResolveLinkedDeleteIDs(ctx, account.ProviderWeb, []uint64{webOnly.ID}, []account.Provider{account.ProviderWeb}); err == nil {
		t.Fatal("expected error when target includes current provider")
	}

	// Duplicate root IDs collapse
	res, err = repo.ResolveLinkedDeleteIDs(ctx, account.ProviderWeb, []uint64{webLinked.ID, webLinked.ID}, []account.Provider{account.ProviderBuild})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.RootIDs) != 1 || res.RootIDs[0] != webLinked.ID {
		t.Fatalf("dedup roots = %#v", res.RootIDs)
	}

	// Email-only peer must not be pulled in
	res, err = repo.ResolveLinkedDeleteIDs(ctx, account.ProviderWeb, []uint64{webOnly.ID}, []account.Provider{account.ProviderBuild})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.FinalIDs) != 1 || res.FinalIDs[0] != webOnly.ID || res.LinkedByProvider[account.ProviderBuild] != 0 {
		t.Fatalf("email-only must not expand = %#v", res)
	}

	// Invalid target provider
	if _, err := repo.ResolveLinkedDeleteIDs(ctx, account.ProviderWeb, []uint64{webOnly.ID}, []account.Provider{account.Provider("nope")}); err == nil {
		t.Fatal("expected invalid target error")
	}
}

func TestResolveLinkedDeleteIDsBuildWithoutWeb(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "linked-delete-orphan-build.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	repo := NewAccountRepository(database)
	build := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "orphan-build", SourceKey: "orphan-build",
	})
	res, err := repo.ResolveLinkedDeleteIDs(ctx, account.ProviderBuild, []uint64{build.ID}, []account.Provider{account.ProviderWeb})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.FinalIDs) != 1 || res.FinalIDs[0] != build.ID {
		t.Fatalf("unlinked build expand = %#v", res)
	}
}

func TestDeleteManyRejectsWhenLinkedPeerHasActiveMediaJob(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "linked-delete-media.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	repo := NewAccountRepository(database)
	digest := strings.Repeat("m", 64)
	web := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "web-media", SourceKey: "sso:" + digest, UserID: "u-media",
	})
	build := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "build-media", SourceKey: "build-media", UserID: "u-media",
	})
	if err := repo.LinkWebToBuild(ctx, web.ID, build.ID); err != nil {
		t.Fatal(err)
	}
	resolution, err := repo.ResolveLinkedDeleteIDs(ctx, account.ProviderWeb, []uint64{web.ID}, []account.Provider{account.ProviderBuild})
	if err != nil {
		t.Fatal(err)
	}
	if len(resolution.FinalIDs) != 2 {
		t.Fatalf("resolution = %#v", resolution)
	}

	key := clientKeyModel{Name: "linked-media-key", Prefix: "linked-media-key", SecretHash: testSecretHash, EncryptedSecret: testEncryptedToken, Enabled: true, RPMLimit: 60, MaxConcurrent: 4}
	if err := database.db.WithContext(ctx).Create(&key).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	accountID := build.ID
	job := mediaJobModel{
		ID: "media_job_linked_peer", RequestID: "req_linked_peer",
		ClientKeyID: key.ID, ClientKeyName: "key", AccountID: &accountID, AccountName: "build-media",
		EgressScope: "grok_build", EgressMode: "direct", Provider: string(account.ProviderBuild),
		Model: "video", ModelRouteID: 1, UpstreamModel: "video", Prompt: "x", Seconds: 1, Size: "16:9",
		Quality: "720p", Status: string(media.StatusInProgress), Progress: 10, InputJSON: "{}",
		CreatedAt: now, UpdatedAt: now,
	}
	if err := database.db.WithContext(ctx).Create(&job).Error; err != nil {
		t.Fatal(err)
	}
	if _, err := repo.DeleteMany(ctx, resolution.FinalIDs); err == nil {
		t.Fatal("expected active media job on peer to block delete")
	}
	if _, err := repo.Get(ctx, web.ID); err != nil {
		t.Fatalf("web should remain after blocked linked delete: %v", err)
	}
	if _, err := repo.Get(ctx, build.ID); err != nil {
		t.Fatalf("build should remain after blocked linked delete: %v", err)
	}
}

func TestDeleteManyWithLinkedAtomicWebBothAndMediaBlock(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "linked-delete-atomic.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	repo := NewAccountRepository(database)
	digest := strings.Repeat("z", 64)
	web := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "web-atomic", SourceKey: "sso:" + digest, UserID: "u-atomic",
	})
	build := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "build-atomic", SourceKey: "build-atomic", UserID: "u-atomic",
	})
	if err := repo.LinkWebToBuild(ctx, web.ID, build.ID); err != nil {
		t.Fatal(err)
	}
	if err := repo.ReconcileProviderLinks(ctx, web.ID); err != nil {
		t.Fatal(err)
	}

	outcome, err := repo.DeleteManyWithLinked(ctx, account.ProviderWeb, []uint64{web.ID}, []account.Provider{account.ProviderBuild}, false)
	if err != nil {
		t.Fatal(err)
	}
	if outcome.Deleted != 2 || len(outcome.Resolution.FinalIDs) != 2 || outcome.RootsDeleted != 1 {
		t.Fatalf("outcome=%#v", outcome)
	}
	if outcome.LinkedDeletedByProvider[account.ProviderBuild] != 1 {
		t.Fatalf("linked by provider = %#v", outcome.LinkedDeletedByProvider)
	}
	if _, err := repo.Get(ctx, web.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("web should be gone: %v", err)
	}
	if _, err := repo.Get(ctx, build.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("build should be gone: %v", err)
	}

	// Media block path
	digest2 := strings.Repeat("y", 64)
	web2 := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "web-media2", SourceKey: "sso:" + digest2, UserID: "u-media2",
	})
	build2 := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "build-media2", SourceKey: "build-media2", UserID: "u-media2",
	})
	if err := repo.LinkWebToBuild(ctx, web2.ID, build2.ID); err != nil {
		t.Fatal(err)
	}
	key := clientKeyModel{Name: "atomic-media-key", Prefix: "atomic-media-key", SecretHash: testSecretHash, EncryptedSecret: testEncryptedToken, Enabled: true, RPMLimit: 60, MaxConcurrent: 4}
	if err := database.db.WithContext(ctx).Create(&key).Error; err != nil {
		t.Fatal(err)
	}
	now := time.Now().UTC()
	accountID := build2.ID
	job := mediaJobModel{
		ID: "media_job_atomic", RequestID: "req_atomic",
		ClientKeyID: key.ID, ClientKeyName: "key", AccountID: &accountID, AccountName: "build-media2",
		EgressScope: "grok_build", EgressMode: "direct", Provider: string(account.ProviderBuild),
		Model: "video", ModelRouteID: 1, UpstreamModel: "video", Prompt: "x", Seconds: 1, Size: "16:9",
		Quality: "720p", Status: string(media.StatusInProgress), Progress: 10, InputJSON: "{}",
		CreatedAt: now, UpdatedAt: now,
	}
	if err := database.db.WithContext(ctx).Create(&job).Error; err != nil {
		t.Fatal(err)
	}
	// Single-delete mode rejects the entire operation when a peer has an active media job.
	if _, err := repo.DeleteManyWithLinked(ctx, account.ProviderWeb, []uint64{web2.ID}, []account.Provider{account.ProviderBuild}, false); err == nil {
		t.Fatal("expected media job to block DeleteManyWithLinked")
	}
	if _, err := repo.Get(ctx, web2.ID); err != nil {
		t.Fatalf("web2 should remain: %v", err)
	}
	if _, err := repo.Get(ctx, build2.ID); err != nil {
		t.Fatalf("build2 should remain: %v", err)
	}

	// Batch mode skips the complete blocked root group and deletes all other groups.
	digest3 := strings.Repeat("x", 64)
	web3 := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "web-clean3", SourceKey: "sso:" + digest3, UserID: "u-clean3",
	})
	build3 := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "build-clean3", SourceKey: "build-clean3", UserID: "u-clean3",
	})
	if err := repo.LinkWebToBuild(ctx, web3.ID, build3.ID); err != nil {
		t.Fatal(err)
	}
	skipOutcome, err := repo.DeleteManyWithLinked(ctx, account.ProviderWeb, []uint64{web2.ID, web3.ID}, []account.Provider{account.ProviderBuild}, true)
	if err != nil {
		t.Fatal(err)
	}
	if skipOutcome.Deleted != 2 || skipOutcome.RootsDeleted != 1 || len(skipOutcome.SkippedRoots) != 1 || skipOutcome.SkippedRoots[0] != web2.ID {
		t.Fatalf("skip outcome = %#v", skipOutcome)
	}
	if _, err := repo.Get(ctx, web2.ID); err != nil {
		t.Fatalf("media group web2 should be skipped: %v", err)
	}
	if _, err := repo.Get(ctx, build2.ID); err != nil {
		t.Fatalf("media group build2 should be skipped: %v", err)
	}
	if _, err := repo.Get(ctx, web3.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("web3 should be deleted: %v", err)
	}
	if _, err := repo.Get(ctx, build3.ID); !errors.Is(err, repository.ErrNotFound) {
		t.Fatalf("build3 should be deleted: %v", err)
	}
}

// Cleanup batches select roots by state, expand links, skip media groups, and advance the cursor.
func TestDeleteAccountStatusBatchWithLinkedCursorAndSkip(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "cleanup-linked-batch.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	repo := NewAccountRepository(database)
	now := time.Now().UTC()

	disable := func(id uint64) {
		if err := database.db.WithContext(ctx).Model(&accountModel{}).Where("id = ?", id).Update("enabled", false).Error; err != nil {
			t.Fatal(err)
		}
	}

	// Seed three disabled Web-Build groups and one active Web account that must not be selected.
	type trio struct{ web, build uint64 }
	var trios []trio
	for i := 0; i < 3; i++ {
		digest := strings.Repeat(string(rune('a'+i)), 64)
		web := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
			Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: fmt.Sprintf("cl-web-%d", i), SourceKey: "sso:" + digest, UserID: fmt.Sprintf("cl-%d", i),
		})
		build := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
			Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: fmt.Sprintf("cl-build-%d", i), SourceKey: fmt.Sprintf("cl-build-%d", i), UserID: fmt.Sprintf("cl-%d", i),
		})
		if err := repo.LinkWebToBuild(ctx, web.ID, build.ID); err != nil {
			t.Fatal(err)
		}
		disable(web.ID)
		trios = append(trios, trio{web.ID, build.ID})
	}
	activeWeb := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{
		Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "cl-active", SourceKey: "sso:" + strings.Repeat("d", 64),
	})

	// Attach an active media job to the first Build account so its group is skipped.
	key := clientKeyModel{Name: "cl-media-key", Prefix: "cl-media-key", SecretHash: testSecretHash, EncryptedSecret: testEncryptedToken, Enabled: true, RPMLimit: 60, MaxConcurrent: 4}
	if err := database.db.WithContext(ctx).Create(&key).Error; err != nil {
		t.Fatal(err)
	}
	blockedBuild := trios[0].build
	job := mediaJobModel{
		ID: "media_job_cleanup", RequestID: "req_cleanup",
		ClientKeyID: key.ID, ClientKeyName: "key", AccountID: &blockedBuild, AccountName: "cl-build-0",
		EgressScope: "grok_build", EgressMode: "direct", Provider: string(account.ProviderBuild),
		Model: "video", ModelRouteID: 1, UpstreamModel: "video", Prompt: "x", Seconds: 1, Size: "16:9",
		Quality: "720p", Status: string(media.StatusQueued), Progress: 0, InputJSON: "{}",
		CreatedAt: now, UpdatedAt: now,
	}
	if err := database.db.WithContext(ctx).Create(&job).Error; err != nil {
		t.Fatal(err)
	}

	// With limit=2, the first batch skips group 0 and deletes group 1; the second deletes group 2.
	targets := []account.Provider{account.ProviderBuild}
	outcome1, candidates1, maxID1, err := repo.DeleteAccountStatusBatchWithLinked(ctx, account.ProviderWeb, "disabled", now, 0, 2, targets)
	if err != nil {
		t.Fatal(err)
	}
	if candidates1 != 2 || outcome1.Deleted != 2 || outcome1.RootsDeleted != 1 || len(outcome1.SkippedRoots) != 1 {
		t.Fatalf("batch1 outcome=%#v candidates=%d", outcome1, candidates1)
	}
	outcome2, candidates2, _, err := repo.DeleteAccountStatusBatchWithLinked(ctx, account.ProviderWeb, "disabled", now, maxID1, 2, targets)
	if err != nil {
		t.Fatal(err)
	}
	if candidates2 != 1 || outcome2.Deleted != 2 || outcome2.RootsDeleted != 1 || len(outcome2.SkippedRoots) != 0 {
		t.Fatalf("batch2 outcome=%#v candidates=%d", outcome2, candidates2)
	}
	// The skipped group and active account remain; both accounts in the other groups are gone.
	if _, err := repo.Get(ctx, trios[0].web); err != nil {
		t.Fatalf("skipped web should remain: %v", err)
	}
	if _, err := repo.Get(ctx, trios[0].build); err != nil {
		t.Fatalf("skipped build should remain: %v", err)
	}
	for _, index := range []int{1, 2} {
		if _, err := repo.Get(ctx, trios[index].web); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("web %d should be deleted: %v", index, err)
		}
		if _, err := repo.Get(ctx, trios[index].build); !errors.Is(err, repository.ErrNotFound) {
			t.Fatalf("build %d should be deleted: %v", index, err)
		}
	}
	if _, err := repo.Get(ctx, activeWeb.ID); err != nil {
		t.Fatalf("active web should remain: %v", err)
	}
}

// Cleanup preview counts roots by state and linked peers across one-hop and two-hop paths.
func TestCountCleanupWithLinked(t *testing.T) {
	t.Parallel()
	ctx := context.Background()
	database, err := OpenSQLite(ctx, filepath.Join(t.TempDir(), "cleanup-preview.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Close() })
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	repo := NewAccountRepository(database)
	now := time.Now().UTC()

	setStatus := func(id uint64, updates map[string]any) {
		if err := database.db.WithContext(ctx).Model(&accountModel{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			t.Fatal(err)
		}
	}

	// Seed a disabled Web with a Build peer, an unlinked reauth Web, an orphaned cooldown Web, and an active Web-Build pair.
	digestA := strings.Repeat("p", 64)
	webA := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "pv-a", SourceKey: "sso:" + digestA, UserID: "pv-a"})
	buildA := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "pv-a-build", SourceKey: "pv-a-build", UserID: "pv-a"})
	if err := repo.LinkWebToBuild(ctx, webA.ID, buildA.ID); err != nil {
		t.Fatal(err)
	}
	if err := repo.ReconcileProviderLinks(ctx, webA.ID); err != nil {
		t.Fatal(err)
	}
	setStatus(webA.ID, map[string]any{"enabled": false})

	webB := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "pv-b", SourceKey: "sso:" + strings.Repeat("q", 64)})
	setStatus(webB.ID, map[string]any{"auth_status": "reauthRequired"})

	digestC := strings.Repeat("r", 64)
	webC := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "pv-c", SourceKey: "sso:" + digestC, UserID: "pv-c"})
	if err := repo.ReconcileProviderLinks(ctx, webC.ID); err != nil {
		t.Fatal(err)
	}
	setStatus(webC.ID, map[string]any{"cooldown_until": now.Add(time.Hour)})

	digestD := strings.Repeat("s", 64)
	webD := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{Provider: account.ProviderWeb, AuthType: account.AuthTypeSSO, Name: "pv-d", SourceKey: "sso:" + digestD, UserID: "pv-d"})
	buildD := createLinkedAccountTestCredential(t, ctx, repo, account.Credential{Provider: account.ProviderBuild, AuthType: account.AuthTypeOAuth, Name: "pv-d-build", SourceKey: "pv-d-build", UserID: "pv-d"})
	if err := repo.LinkWebToBuild(ctx, webD.ID, buildD.ID); err != nil {
		t.Fatal(err)
	}
	preview, err := repo.CountCleanupWithLinked(ctx, account.ProviderWeb, []string{"disabled", "reauthRequired", "cooldown"}, now, []account.Provider{account.ProviderBuild})
	if err != nil {
		t.Fatal(err)
	}
	if preview.RootsByStatus["disabled"] != 1 || preview.RootsByStatus["reauthRequired"] != 1 || preview.RootsByStatus["cooldown"] != 1 {
		t.Fatalf("roots by status = %#v", preview.RootsByStatus)
	}
	// 选中的根里只有一个带 Build 对端；webB / webC 没有对端。
	if preview.RootCount != 3 || preview.LinkedByProvider[account.ProviderBuild] != 1 || preview.Total != 4 {
		t.Fatalf("preview = %#v", preview)
	}

	// 停用的 Build 根可以反向展开到 Web 对端。
	setStatus(buildD.ID, map[string]any{"enabled": false})
	if err := repo.ReconcileProviderLinks(ctx, webD.ID); err != nil {
		t.Fatal(err)
	}
	buildPreview, err := repo.CountCleanupWithLinked(ctx, account.ProviderBuild, []string{"disabled"}, now, []account.Provider{account.ProviderWeb})
	if err != nil {
		t.Fatal(err)
	}
	if buildPreview.RootCount != 1 || buildPreview.LinkedByProvider[account.ProviderWeb] != 1 || buildPreview.Total != 2 {
		t.Fatalf("build preview = %#v", buildPreview)
	}
}

func containsID(ids []uint64, want uint64) bool {
	for _, id := range ids {
		if id == want {
			return true
		}
	}
	return false
}
