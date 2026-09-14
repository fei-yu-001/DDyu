package media

import "context"

// clientKeyContextKey 是请求上下文里存放「发起本次媒体写入的客户端密钥 ID」的私有键。
//
// 归属信息走 context 而不是扩展资产存储接口签名（provider.ImageAssetStore 等）：
// 那些接口被多个 adapter 与测试桩实现，扩签名会波及过宽；而 context 只需在网关的
// 请求入口注入一次，即可让 media 服务在归档时读到归属。
type clientKeyContextKey struct{}

// WithClientKeyID 记录本次请求的客户端密钥 ID，供媒体归档写入作品归属。
// 传 0 或 nil context 时原样返回，调用方无需分支判断。
func WithClientKeyID(ctx context.Context, clientKeyID uint64) context.Context {
	if ctx == nil || clientKeyID == 0 {
		return ctx
	}
	return context.WithValue(ctx, clientKeyContextKey{}, clientKeyID)
}

// ClientKeyIDFromContext 读取作品归属的客户端密钥 ID；未设置时返回 0（表示未归属）。
func ClientKeyIDFromContext(ctx context.Context) uint64 {
	if ctx == nil {
		return 0
	}
	value, _ := ctx.Value(clientKeyContextKey{}).(uint64)
	return value
}
