package httpserver

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	adminauthapp "github.com/chenyme/grok2api/backend/internal/application/adminauth"
	"github.com/chenyme/grok2api/backend/internal/transport/http/adminsession"
	"github.com/chenyme/grok2api/backend/internal/transport/http/middleware"
	"github.com/gin-gonic/gin"
)

// FrontendBasePath 是创意工坊（React SPA）的挂载前缀。
// 根路径 / 由博客（独立静态站）接管，创意工坊挂在 /studio。
const FrontendBasePath = "/studio"

// registerFrontend 托管博客静态产物（根路径）与创意工坊静态文件（含 SPA 回退）。
func registerFrontend(router *gin.Engine, adminService *adminauthapp.Service, studioPath, blogPath string) {
	studioRoot, studioIndexPath, studioOK := frontendRoot(studioPath)
	blog := newBlogSite(blogPath)

	// /story/（我们的故事日记）：仅管理员会话可见；访客重定向到登录页。
	if blog.ok {
		storyGate := func(c *gin.Context) {
			// API cookie 的 path 收敛在 /api/admin/v1，整页请求带不上它；
			// 浏览器页面请求改读 path=/ 的 page-session cookie（同值 access JWT）。
			raw, ok := middleware.AdminTokenFromRequest(c.Request)
			if !ok {
				if token, err := c.Cookie(adminsession.PageSessionCookieName); err == nil {
					if token = strings.TrimSpace(token); token != "" {
						raw, ok = token, true
					}
				}
			}
			if ok {
				if _, err := adminService.AuthenticateAccess(c.Request.Context(), raw); err == nil {
					c.Next()
					return
				}
			}
			c.Redirect(http.StatusFound, "/studio/login")
		}
		router.GET("/story", func(c *gin.Context) {
			c.Redirect(http.StatusMovedPermanently, "/story/")
		})
		router.GET("/story/", storyGate, func(c *gin.Context) {
			if !blog.serve(c, "/story/") {
				c.Status(http.StatusNotFound)
			}
		})
	}

	// 根路径：博客已构建则服务博客首页，否则显示占位页。
	router.GET("/", func(c *gin.Context) {
		if blog.serve(c, "/") {
			return
		}
		serveLandingPage(c)
	})
	router.NoRoute(func(c *gin.Context) {
		requestPath := c.Request.URL.Path
		if (c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead) || isBackendPath(requestPath) {
			c.Status(http.StatusNotFound)
			return
		}
		// 创意工坊只接管 /studio 前缀内的路径。
		if relative, inStudio := studioRelativePath(requestPath); inStudio && studioOK {
			serveStudio(c, studioRoot, studioIndexPath, relative)
			return
		}
		// 博客接管其余根路径（含其 404 页）。/story/ 有专属门禁路由，先于 NoRoute 命中。
		if blog.serve(c, requestPath) {
			return
		}
		c.Status(http.StatusNotFound)
	})
}

// serveStudio 服务单个创意工坊请求；relative 是相对 /studio 的路径（"" 表示 /studio 本身）。
func serveStudio(c *gin.Context, root, indexPath, relative string) {
	if relative == "" {
		c.Header("Cache-Control", "no-cache")
		http.ServeFile(c.Writer, c.Request, indexPath)
		return
	}
	files := http.FileServer(http.Dir(root))
	if filePath, exists := frontendFile(root, relative); exists {
		if strings.HasPrefix(path.Clean(relative), "/assets/") {
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
		} else {
			c.Header("Cache-Control", "no-cache")
		}
		c.Request.URL.Path = "/" + filepath.ToSlash(filePath)
		files.ServeHTTP(c.Writer, c.Request)
		return
	}
	if path.Ext(path.Clean(relative)) != "" {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", "no-cache")
	http.ServeFile(c.Writer, c.Request, indexPath)
}

// blogSite 是博客静态产物集合；ok=false 表示博客未构建，根路径回退占位页。
type blogSite struct {
	root     string
	index    string
	notFound string
	ok       bool
}

func newBlogSite(blogPath string) blogSite {
	root, indexPath, ok := frontendRoot(blogPath)
	if !ok {
		return blogSite{}
	}
	site := blogSite{root: root, index: indexPath, ok: true}
	if notFound := filepath.Join(root, "404.html"); isRegularFile(notFound) {
		site.notFound = notFound
	}
	return site
}

// serve 服务博客请求；产物缺失返回 false。
// 干净 URL（/post/x/）映射到 index.html，无尾斜杠时 301 补全；
// 未命中路径在 404 页存在时以 404 状态返回该页。
func (b blogSite) serve(c *gin.Context, requestPath string) bool {
	if !b.ok {
		return false
	}
	// path.Clean 会去掉尾斜杠，必须在清理前判断 /post/x 与 /post/x/。
	rawPath := strings.TrimPrefix(requestPath, "/")
	trailingSlash := rawPath != "" && strings.HasSuffix(requestPath, "/")
	cleanPath := path.Clean("/" + rawPath)
	if cleanPath == "/" {
		b.serveFile(c, b.index, cleanPath)
		return true
	}
	relative := strings.TrimPrefix(cleanPath, "/")
	if filePath, exists := frontendFile(b.root, relative); exists {
		b.serveFile(c, filepath.Join(b.root, filepath.FromSlash(filePath)), cleanPath)
		return true
	}
	if filePath, exists := frontendFile(b.root, relative+"/index.html"); exists {
		if !trailingSlash {
			c.Redirect(http.StatusMovedPermanently, cleanPath+"/")
			return true
		}
		b.serveFile(c, filepath.Join(b.root, filepath.FromSlash(filePath)), cleanPath)
		return true
	}
	if b.notFound != "" {
		b.serveNotFound(c)
		return true
	}
	return false
}

// serveNotFound 以 404 状态返回 404 页。
// 不能用 http.ServeFile：它内部无条件 WriteHeader(200)，会覆盖已设置的 404。
func (b blogSite) serveNotFound(c *gin.Context) {
	data, err := os.ReadFile(b.notFound)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	c.Data(http.StatusNotFound, "text/html; charset=utf-8", data)
}

// serveFile 服务静态文件：Astro 哈希资源（/_astro/）与 /assets/ 长缓存，HTML 不缓存。
func (b blogSite) serveFile(c *gin.Context, filePath, cleanPath string) {
	if strings.HasPrefix(cleanPath, "/_astro/") || strings.HasPrefix(cleanPath, "/assets/") {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
	} else {
		c.Header("Cache-Control", "no-cache")
	}
	http.ServeFile(c.Writer, c.Request, filePath)
}

func isRegularFile(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.Mode().IsRegular()
}

// studioRelativePath 把 /studio/xxx 映射成 SPA 根目录内的相对路径（以 / 开头）。
// 第二个返回值表示请求是否落在创意工坊前缀内；不在前缀内一律不应由 SPA 回退接管。
func studioRelativePath(requestPath string) (string, bool) {
	cleanPath := path.Clean("/" + requestPath)
	if cleanPath == FrontendBasePath {
		return "", true
	}
	if !strings.HasPrefix(cleanPath, FrontendBasePath+"/") {
		return "", false
	}
	return strings.TrimPrefix(cleanPath, FrontendBasePath), true
}

// serveLandingPage 提供根路径占位页：博客将来在此独立接入，不阻塞创意工坊上线。
func serveLandingPage(c *gin.Context) {
	c.Header("Cache-Control", "no-cache")
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, landingPageHTML)
}

const landingPageHTML = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#ffffff" />
    <title>DDyu</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
             font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
             background: #f8fafc; color: #0f172a; }
      main { text-align: center; padding: 2rem; }
      h1 { margin: 0 0 .5rem; font-size: 2rem; font-weight: 600; letter-spacing: -.02em; }
      p { margin: 0 0 1.5rem; color: #475569; }
      a { display: inline-block; padding: .625rem 1.25rem; border-radius: 9999px; background: #4f46e5;
          color: #fff; text-decoration: none; font-size: .875rem; }
      a:hover { background: #4338ca; }
      @media (prefers-color-scheme: dark) {
        body { background: #0f172a; color: #f8fafc; }
        p { color: #94a3b8; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>DDyu</h1>
      <p>首页施工中，博客将在稍后接入。</p>
      <a href="/studio/">进入创意工坊</a>
    </main>
  </body>
</html>
`

func frontendRoot(staticPath string) (string, string, bool) {
	staticPath = strings.TrimSpace(staticPath)
	if staticPath == "" {
		return "", "", false
	}
	root, err := filepath.Abs(staticPath)
	if err != nil {
		return "", "", false
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return "", "", false
	}
	indexPath := filepath.Join(root, "index.html")
	indexInfo, err := os.Stat(indexPath)
	if err != nil || !indexInfo.Mode().IsRegular() {
		return "", "", false
	}
	return filepath.Clean(root), indexPath, true
}

func frontendFile(root, requestPath string) (string, bool) {
	cleanPath := strings.TrimPrefix(path.Clean("/"+requestPath), "/")
	if cleanPath == "" || cleanPath == "." {
		return "", false
	}
	fullPath := filepath.Join(root, filepath.FromSlash(cleanPath))
	relative, err := filepath.Rel(root, fullPath)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", false
	}
	info, err := os.Stat(fullPath)
	if err != nil || !info.Mode().IsRegular() {
		return "", false
	}
	return relative, true
}

func isBackendPath(value string) bool {
	cleanPath := path.Clean("/" + value)
	for _, prefix := range []string{"/api", "/v1", "/swagger"} {
		if cleanPath == prefix || strings.HasPrefix(cleanPath, prefix+"/") {
			return true
		}
	}
	return cleanPath == "/healthz" || cleanPath == "/readyz"
}
