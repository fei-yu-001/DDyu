package mediaauth

import (
	"net/url"
	"strconv"
	"testing"
	"time"
)

func TestSignerRoundTripAndRejectsTampering(t *testing.T) {
	signer, err := NewSigner("server-secret", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	path := signer.SignPath("images", "img_example")
	parsed, err := url.Parse(path)
	if err != nil {
		t.Fatal(err)
	}
	expires := parsed.Query().Get(ParamExpires)
	signature := parsed.Query().Get(ParamSignature)
	if expires == "" || signature == "" {
		t.Fatalf("signed path missing params: %s", path)
	}
	if !signer.Verify("images", "img_example", expires, signature) {
		t.Fatal("valid signature rejected")
	}
	if signer.Verify("videos", "img_example", expires, signature) {
		t.Fatal("signature must be bound to the asset kind")
	}
	if signer.Verify("images", "img_other", expires, signature) {
		t.Fatal("signature must be bound to the asset id")
	}
	if signer.Verify("images", "img_example", expires, signature[:len(signature)-1]+"0") {
		t.Fatal("tampered signature accepted")
	}
	if signer.Verify("images", "img_example", expires, "") {
		t.Fatal("empty signature accepted")
	}
}

func TestSignerRejectsExpiredAndOverlongExpiry(t *testing.T) {
	signer, err := NewSigner("server-secret", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	base := time.Unix(1_000_000, 0)
	signer.now = func() time.Time { return base }

	expires := base.Add(time.Hour).Unix()
	signature := signer.signature("images", "img_example", expires)
	if !signer.Verify("images", "img_example", strconv.FormatInt(expires, 10), signature) {
		t.Fatal("signature valid at issue time must be accepted")
	}

	// 签名本身有效，但时间已经越过过期点。
	signer.now = func() time.Time { return base.Add(time.Hour + time.Second) }
	if signer.Verify("images", "img_example", strconv.FormatInt(expires, 10), signature) {
		t.Fatal("expired signature accepted")
	}

	// 过期点被拉到超过 MaxTTL 也必须拒绝（防止签发端被误配置成超长有效期）。
	signer.now = func() time.Time { return base }
	far := base.Add(MaxTTL + time.Hour).Unix()
	farSignature := signer.signature("images", "img_example", far)
	if signer.Verify("images", "img_example", strconv.FormatInt(far, 10), farSignature) {
		t.Fatal("overlong expiry accepted")
	}
}

func TestNewSignerRequiresSecretAndClampsTTL(t *testing.T) {
	if _, err := NewSigner("   ", time.Hour); err == nil {
		t.Fatal("empty secret must be rejected")
	}
	signer, err := NewSigner("server-secret", 0)
	if err != nil {
		t.Fatal(err)
	}
	if signer.TTL() != 24*time.Hour {
		t.Fatalf("default ttl = %s, want 24h", signer.TTL())
	}
	overlong, err := NewSigner("server-secret", MaxTTL+time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if overlong.TTL() != 24*time.Hour {
		t.Fatalf("overlong ttl not clamped: %s", overlong.TTL())
	}
}
