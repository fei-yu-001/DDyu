package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	mediaapp "github.com/chenyme/grok2api/backend/internal/application/media"
	clientkeydomain "github.com/chenyme/grok2api/backend/internal/domain/clientkey"
	mediadomain "github.com/chenyme/grok2api/backend/internal/domain/media"
	localmedia "github.com/chenyme/grok2api/backend/internal/infra/media"
	"github.com/chenyme/grok2api/backend/internal/infra/persistence/relational"
	"github.com/chenyme/grok2api/backend/internal/pkg/mediaauth"
	"github.com/chenyme/grok2api/backend/internal/repository"
	"github.com/chenyme/grok2api/backend/internal/transport/http/middleware"
	"github.com/gin-gonic/gin"
)

// testAdminAuth 模拟管理员会话。真实部署里由 middleware.MediaReadAuth 校验管理员令牌后
// 设置同一个上下文标记，这里直接注入以聚焦读取本身的行为。
func testAdminAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(middleware.AdminKey, true)
		c.Next()
	}
}

// testClientKeyAuth 模拟携带客户端密钥的请求，归属校验据此生效。
func testClientKeyAuth(keyID uint64) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(middleware.ClientKey, clientkeydomain.Key{ID: keyID})
		c.Next()
	}
}

func TestAdminSessionMediaReadSupportsGetHeadAndETag(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	database, err := relational.OpenSQLite(ctx, filepath.Join(t.TempDir(), "media-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	objects, err := localmedia.NewLocalStore(filepath.Join(t.TempDir(), "objects"))
	if err != nil {
		t.Fatal(err)
	}
	service := mediaapp.NewService(relational.NewMediaAssetRepository(database), relational.NewMediaJobRepository(database), objects, nil, mediaapp.Config{
		PublicBaseURL: "https://api.example", MaxImageBytes: 32 << 20, MaxTotalBytes: 1 << 30,
		CleanupThresholdPercent: 80, CleanupInterval: 10 * time.Minute,
	})
	raw, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	asset, err := service.SaveImage(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	NewHandler(service).RegisterRead(router, testAdminAuth())
	path := "/v1/media/images/" + asset.ID

	get := httptest.NewRecorder()
	router.ServeHTTP(get, httptest.NewRequest(http.MethodGet, path, nil))
	if get.Code != http.StatusOK || get.Header().Get("Content-Type") != "image/png" || get.Body.Len() != len(raw) || get.Header().Get("ETag") == "" {
		t.Fatalf("GET status=%d headers=%#v size=%d", get.Code, get.Header(), get.Body.Len())
	}
	head := httptest.NewRecorder()
	router.ServeHTTP(head, httptest.NewRequest(http.MethodHead, path, nil))
	if head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("Content-Length") == "" {
		t.Fatalf("HEAD status=%d headers=%#v size=%d", head.Code, head.Header(), head.Body.Len())
	}
	notModifiedRequest := httptest.NewRequest(http.MethodGet, path, nil)
	notModifiedRequest.Header.Set("If-None-Match", get.Header().Get("ETag"))
	notModified := httptest.NewRecorder()
	router.ServeHTTP(notModified, notModifiedRequest)
	if notModified.Code != http.StatusNotModified || notModified.Body.Len() != 0 {
		t.Fatalf("conditional GET status=%d size=%d", notModified.Code, notModified.Body.Len())
	}
}

func TestAdminSessionMediaReadSupportsVideoHeadAndRange(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	database, err := relational.OpenSQLite(ctx, filepath.Join(t.TempDir(), "media-video-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	objects, err := localmedia.NewLocalStore(filepath.Join(t.TempDir(), "video-objects"))
	if err != nil {
		t.Fatal(err)
	}
	service := mediaapp.NewService(relational.NewMediaAssetRepository(database), relational.NewMediaJobRepository(database), objects, nil, mediaapp.Config{
		PublicBaseURL: "https://api.example", MaxImageBytes: 32 << 20, MaxTotalBytes: 1 << 30,
		CleanupThresholdPercent: 80, CleanupInterval: 10 * time.Minute,
	})
	payload := append([]byte{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}, bytes.Repeat([]byte{0x03}, 64)...)
	asset, err := service.SaveVideo(ctx, "", "video/mp4", bytes.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	router := gin.New()
	NewHandler(service).RegisterRead(router, testAdminAuth())
	path := "/v1/media/videos/" + asset.ID

	get := httptest.NewRecorder()
	router.ServeHTTP(get, httptest.NewRequest(http.MethodGet, path, nil))
	wantDisposition := `inline; filename="` + asset.ID + `.mp4"`
	if get.Code != http.StatusOK || get.Body.Len() != len(payload) || get.Header().Get("Content-Type") != "video/mp4" || get.Header().Get("Content-Disposition") != wantDisposition || get.Header().Get("ETag") == "" {
		t.Fatalf("GET status=%d size=%d headers=%#v", get.Code, get.Body.Len(), get.Header())
	}
	head := httptest.NewRecorder()
	router.ServeHTTP(head, httptest.NewRequest(http.MethodHead, path, nil))
	if head.Code != http.StatusOK || head.Body.Len() != 0 || head.Header().Get("Content-Length") == "" || head.Header().Get("Content-Disposition") != wantDisposition {
		t.Fatalf("HEAD status=%d size=%d headers=%#v", head.Code, head.Body.Len(), head.Header())
	}
	rangeRequest := httptest.NewRequest(http.MethodGet, path, nil)
	rangeRequest.Header.Set("Range", "bytes=0-3")
	partial := httptest.NewRecorder()
	router.ServeHTTP(partial, rangeRequest)
	if partial.Code != http.StatusPartialContent || partial.Body.Len() != 4 || partial.Header().Get("Content-Range") == "" || partial.Header().Get("Content-Disposition") != wantDisposition {
		t.Fatalf("Range status=%d size=%d headers=%#v", partial.Code, partial.Body.Len(), partial.Header())
	}
}

// TestMediaReadRequiresCredential 校验未携带任何凭证时读取被拒绝，且 nil 依赖不会 panic。
func TestMediaReadRequiresCredential(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	NewHandler(nil).RegisterRead(router, middleware.MediaReadAuth(nil, nil, nil))
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/v1/media/images/img_0000000000000000", nil))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", recorder.Code)
	}
}

// TestMediaReadIsolatesAssetsByClientKey 校验「各看各的」：
// 客户端密钥只能读自己名下的作品，读他人作品按 404 处理（不泄漏是否存在）；
// 客户端作品列表只返回自己的作品；管理员仍可读无归属的历史作品。
func TestMediaReadIsolatesAssetsByClientKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	database, err := relational.OpenSQLite(ctx, filepath.Join(t.TempDir(), "media-owner.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	objects, err := localmedia.NewLocalStore(filepath.Join(t.TempDir(), "owner-objects"))
	if err != nil {
		t.Fatal(err)
	}
	service := mediaapp.NewService(relational.NewMediaAssetRepository(database), relational.NewMediaJobRepository(database), objects, nil, mediaapp.Config{
		PublicBaseURL: "https://api.example", MaxImageBytes: 32 << 20, MaxTotalBytes: 1 << 30,
		CleanupThresholdPercent: 80, CleanupInterval: 10 * time.Minute,
	})
	raw, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	legacy, err := service.SaveImage(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	owned, err := service.SaveImage(mediadomain.WithClientKeyID(ctx, 7), raw)
	if err != nil {
		t.Fatal(err)
	}
	if owned.ClientKeyID != 7 {
		t.Fatalf("saved asset client key = %d, want 7", owned.ClientKeyID)
	}

	handler := NewHandler(service)

	ownerRouter := gin.New()
	handler.RegisterRead(ownerRouter, testClientKeyAuth(7))
	ownerGet := httptest.NewRecorder()
	ownerRouter.ServeHTTP(ownerGet, httptest.NewRequest(http.MethodGet, "/v1/media/images/"+owned.ID, nil))
	if ownerGet.Code != http.StatusOK {
		t.Fatalf("owner GET status = %d, want 200", ownerGet.Code)
	}

	otherRouter := gin.New()
	handler.RegisterRead(otherRouter, testClientKeyAuth(9))
	otherGet := httptest.NewRecorder()
	otherRouter.ServeHTTP(otherGet, httptest.NewRequest(http.MethodGet, "/v1/media/images/"+owned.ID, nil))
	if otherGet.Code != http.StatusNotFound {
		t.Fatalf("other client GET status = %d, want 404", otherGet.Code)
	}
	legacyGet := httptest.NewRecorder()
	otherRouter.ServeHTTP(legacyGet, httptest.NewRequest(http.MethodGet, "/v1/media/images/"+legacy.ID, nil))
	if legacyGet.Code != http.StatusNotFound {
		t.Fatalf("unowned GET status = %d, want 404", legacyGet.Code)
	}

	adminRouter := gin.New()
	handler.RegisterRead(adminRouter, testAdminAuth())
	adminGet := httptest.NewRecorder()
	adminRouter.ServeHTTP(adminGet, httptest.NewRequest(http.MethodGet, "/v1/media/images/"+legacy.ID, nil))
	if adminGet.Code != http.StatusOK {
		t.Fatalf("admin GET unowned status = %d, want 200", adminGet.Code)
	}

	clientRouter := gin.New()
	clientV1 := clientRouter.Group("/v1")
	clientV1.Use(testClientKeyAuth(7))
	handler.RegisterClient(clientV1)
	list := httptest.NewRecorder()
	clientRouter.ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/v1/media/images", nil))
	if list.Code != http.StatusOK || !strings.Contains(list.Body.String(), owned.ID) || strings.Contains(list.Body.String(), legacy.ID) {
		t.Fatalf("owner list status=%d body=%s", list.Code, list.Body.String())
	}

	otherRouterList := gin.New()
	otherV1 := otherRouterList.Group("/v1")
	otherV1.Use(testClientKeyAuth(9))
	handler.RegisterClient(otherV1)
	otherList := httptest.NewRecorder()
	otherRouterList.ServeHTTP(otherList, httptest.NewRequest(http.MethodGet, "/v1/media/images", nil))
	if otherList.Code != http.StatusOK || strings.Contains(otherList.Body.String(), owned.ID) {
		t.Fatalf("other client list status=%d body=%s, must not contain %s", otherList.Code, otherList.Body.String(), owned.ID)
	}

	// 短期签名 URL：<img>/<video> 无法带请求头，靠签名把凭证放进 URL。
	signer, err := mediaauth.NewSigner("test-secret", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	signedRouter := gin.New()
	handler.RegisterRead(signedRouter, middleware.MediaReadAuth(nil, nil, signer))
	signed := httptest.NewRecorder()
	signedRouter.ServeHTTP(signed, httptest.NewRequest(http.MethodGet, signer.SignPath("images", owned.ID), nil))
	if signed.Code != http.StatusOK {
		t.Fatalf("signed GET status = %d, want 200", signed.Code)
	}
	unsigned := httptest.NewRecorder()
	signedRouter.ServeHTTP(unsigned, httptest.NewRequest(http.MethodGet, "/v1/media/images/"+owned.ID, nil))
	if unsigned.Code != http.StatusUnauthorized {
		t.Fatalf("unsigned GET status = %d, want 401", unsigned.Code)
	}
	tampered := httptest.NewRecorder()
	signedRouter.ServeHTTP(tampered, httptest.NewRequest(http.MethodGet,
		strings.Replace(signer.SignPath("images", owned.ID), "msig=", "msig=00", 1), nil))
	if tampered.Code == http.StatusOK {
		t.Fatal("tampered signature must not be accepted")
	}
}

func TestAdminDeleteImagesRemovesObjectMetadataAndStats(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	database, err := relational.OpenSQLite(ctx, filepath.Join(t.TempDir(), "media-delete.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	objects, err := localmedia.NewLocalStore(filepath.Join(t.TempDir(), "objects-delete"))
	if err != nil {
		t.Fatal(err)
	}
	service := mediaapp.NewService(
		relational.NewMediaAssetRepository(database),
		relational.NewMediaJobRepository(database),
		objects,
		nil,
		mediaapp.Config{PublicBaseURL: "https://api.example", MaxImageBytes: 32 << 20, MaxTotalBytes: 1 << 30, CleanupThresholdPercent: 80, CleanupInterval: time.Minute},
	)
	raw, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	deletedAsset, err := service.SaveImage(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}
	keptAsset, err := service.SaveImage(ctx, raw)
	if err != nil {
		t.Fatal(err)
	}

	router := gin.New()
	NewHandler(service).RegisterAdmin(router.Group("/api/admin/v1"))
	request := httptest.NewRequest(http.MethodDelete, "/api/admin/v1/media/images", bytes.NewBufferString(`{"ids":["`+deletedAsset.ID+`"]}`))
	request.Header.Set("Content-Type", "application/json")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("DELETE status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if _, _, err := service.OpenImage(ctx, deletedAsset.ID); !errors.Is(err, mediaapp.ErrAssetNotFound) {
		t.Fatalf("deleted image error = %v, want ErrAssetNotFound", err)
	}
	_, body, err := service.OpenImage(ctx, keptAsset.ID)
	if err != nil {
		t.Fatalf("kept image error = %v", err)
	}
	defer body.Close()
	stats, err := service.AdminImageStats(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if stats.TotalImages != 1 || stats.TotalBytes != keptAsset.SizeBytes {
		t.Fatalf("stats = %#v, want one kept image", stats)
	}
}

func TestPutVideoUploadReturns413WhenBodyTooLarge(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	database, err := relational.OpenSQLite(ctx, filepath.Join(t.TempDir(), "media-upload-413.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	objects, err := localmedia.NewLocalStore(filepath.Join(t.TempDir(), "objects-413"))
	if err != nil {
		t.Fatal(err)
	}
	tickets := relational.NewMediaUploadTicketRepository(database)
	service := mediaapp.NewServiceWithTickets(
		relational.NewMediaAssetRepository(database),
		relational.NewMediaJobRepository(database),
		tickets, objects, nil,
		mediaapp.Config{PublicBaseURL: "https://api.example", MaxImageBytes: 32 << 20, MaxTotalBytes: 1 << 30, CleanupThresholdPercent: 80, CleanupInterval: time.Minute},
	)
	tokenRaw := make([]byte, 32)
	for i := range tokenRaw {
		tokenRaw[i] = byte(i + 7)
	}
	token := hex.EncodeToString(tokenRaw)
	sum := sha256.Sum256([]byte(token))
	now := time.Now().UTC()
	if err := tickets.CreateUploadTicket(ctx, repository.MediaUploadTicket{
		TokenHash: hex.EncodeToString(sum[:]), AssetID: "vid_http_413_00000001", JobID: "job_413",
		MaxBytes: 32, AllowedMIME: "video/mp4", ExpiresAt: now.Add(time.Hour), CreatedAt: now,
	}); err != nil {
		t.Fatal(err)
	}
	payload := append([]byte{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'}, bytes.Repeat([]byte{0x0a}, 64)...)
	router := gin.New()
	NewHandler(service).RegisterPublic(router)
	req := httptest.NewRequest(http.MethodPut, "/v1/media/uploads/"+token, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "video/mp4")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413, body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestPutVideoUploadReturns400ForInvalidMIME(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	database, err := relational.OpenSQLite(ctx, filepath.Join(t.TempDir(), "media-upload-400.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	objects, err := localmedia.NewLocalStore(filepath.Join(t.TempDir(), "objects-400"))
	if err != nil {
		t.Fatal(err)
	}
	service := mediaapp.NewServiceWithTickets(
		relational.NewMediaAssetRepository(database),
		relational.NewMediaJobRepository(database),
		relational.NewMediaUploadTicketRepository(database), objects, nil,
		mediaapp.Config{PublicBaseURL: "https://api.example", MaxImageBytes: 32 << 20, MaxTotalBytes: 1 << 30, CleanupThresholdPercent: 80, CleanupInterval: time.Minute},
	)
	uploadURL, _, err := service.IssueVideoUpload(ctx, "job_400_mime")
	if err != nil {
		t.Fatal(err)
	}
	token := uploadURL[len("https://api.example/v1/media/uploads/"):]
	router := gin.New()
	NewHandler(service).RegisterPublic(router)
	payload := append([]byte{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p'}, bytes.Repeat([]byte{1}, 16)...)
	req := httptest.NewRequest(http.MethodPut, "/v1/media/uploads/"+token, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "video/webm")
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, req)
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", recorder.Code)
	}
}

func TestAdminVideoListRejectsInvalidFilters(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx := context.Background()
	database, err := relational.OpenSQLite(ctx, filepath.Join(t.TempDir(), "media-admin-http.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	if err := database.InitializeSchema(ctx); err != nil {
		t.Fatal(err)
	}
	service := mediaapp.NewService(
		relational.NewMediaAssetRepository(database),
		relational.NewMediaJobRepository(database),
		nil,
		nil,
		mediaapp.Config{},
	)
	router := gin.New()
	NewHandler(service).RegisterAdmin(router.Group("/api/admin/v1"))

	for _, path := range []string{
		"/api/admin/v1/media/videos?status=unknown",
		"/api/admin/v1/media/videos?sortBy=input_json&sortOrder=asc",
		"/api/admin/v1/media/videos?sortBy=createdAt&sortOrder=sideways",
	} {
		recorder := httptest.NewRecorder()
		router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, path, nil))
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("GET %s status = %d, body = %s", path, recorder.Code, recorder.Body.String())
		}
	}
}
