// Package mediaauth 为作品读取端点签发短期签名查询参数。
//
// 为什么需要签名而不是只靠请求头：
//   - 管理员会话 Cookie 的 path 被有意收敛在 /api/admin/v1，浏览器同源 <img>/<video>
//     请求不会携带它；
//   - 媒体标签（<img>/<video>）无法自定义请求头，因此客户端密钥也送不进去。
//
// 用「按作品、带过期时间」的 HMAC 签名把凭证放进 URL，既不必放宽 Cookie 作用域，
// 也让作品链接保持能直接被 <img>/<video> 加载（视频的 Range 请求同样可用）。
package mediaauth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	// ParamExpires / ParamSignature 是签名 URL 上的查询参数名。
	ParamExpires   = "mexp"
	ParamSignature = "msig"
	// MaxTTL 是单个签名允许的最长有效期，超过则视为无效。
	MaxTTL = 7 * 24 * time.Hour
	// defaultTTL 是默认有效期。
	defaultTTL = 24 * time.Hour

	// signatureDomain 做域分隔，避免与其它用途共用密钥时互相影响。
	signatureDomain = "grok2api/media-read/v1"
)

// Signer 按资产路径签发与校验短期签名。
type Signer struct {
	key []byte
	ttl time.Duration
	now func() time.Time
}

// NewSigner 由服务端密钥派生签名密钥。secret 为空时返回错误（调用方应视为配置错误）。
func NewSigner(secret string, ttl time.Duration) (*Signer, error) {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return nil, errors.New("媒体读取签名需要非空的密钥")
	}
	if ttl <= 0 || ttl > MaxTTL {
		ttl = defaultTTL
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signatureDomain))
	return &Signer{key: mac.Sum(nil), ttl: ttl, now: time.Now}, nil
}

// TTL 返回当前签名有效期。
func (s *Signer) TTL() time.Duration {
	if s == nil {
		return 0
	}
	return s.ttl
}

// SignQuery 返回可直接拼到作品路径后的查询串。
func (s *Signer) SignQuery(kind, assetID string) string {
	if s == nil {
		return ""
	}
	expires := s.now().Add(s.ttl).Unix()
	return ParamExpires + "=" + strconv.FormatInt(expires, 10) +
		"&" + ParamSignature + "=" + s.signature(kind, assetID, expires)
}

// SignPath 返回带签名的作品读取路径（相对路径，kind 为 images / videos）。
func (s *Signer) SignPath(kind, assetID string) string {
	path := "/v1/media/" + kind + "/" + url.PathEscape(assetID)
	if s == nil {
		return path
	}
	return path + "?" + s.SignQuery(kind, assetID)
}

// Verify 校验签名有效且未过期。expires 允许略微超过当前时间，但不得超过 MaxTTL。
func (s *Signer) Verify(kind, assetID, expires, signature string) bool {
	if s == nil {
		return false
	}
	expires, signature = strings.TrimSpace(expires), strings.TrimSpace(signature)
	if expires == "" || signature == "" {
		return false
	}
	value, err := strconv.ParseInt(expires, 10, 64)
	if err != nil {
		return false
	}
	now := s.now().Unix()
	if value < now || value > now+int64(MaxTTL/time.Second) {
		return false
	}
	expected := s.signature(kind, assetID, value)
	return hmac.Equal([]byte(expected), []byte(strings.ToLower(signature)))
}

func (s *Signer) signature(kind, assetID string, expires int64) string {
	mac := hmac.New(sha256.New, s.key)
	mac.Write([]byte(kind))
	mac.Write([]byte{0})
	mac.Write([]byte(assetID))
	mac.Write([]byte{0})
	mac.Write([]byte(strconv.FormatInt(expires, 10)))
	return hex.EncodeToString(mac.Sum(nil))
}
