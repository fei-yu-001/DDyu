package media

import (
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"

	mediaapp "github.com/chenyme/grok2api/backend/internal/application/media"
	clientkeydomain "github.com/chenyme/grok2api/backend/internal/domain/clientkey"
	mediadomain "github.com/chenyme/grok2api/backend/internal/domain/media"
	"github.com/chenyme/grok2api/backend/internal/pkg/mediafile"
	"github.com/chenyme/grok2api/backend/internal/repository"
	"github.com/chenyme/grok2api/backend/internal/shared/response"
	"github.com/chenyme/grok2api/backend/internal/transport/http/middleware"
	"github.com/gin-gonic/gin"
)

type Handler struct {
	service     *mediaapp.Service
	ingestSlots chan struct{}
}

func NewHandler(service *mediaapp.Service) *Handler {
	return &Handler{service: service, ingestSlots: make(chan struct{}, ingestConcurrency)}
}

// RegisterRead 注册作品读取端点。auth 为读取鉴权中间件（管理员会话或客户端密钥）；
// 归属校验在 handler 内完成，客户端密钥只能读自己名下的作品。
func (h *Handler) RegisterRead(router *gin.Engine, auth gin.HandlerFunc) {
	read := router.Group("/v1/media")
	if auth != nil {
		read.Use(auth)
	}
	read.GET("/images/:assetId", h.getImage)
	read.HEAD("/images/:assetId", h.getImage)
	read.GET("/videos/:assetId", h.getVideo)
	read.HEAD("/videos/:assetId", h.getVideo)
}

// RegisterPublic 只注册必须公开的上游回调端点：xAI 无法携带客户端 API key，票据本身即授权。
func (h *Handler) RegisterPublic(router *gin.Engine) {
	router.PUT("/v1/media/uploads/:token", h.putVideoUpload)
}

// RegisterClient 注册面向客户端密钥的作品列表，挂在已受 ClientAuth 保护的 /v1 组下。
func (h *Handler) RegisterClient(router *gin.RouterGroup) {
	router.GET("/media/images", h.listOwnImages)
}

// RegisterClientInputs 注册客户端密钥可用的临时输入端点（上传本地文件 / 从 URL 导入）。
// 与管理端同名端点共用实现（同一套 MIME 校验、SSRF 防护与 TTL），区别是：
// 走 /v1 的 ClientAuth，并把发起密钥写进请求上下文，让临时输入也带归属便于审计与清理。
func (h *Handler) RegisterClientInputs(router *gin.RouterGroup) {
	router.POST("/media/inputs/import", h.withClientKeyContext(h.importInputImageFromURL))
	router.POST("/media/inputs/upload", h.withClientKeyContext(h.uploadInputAsset))
}

func (h *Handler) withClientKeyContext(next gin.HandlerFunc) gin.HandlerFunc {
	return func(c *gin.Context) {
		if value, exists := c.Get(middleware.ClientKey); exists {
			if key, ok := value.(clientkeydomain.Key); ok && key.ID != 0 {
				c.Request = c.Request.WithContext(mediadomain.WithClientKeyID(c.Request.Context(), key.ID))
			}
		}
		next(c)
	}
}

// RegisterAdmin 注册管理端媒体列表和统计端点。
func (h *Handler) RegisterAdmin(router *gin.RouterGroup) {
	router.GET("/media/images", h.listImages)
	router.DELETE("/media/images", h.deleteImages)
	router.GET("/media/images/stats", h.imageStats)
	router.POST("/media/inputs/import", h.importInputImageFromURL)
	router.POST("/media/inputs/upload", h.uploadInputAsset)
	router.GET("/media/videos", h.listVideos)
	router.DELETE("/media/videos", h.deleteVideos)
	router.GET("/media/videos/stats", h.videoStats)
}

type deleteImagesRequest struct {
	IDs []string `json:"ids" binding:"required"`
}

type deleteVideosRequest struct {
	IDs []string `json:"ids" binding:"required"`
}

func (h *Handler) getImage(c *gin.Context) {
	asset, body, err := h.service.OpenImage(c.Request.Context(), c.Param("assetId"))
	if errors.Is(err, mediaapp.ErrAssetNotFound) {
		c.Status(http.StatusNotFound)
		return
	}
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	if !authorizeAsset(c, asset) {
		_ = body.Close()
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()
	etag := `"` + asset.SHA256 + `"`
	if strings.TrimSpace(c.GetHeader("If-None-Match")) == etag {
		c.Header("ETag", etag)
		c.Status(http.StatusNotModified)
		return
	}
	c.Header("Content-Type", asset.MIMEType)
	c.Header("Content-Length", strconv.FormatInt(asset.SizeBytes, 10))
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("ETag", etag)
	c.Header("X-Content-Type-Options", "nosniff")
	if c.Request.Method == http.MethodHead {
		c.Status(http.StatusOK)
		return
	}
	c.Status(http.StatusOK)
	_, _ = io.Copy(c.Writer, body)
}

func (h *Handler) getVideo(c *gin.Context) {
	asset, body, err := h.service.OpenVideo(c.Request.Context(), c.Param("assetId"))
	if errors.Is(err, mediaapp.ErrAssetNotFound) {
		c.Status(http.StatusNotFound)
		return
	}
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	if !authorizeAsset(c, asset) {
		_ = body.Close()
		c.Status(http.StatusNotFound)
		return
	}
	defer body.Close()
	seeker, ok := body.(io.ReadSeeker)
	if !ok {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Header("Content-Type", asset.MIMEType)
	c.Header("Content-Disposition", mediafile.VideoContentDisposition(asset.ID, asset.MIMEType))
	c.Header("Cache-Control", "public, max-age=31536000, immutable")
	c.Header("ETag", `"`+asset.SHA256+`"`)
	c.Header("X-Content-Type-Options", "nosniff")
	http.ServeContent(c.Writer, c.Request, asset.ID, asset.CreatedAt, seeker)
}

// putVideoUpload 接收 XAI ZDR 视频 PUT。响应与错误不得回显完整票据。
func (h *Handler) putVideoUpload(c *gin.Context) {
	_, err := h.service.ReceiveVideoUpload(c.Request.Context(), c.Param("token"), c.GetHeader("Content-Type"), c.Request.Body)
	switch {
	case err == nil:
		c.Status(http.StatusNoContent)
	case errors.Is(err, mediaapp.ErrUploadTicketNotFound):
		c.Status(http.StatusNotFound)
	case errors.Is(err, mediaapp.ErrUploadTicketExpired):
		c.Status(http.StatusGone)
	case errors.Is(err, mediaapp.ErrUploadTicketConsumed):
		c.Status(http.StatusConflict)
	case errors.Is(err, mediaapp.ErrVideoUploadTooLarge):
		// 体积超限优先于通用无效上传，返回 413。
		c.Status(http.StatusRequestEntityTooLarge)
	case errors.Is(err, mediaapp.ErrInvalidVideoUpload):
		c.Status(http.StatusBadRequest)
	case errors.Is(err, mediaapp.ErrUploadTicketsUnavailable):
		c.Status(http.StatusServiceUnavailable)
	default:
		c.Status(http.StatusInternalServerError)
	}
}

// authorizeAsset 校验作品读取权限：管理员会话可读全部作品；客户端密钥只能读自己名下的作品。
// 无归属（ClientKeyID=0）的历史作品仅管理员可读，避免历史数据被任意密钥读到。
// 不匹配一律按 404 处理，避免用状态码泄漏他人作品是否存在。
func authorizeAsset(c *gin.Context, asset mediadomain.Asset) bool {
	if _, ok := c.Get(middleware.AdminKey); ok {
		return true
	}
	// 有效签名的 URL 由服务端按作品签发，签名即授权。
	if signed, ok := c.Get(middleware.MediaSigned); ok && signed == true {
		return true
	}
	value, exists := c.Get(middleware.ClientKey)
	key, valid := value.(clientkeydomain.Key)
	if !exists || !valid || key.ID == 0 {
		return false
	}
	return asset.ClientKeyID != 0 && asset.ClientKeyID == key.ID
}

// listOwnImages 返回当前客户端密钥名下的作品，实现「各看各的」。
func (h *Handler) listOwnImages(c *gin.Context) {
	value, exists := c.Get(middleware.ClientKey)
	key, ok := value.(clientkeydomain.Key)
	if !exists || !ok || key.ID == 0 {
		response.Error(c, http.StatusUnauthorized, "invalid_api_key", "客户端 API Key 无效")
		return
	}
	page, pageSize := parsePagination(c)
	assets, total, err := h.service.ListClientImages(c.Request.Context(), key.ID, page, pageSize, c.Query("search"))
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "mediaListImagesFailed", "读取图片列表失败")
		return
	}
	items := make([]mediaAssetDTO, 0, len(assets))
	for _, a := range assets {
		items = append(items, mediaAssetDTO{
			ID: a.ID, Kind: a.Kind, MimeType: a.MIMEType, SizeBytes: a.SizeBytes,
			SHA256: a.SHA256, CreatedAt: a.CreatedAt.Format("2006-01-02T15:04:05Z"),
			URL: h.service.PublicImageURL(a.ID),
		})
	}
	response.Success(c, http.StatusOK, gin.H{"items": items, "page": page, "pageSize": pageSize, "total": total})
}

func (h *Handler) listImages(c *gin.Context) {
	page, pageSize := parsePagination(c)
	assets, total, err := h.service.AdminListImages(c.Request.Context(), page, pageSize, c.Query("search"))
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "mediaListImagesFailed", "读取图片列表失败")
		return
	}
	items := make([]mediaAssetDTO, 0, len(assets))
	for _, a := range assets {
		items = append(items, mediaAssetDTO{
			ID: a.ID, Kind: a.Kind, MimeType: a.MIMEType, SizeBytes: a.SizeBytes,
			SHA256: a.SHA256, CreatedAt: a.CreatedAt.Format("2006-01-02T15:04:05Z"),
			URL: h.service.PublicImageURL(a.ID),
		})
	}
	response.Success(c, http.StatusOK, gin.H{"items": items, "page": page, "pageSize": pageSize, "total": total})
}

func (h *Handler) imageStats(c *gin.Context) {
	stats, err := h.service.AdminImageStats(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "mediaImageStatsFailed", "读取图片统计失败")
		return
	}
	response.Success(c, http.StatusOK, imageStatsDTO{TotalImages: stats.TotalImages, TotalBytes: stats.TotalBytes})
}

func (h *Handler) deleteImages(c *gin.Context) {
	var request deleteImagesRequest
	if c.ShouldBindJSON(&request) != nil {
		response.Error(c, http.StatusBadRequest, "invalidRequest", "请求参数无效")
		return
	}
	deleted, err := h.service.AdminDeleteImages(c.Request.Context(), request.IDs)
	if errors.Is(err, mediaapp.ErrInvalidImageSelection) {
		response.Error(c, http.StatusBadRequest, "invalidImageSelection", err.Error())
		return
	}
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "mediaDeleteImagesFailed", "删除图片失败")
		return
	}
	response.Success(c, http.StatusOK, gin.H{"deleted": deleted})
}

func (h *Handler) listVideos(c *gin.Context) {
	page, pageSize := parsePagination(c)
	jobs, total, err := h.service.AdminListVideoJobs(c.Request.Context(), page, pageSize, c.Query("search"), c.Query("status"), repository.SortQuery{Field: c.Query("sortBy"), Direction: repository.SortDirection(c.Query("sortOrder"))})
	if errors.Is(err, mediaapp.ErrInvalidFilter) {
		response.Error(c, http.StatusBadRequest, "invalidFilter", err.Error())
		return
	}
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "mediaListVideosFailed", "读取视频任务列表失败")
		return
	}
	items := make([]mediaJobDTO, 0, len(jobs))
	for _, j := range jobs {
		var completedAt *string
		assetID := ""
		if j.CompletedAt != nil {
			formatted := j.CompletedAt.Format("2006-01-02T15:04:05Z")
			completedAt = &formatted
		}
		if j.Status == "completed" {
			assetID = j.ResultAssetID
		}
		assetURL := ""
		if assetID != "" {
			assetURL = h.service.PublicVideoURL(assetID)
		}
		items = append(items, mediaJobDTO{
			ID: j.ID, Model: j.Model, Prompt: j.Prompt, Status: string(j.Status),
			Progress: j.Progress, Seconds: j.Seconds, Size: j.Size, Quality: j.Quality,
			AccountName: j.AccountName, ClientKeyName: j.ClientKeyName,
			CreatedAt:   j.CreatedAt.Format("2006-01-02T15:04:05Z"),
			CompletedAt: completedAt, ErrorMessage: j.ErrorMessage, AssetID: assetID, URL: assetURL,
		})
	}
	response.Success(c, http.StatusOK, gin.H{"items": items, "page": page, "pageSize": pageSize, "total": total})
}

func (h *Handler) videoStats(c *gin.Context) {
	stats, err := h.service.AdminVideoStats(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "mediaVideoStatsFailed", "读取视频统计失败")
		return
	}
	response.Success(c, http.StatusOK, videoStatsDTO{
		TotalJobs: stats.TotalJobs, Completed: stats.Completed, Failed: stats.Failed,
		InProgress: stats.InProgress, Queued: stats.Queued,
	})
}

func (h *Handler) deleteVideos(c *gin.Context) {
	var request deleteVideosRequest
	if c.ShouldBindJSON(&request) != nil {
		response.Error(c, http.StatusBadRequest, "invalidRequest", "请求参数无效")
		return
	}
	deleted, err := h.service.AdminDeleteVideoJobs(c.Request.Context(), request.IDs)
	if errors.Is(err, mediaapp.ErrInvalidVideoSelection) || errors.Is(err, mediaapp.ErrActiveVideoSelection) {
		response.Error(c, http.StatusBadRequest, "invalidVideoSelection", err.Error())
		return
	}
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "mediaDeleteVideosFailed", "删除视频任务失败")
		return
	}
	response.Success(c, http.StatusOK, gin.H{"deleted": deleted})
}

func parsePagination(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("pageSize", "20"))
	return repository.NormalizePage(page, pageSize, repository.DefaultPageSize)
}
