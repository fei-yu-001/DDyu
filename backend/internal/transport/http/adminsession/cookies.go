package adminsession

const (
	AccessCookieName  = "grok2api_admin_access"
	RefreshCookieName = "grok2api_admin_refresh"

	// PageSession 携带与 access 相同的 JWT，但 path 为 /，供 HTML 页面门禁
	// （如 /story/ 日记页）在浏览器整页请求时读取；API cookie 保持 /api/admin/v1 收敛不变。
	PageSessionCookieName = "grok2api_admin_page_session"

	AccessCookiePath      = "/api/admin/v1"
	RefreshCookiePath     = "/api/admin/v1/auth"
	PageSessionCookiePath = "/"
)
