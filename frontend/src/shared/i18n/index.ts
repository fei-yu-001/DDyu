import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { en } from "./en";
import { zhCN } from "./zh-CN";

const resources = {
  "zh-CN": { translation: zhCN },
  en: { translation: en },
} as const;

Object.assign(resources["zh-CN"].translation.models as unknown as Record<string, string>, {
  capability: "接口能力",
  capabilityConversation: "对话",
  capabilityCompletions: "Completions",
  capabilityResponses: "Responses",
  capabilityMessages: "Messages",
  capabilityImage: "Image",
  capabilityImageEdit: "Image Edit",
  capabilityVideo: "Video",
  capabilityTTS: "TTS",
  capabilitySTT: "STT",
  capabilityRealtime: "Realtime",
  automaticAccounts: "自动账号池",
  mixedAccounts: "混合账号池",
  partiallyEnabled: "部分启用",
  editCapability: "编辑 {{capability}}",
  deleteGroupDescription: "这将删除 {{name}} 的全部 {{count}} 项接口能力及其客户端密钥权限。后续目录同步可能重新创建仍受上游支持的能力。",
  bindAccountsDescription: "开启后仅通过指定账号路由；关闭后由对应 Provider 的可用账号池自动调度。Console 内置模型无需逐账号硬绑定。",
});
Object.assign(resources.en.translation.models as unknown as Record<string, string>, {
  capability: "Endpoint capability",
  capabilityConversation: "Conversation",
  capabilityCompletions: "Completions",
  capabilityResponses: "Responses",
  capabilityMessages: "Messages",
  capabilityImage: "Image",
  capabilityImageEdit: "Image Edit",
  capabilityVideo: "Video",
  capabilityTTS: "TTS",
  capabilitySTT: "STT",
  capabilityRealtime: "Realtime",
  automaticAccounts: "Automatic pool",
  mixedAccounts: "Mixed account pools",
  partiallyEnabled: "Partially enabled",
  editCapability: "Edit {{capability}}",
  deleteGroupDescription: "This removes all {{count}} endpoint capabilities for {{name}} and their client-key permissions. A later catalog sync may recreate capabilities that the upstream still supports.",
  bindAccountsDescription: "When enabled, route only through the selected accounts. Otherwise, schedule from the provider's eligible account pool automatically. Built-in Console models do not require per-account bindings.",
});

// Kept separate from the legacy one-line settings resources so proxy
// operations can evolve without making that catalog harder to review.
Object.assign(resources["zh-CN"].translation.settings.egress as unknown as Record<string, string>, {
  description: "节点按 Grok Build、Grok Web、Grok Console、Web 资源和 Console 资源独立管理代理与健康状态。Console 资源节点仅使用代理与 User-Agent，不发送账号或 Cloudflare Cookie。代理地址和 Cookie 仅写入。",
  dialogDescription: "配置节点作用域、代理地址和浏览器身份；Console 资源节点用于匿名媒体下载，不使用 Clearance Cookie。",
  proxyProtocols: "支持 HTTP、HTTPS、SOCKS4/4A、SOCKS5/5H、Trojan、VLESS、Shadowsocks 和 VMess。\n隧道协议支持 TCP、WebSocket 与 TLS；Resin 可在用户名中使用 {account}。",
  scopeConsoleAsset: "Grok Console（仅资源）",
  health: "请求健康",
  healthHelp: "由真实 Grok 请求的成功、连接失败和反爬拒绝累计得出，与连通探测独立。",
  probe: "连通探测",
  probeHelp: "最近一次通过该代理分别请求对应 IP 回显服务 IPv4 与 IPv6 固定端点的结果。仅表示代理能访问 IP 回显端点，不保证 Grok 上游可用，也不代表真实请求健康度。",
  probeLatency: "探测耗时：{{latency}} ms",
  probeProvider: "IP 回显服务",
  probeProviderHelp: "选择 IPv4 与 IPv6 连通探测使用的固定服务。Cloudflare 为默认服务，IPinfo 可手动切换。",
});
Object.assign(resources.en.translation.settings.egress as unknown as Record<string, string>, {
  description: "Nodes manage proxy and health independently for Grok Build, Grok Web, Grok Console, Web assets, and Console assets. Console asset nodes use only the proxy and User-Agent and never send account or Cloudflare cookies. Proxy URLs and cookies are write-only.",
  dialogDescription: "Configure the node scope, proxy address, and browser identity. Console asset nodes are for anonymous media downloads and do not use clearance cookies.",
  proxyProtocols: "Supports HTTP, HTTPS, SOCKS4/4A, SOCKS5/5H, Trojan, VLESS, Shadowsocks, and VMess.\nTunnel protocols support TCP, WebSocket, and TLS; Resin users can put {account} in the username.",
  scopeConsoleAsset: "Grok Console (assets only)",
  accounts: "Bound", health: "Request health", healthHelp: "Accumulated from real Grok request successes, transport failures, and anti-bot rejections; independent of the connectivity probe.",
  addManually: "Form entry",
  probe: "Connectivity probe", probeHelp: "The latest independent IPv4 and IPv6 checks through the provider recorded with each result. This only confirms access to the IP echo endpoint; it does not guarantee Grok upstream availability or represent real request health.", probeLatency: "Probe latency: {{latency}} ms", probeProvider: "IP echo service", probeProviderHelp: "Choose the fixed service used for IPv4 and IPv6 connectivity checks. Cloudflare is the default and IPinfo remains selectable.", healthy: "Healthy", unhealthy: "Unhealthy", notTested: "Not tested", test: "Test proxy", testedOne: "Proxy test completed",
  operations: "Proxy operations", automation: "Automation", automationHelp: "Enabled proxy nodes are checked automatically. Account assignment and balancing run on schedule only when their switches are enabled.",
  subscriptions: "Proxy subscriptions", subscriptionsHelp: "Save and periodically sync proxy subscriptions into egress nodes.",
  testAll: "Check all", testAllHelp: "Check every enabled proxy node now and update its connectivity probe result.",
  rebalance: "Balance accounts", rebalanceHelp: "Assign unbound accounts and balance automatic bindings once. Manual bindings are not changed.",
  saveAutomationHelp: "Save the intervals and automatic-task switches below.",
  importText: "Batch import", importTextHelp: "Create proxy nodes once from a pasted list without saving a subscription URL.",
  addSource: "Add subscription", addSourceHelp: "Save a proxy subscription URL and sync it into egress nodes on the configured interval.",
  source: "Subscription", sync: "Sync", lastSync: "Last sync", capacity: "Account capacity", noSources: "No proxy subscriptions", never: "Never", unlimited: "Unlimited",
  searchSubscriptions: "Search proxy subscriptions", noSubscriptionMatches: "No proxy subscriptions match the current filters",
  sourceSaved: "Proxy subscription saved", sourceDeleted: "Proxy subscription deleted", sourceSynced: "Proxy subscription synced: {{imported}} imported, {{skipped}} skipped",
  imported: "Proxy import completed: {{imported}} imported, {{skipped}} skipped", tested: "Proxy test completed: {{healthy}} healthy, {{unhealthy}} unhealthy", testedPartial: "Connectivity probe partially completed: {{healthy}} healthy, {{unhealthy}} unhealthy, {{failed}} not completed",
  rebalanced: "Account allocation completed: {{assigned}} assigned, {{rebalanced}} balanced, {{unplaced}} unplaced", automationSaved: "Automation saved",
  editSource: "Edit subscription", subscriptionURL: "Subscription URL", sourceDialogDescription: "Configure the subscription URL, fetch route, scope, sync interval, and per-node account capacity.",
  subscriptionProxy: "Fetch through a proxy", subscriptionProxyURL: "Subscription fetch proxy", subscriptionRoute: "Fetch route", subscriptionProxyShort: "Proxy", invalidSubscriptionProxy: "Enter a valid HTTP, SOCKS, Trojan, VLESS, SS, or VMess proxy URL; {account} is not supported here",
  importDialogDescription: "Supports plain-text or Base64 proxy lists with one HTTP, SOCKS, Trojan, VLESS, SS, or VMess address per line.",
  probeInterval: "Node check interval", probeIntervalHelp: "How often to check whether enabled proxy nodes are available.",
  assignmentInterval: "Account assignment interval", assignmentIntervalHelp: "When automatic binding or balancing is enabled, controls how often account bindings and available node capacity are checked.",
  autoAssign: "Automatically bind accounts", autoAssignHelp: "Assign accounts without a proxy binding to available nodes automatically.",
  autoBalance: "Automatically balance accounts", autoBalanceHelp: "Redistribute automatically bound accounts across available nodes; manual bindings remain unchanged.",
  fallback: "Egress fallback", fallbackHelp: "Used only when no primary node can be acquired before an upstream request is sent. Fixed fallback nodes must be enabled, non-pool proxies.",
  fallbackBuildHelp: "Fallback used when no Grok Build primary egress is available.",
  fallbackWebHelp: "Fallback used when no Grok Web primary egress is available.",
  fallbackConsoleHelp: "Fallback used when no Grok Console primary egress is available.",
  fallbackWebAssetHelp: "Fallback used when no Grok Web asset egress is available.",
  fallbackConsoleAssetHelp: "Fallback used when no Grok Console asset egress is available; Console and Web nodes remain compatible secondary pools.",
  fallbackMode: "Fallback mode for {{scope}}", fallbackNone: "Do not fall back", fallbackDirect: "Local direct", fallbackFixed: "Fixed proxy",
  fallbackNode: "Fixed fallback proxy for {{scope}}", fallbackNodeUnavailable: "Configured node is unavailable",
  refreshInterval: "Subscription refresh interval (seconds)", proxyList: "Proxy list",
  search: "Search proxy nodes", assigned: "Assigned", unassigned: "Unassigned", noMatches: "No proxy nodes match the current filters", selectVisible: "Select filtered proxy nodes",
  batchEnabled: "Enabled {{updated}} proxy nodes", batchDisabled: "Disabled {{updated}} proxy nodes",
  batchDeleted: "Deleted {{deleted}} proxy nodes", batchDeleteTitle: "Delete {{count}} selected proxy nodes?", batchDeleteDescription: "This deletes the selected nodes and unbinds {{accounts}} associated accounts. This cannot be undone.",
  batchDeleteSourceHint: "{{count}} subscription-managed nodes may be recreated by the next sync.",
  cleanupUnavailable: "Clean up unavailable",
  cleanupUnavailableTitle: "Delete proxies unavailable on both stacks?",
  cleanupUnavailableDescription: "This checks all proxy nodes regardless of the current filters. Only nodes whose latest IPv4 and IPv6 probes are both unavailable will be deleted; untested nodes, single-stack nodes, and nodes with only one failed family are preserved.",
  cleanupUnavailableImpact: "Accounts using these nodes will be unbound. This operation cannot be undone.",
  cleanupPreviewLoading: "Calculating the affected range…",
  cleanupPreviewFailed: "Unable to calculate the affected range. Cleanup is disabled.",
  cleanupNodeCount: "Proxy nodes",
  cleanupAccountCount: "Accounts unbound",
  cleanupSubscriptionCount: "Subscription-managed",
  cleanupSubscriptionHint: "Subscription-managed nodes may be recreated by the next subscription sync.",
  cleanupUnavailableConfirm: "Delete unavailable",
  cleanupUnavailableComplete: "Deleted {{deleted}} unavailable proxy nodes",
});

Object.assign(resources["zh-CN"].translation.settings.egress as unknown as Record<string, string>, {
  automationHelp: "已启用的代理节点会自动定时检测；账号分配与均衡仅在开启对应开关后按间隔执行。",
  subscriptions: "代理订阅",
  subscriptionsHelp: "保存并定时同步代理订阅，生成或更新出口代理节点。",
  accounts: "已绑定",
  addManually: "表单导入",
  importText: "批量导入",
  testAll: "检测全部",
  testAllHelp: "立即检测所有已启用的代理节点，并更新连通探测结果。",
  testedPartial: "连通探测部分完成：可用 {{healthy}}，不可用 {{unhealthy}}，未完成 {{failed}}",
  rebalance: "均衡分配",
  rebalanceHelp: "立即分配未绑定账号并均衡自动绑定；不会修改手动绑定。",
  saveAutomationHelp: "保存下方的执行间隔和自动任务开关。",
  importTextHelp: "从粘贴的代理列表一次性创建节点，不保存订阅地址。",
  addSource: "添加订阅",
  addSourceHelp: "保存代理订阅地址，并按照同步间隔生成或更新出口代理节点。",
  source: "订阅",
  lastSync: "上次同步",
  searchSubscriptions: "搜索代理订阅",
  noSubscriptionMatches: "没有符合当前筛选条件的代理订阅",
  sourceSaved: "代理订阅已保存",
  sourceDeleted: "代理订阅已删除",
  sourceSynced: "代理订阅同步完成：导入 {{imported}}，跳过 {{skipped}}",
  editSource: "编辑订阅",
  sourceDialogDescription: "配置订阅地址、拉取线路、作用域、同步间隔和单节点账号容量。",
  subscriptionProxy: "使用代理拉取",
  subscriptionProxyURL: "订阅拉取代理地址",
  subscriptionRoute: "拉取线路",
  subscriptionProxyShort: "代理",
  invalidSubscriptionProxy: "请输入有效的 HTTP、SOCKS、Trojan、VLESS、SS 或 VMess 代理地址；此处不支持 {account}",
  refreshInterval: "同步间隔（秒）",
  noSources: "暂无代理订阅",
  probeInterval: "节点检测间隔",
  probeIntervalHelp: "每隔多久检测一次已启用的代理节点是否可用。",
  assignmentInterval: "账号分配间隔",
  assignmentIntervalHelp: "开启自动绑定或自动均衡后，每隔多久检查一次账号绑定和节点可用容量。",
  autoAssign: "自动绑定账号",
  autoAssignHelp: "将尚未绑定代理的账号自动分配到可用节点。",
  autoBalance: "自动均衡账号",
  autoBalanceHelp: "在可用节点之间重新分配自动绑定的账号；手动绑定不受影响。",
  fallback: "出口回退",
  fallbackHelp: "仅在请求尚未发往上游且没有可获取的主节点时使用。固定回退节点必须已启用且不是代理池。",
  fallbackBuildHelp: "Grok Build 没有可用主出口时使用的回退方式。",
  fallbackWebHelp: "Grok Web 没有可用主出口时使用的回退方式。",
  fallbackConsoleHelp: "Grok Console 没有可用主出口时使用的回退方式。",
  fallbackWebAssetHelp: "Grok Web 资源请求没有可用出口时使用的回退方式。",
  fallbackConsoleAssetHelp: "Grok Console 资源请求没有可用出口时使用的回退方式；Console 与 Web 节点仍可作为兼容的次级池。",
  fallbackMode: "{{scope}} 的回退方式",
  fallbackNone: "不回退",
  fallbackDirect: "本地直连",
  fallbackFixed: "固定代理",
  fallbackNode: "{{scope}} 的固定回退代理",
  fallbackNodeUnavailable: "已配置节点不可用",
  search: "搜索代理节点",
  healthy: "可用",
  assigned: "已分配账号",
  unassigned: "未分配账号",
  noMatches: "没有符合当前筛选条件的代理节点",
  selectVisible: "选择筛选出的代理节点",
  batchEnabled: "已启用 {{updated}} 个代理节点",
  batchDisabled: "已禁用 {{updated}} 个代理节点",
  batchDeleted: "已删除 {{deleted}} 个代理节点",
  batchDeleteTitle: "删除选中的 {{count}} 个代理节点？",
  batchDeleteDescription: "将删除选中的节点，并解除 {{accounts}} 个关联账号的代理绑定。此操作无法撤销。",
  batchDeleteSourceHint: "其中 {{count}} 个节点由代理订阅管理，下次同步时可能重新创建。",
  cleanupUnavailable: "清理不可用",
  cleanupUnavailableTitle: "删除双栈均不可用的代理？",
  cleanupUnavailableDescription: "将检查全部出口代理，不受当前搜索和筛选影响。仅删除最近一次 IPv4 与 IPv6 探测均明确为不可用的节点；未测试、单栈可用或仅一侧失败的节点都会保留。",
  cleanupUnavailableImpact: "使用这些节点的账号将解除代理绑定。此操作无法撤销。",
  cleanupPreviewLoading: "正在计算影响范围…",
  cleanupPreviewFailed: "无法计算影响范围，已禁止执行清理。",
  cleanupNodeCount: "代理节点",
  cleanupAccountCount: "解绑账号",
  cleanupSubscriptionCount: "订阅节点",
  cleanupSubscriptionHint: "订阅管理的节点可能在下次订阅同步时重新创建。",
  cleanupUnavailableConfirm: "删除不可用节点",
  cleanupUnavailableComplete: "已删除 {{deleted}} 个不可用代理节点",
});

Object.assign(resources["zh-CN"].translation.accounts as unknown as Record<string, string>, {
  clearCooldown: "解除冷却",
  cooldownCleared: "账号冷却已清除，可重新调度",
  enabledDoesNotClearCooldown: "已开关账号，但冷却状态未变。请用「解除冷却」清除 cooldownUntil。",
  importAuth: "导入账号或 RT 文件", quickImportRT: "快速导入 RT",
  quickImportRTTitle: "快速导入 Grok Build Refresh Token", quickImportRTDescription: "支持粘贴多个 xAI Refresh Token，或上传每行一个 RT 的 TXT 文件。导入时会先换取 access token，后续自动续期会沿用对应的 OAuth client ID。",
  refreshTokens: "Refresh Token（每行一个）", refreshTokenPlaceholder: "refresh_token_1\nrt=refresh_token_2\nrefresh_token=refresh_token_3",
  importedWithFailures: "导入完成：新增 {{created}}，更新 {{updated}}，跳过 {{skipped}}，RT 验证失败 {{failed}}；初始同步成功 {{synced}}，失败 {{syncFailed}}",
  refreshErrorStatus: "HTTP 状态", refreshErrorCode: "错误码", refreshErrorMessage: "错误信息", refreshErrorResponse: "额外详情",
  egressConfiguration: "代理配置", egressConfigurationTitle: "配置 {{count}} 个账号的代理", egressConfigurationDescription: "选择绑定或解绑所选账号的固定出口代理。",
  bindEgress: "绑定代理", unbindEgress: "解绑代理", unbindEgressDescription: "移除所选账号的固定代理绑定；账号随后按当前出口策略重新参与调度。",
  bindEgressNode: "代理节点", bindEgressEmpty: "请选择代理节点", bindEgressNoNodes: "当前账号池没有可绑定的代理节点", egressBound: "代理已绑定", egressUnbound: "代理已解绑", egressFilter: "代理绑定",
  egressNodeGroup: "代理出口", egressNodeGroupEmpty: "当前账号池没有匹配的代理出口", egressSourceGroup: "代理来源", egressSourceGroupEmpty: "当前账号池没有匹配的代理来源", egressFilterOptionsSearch: "搜索代理出口或来源", egressFilterOptionsLoadMore: "加载更多代理出口", egressFilterSourcesLoadMore: "加载更多代理来源", egressFilterOptionsLoadFailed: "代理筛选选项加载失败",
});

Object.assign(resources.en.translation.accounts as unknown as Record<string, string>, {
  clearCooldown: "Clear cooldown",
  cooldownCleared: "Account cooldown cleared; the account can be scheduled again",
  enabledDoesNotClearCooldown: "Enabled state changed, but cooldown is unchanged. Use Clear cooldown to reset cooldownUntil.",
  importAuth: "Import accounts or RTs", quickImportRT: "Quick import RTs",
  quickImportRTTitle: "Quick import Grok Build refresh tokens", quickImportRTDescription: "Paste xAI refresh tokens or upload a TXT file with one RT per line. Import exchanges each RT for an access token, and later renewals retain its OAuth client ID.",
  refreshTokens: "Refresh tokens (one per line)", refreshTokenPlaceholder: "refresh_token_1\nrt=refresh_token_2\nrefresh_token=refresh_token_3",
  importedWithFailures: "Import complete: {{created}} created, {{updated}} updated, {{skipped}} skipped, {{failed}} RT validations failed; initial sync {{synced}} succeeded, {{syncFailed}} failed",
  refreshErrorStatus: "HTTP status", refreshErrorCode: "Code", refreshErrorMessage: "Message", refreshErrorResponse: "Details",
  renewAllDescription: "Refresh every enabled Grok Build account with a refresh credential. Invalid accounts are forced to contact the upstream once; accounts without refresh credentials are skipped.",
  egressConfiguration: "Proxy configuration", egressConfigurationTitle: "Configure proxy for {{count}} accounts", egressConfigurationDescription: "Choose whether to bind or unbind a fixed egress proxy for the selected accounts.",
  bindEgress: "Bind proxy", unbindEgress: "Unbind proxy", unbindEgressDescription: "Remove fixed proxy bindings from the selected accounts. They will return to the current egress routing policy.",
  bindEgressNode: "Proxy node", bindEgressEmpty: "Select a proxy node", bindEgressNoNodes: "No compatible proxy nodes are available for this account pool", egressBound: "Proxy bound", egressUnbound: "Proxy unbound", egressFilter: "Proxy binding",
  egressNodeGroup: "Proxy egress", egressNodeGroupEmpty: "No matching proxy egress for this account pool", egressSourceGroup: "Proxy source", egressSourceGroupEmpty: "No matching proxy source for this account pool", egressFilterOptionsSearch: "Search proxy egress or source", egressFilterOptionsLoadMore: "Load more proxy egress", egressFilterSourcesLoadMore: "Load more proxy sources", egressFilterOptionsLoadFailed: "Failed to load proxy filter options",
});

Object.assign(resources["zh-CN"].translation.accountCredential as unknown as Record<string, string>, {
  detectAction: "检测账号",
});
Object.assign(resources.en.translation.accountCredential as unknown as Record<string, string>, {
  detectAction: "Detect accounts",
});
Object.assign(resources["zh-CN"].translation.accounts as unknown as Record<string, unknown>, {
  detectAllTitle: "检测全部 Grok Build 账号？",
  detectAllDescription: "将对每个启用且状态正常的 Grok Build 账号发起一次 grok-4.5 探测请求。已确认失效的账号会被标记并移出号池。",
  detectSelectedTitle: "检测选中的 {{count}} 个 Grok Build 账号？",
  detectSelectedDescription: "逐个验证所选账号，并显示正常、失效和检测失败结果。",
  detectAll: "开始检测",
  detectProgressLabel: "检测进度",
  detectInvalidCount: "已发现 {{count}} 个失效账号",
  detectSelectedSummary: "正常 {{ok}} · 失效 {{invalid}} · 失败 {{failed}}",
  detectResultsLimited: "结果列表仅保留最近 {{count}} 条；上方累计统计不受影响。",
  detectWaitingInvalid: "正在检测；这里只增量显示已确认失效的账号。",
  detectWaitingResults: "正在等待账号检测结果。",
  detectNoInvalid: "未发现失效账号。",
  detectNoResults: "暂无检测结果。",
  detectOutcome: { ok: "正常", invalid: "失效", failed: "失败" },
  batchDetected: "账号检测完成：成功 {{succeeded}}，失败 {{failed}}",
  allDetected: "全量检测完成：成功 {{succeeded}}，失败 {{failed}}",
});
Object.assign(resources.en.translation.accounts as unknown as Record<string, unknown>, {
  detectAllTitle: "Detect all Grok Build accounts?",
  detectAllDescription: "Probe each enabled and healthy Grok Build account with grok-4.5. Confirmed invalid accounts are marked and removed from routing.",
  detectSelectedTitle: "Detect {{count}} selected Grok Build accounts?",
  detectSelectedDescription: "Validate the selected accounts and show healthy, invalid, and failed results.",
  detectAll: "Start detection",
  detectProgressLabel: "Detection progress",
  detectInvalidCount: "{{count}} invalid accounts found",
  detectSelectedSummary: "Healthy {{ok}} · Invalid {{invalid}} · Failed {{failed}}",
  detectResultsLimited: "Only the latest {{count}} results are retained; cumulative totals above remain complete.",
  detectWaitingInvalid: "Detection is running; confirmed invalid accounts appear here.",
  detectWaitingResults: "Waiting for account detection results.",
  detectNoInvalid: "No invalid accounts found.",
  detectNoResults: "No detection results.",
  detectOutcome: { ok: "Healthy", invalid: "Invalid", failed: "Failed" },
  batchDetected: "Detection complete: {{succeeded}} succeeded, {{failed}} failed",
  allDetected: "Full detection complete: {{succeeded}} succeeded, {{failed}} failed",
});
Object.assign(resources.en.translation.accounts as unknown as Record<string, string>, {
  freeConfirmedUsage: "{{used}} / {{limit}} tokens",
});
Object.assign(resources["zh-CN"].translation.settings.routing as unknown as Record<string, string>, {
  maxAttemptsHelp: "单次请求的最大路由尝试轮次；初次选择计 1 次，切号或出口重试各增加 1 次。范围为 1–65535。",
  markBuildChatDeniedAsReauth: "Build Chat 权限拒绝标记重授权",
  markBuildChatDeniedAsReauthHelp: "开启后，Build Chat 请求遇到权限拒绝时将账号标记为需要重新授权并移出号池。",
});
Object.assign(resources.en.translation.settings.routing as unknown as Record<string, string>, {
  maxAttemptsHelp: "Maximum routing-attempt rounds per client request. Initial selection counts as one; account failover or egress retry adds another. Range: 1–65535.",
  markBuildChatDeniedAsReauth: "Mark Build Chat denied as reauth",
  markBuildChatDeniedAsReauthHelp: "Mark accounts that receive a Build Chat permission denial for reauthorization and remove them from routing.",
});
Object.assign(resources["zh-CN"].translation.settings.web as unknown as Record<string, string>, {
  clearanceModeHelp: "手动维护 Clearance，使用 FlareSolverr 定期主动刷新，或仅在上游明确拒绝后按需重新求解。",
  clearanceOnDemand: "按需刷新",
});
Object.assign(resources.en.translation.settings.web as unknown as Record<string, string>, {
  clearanceModeHelp: "Maintain Clearance manually, refresh it proactively with FlareSolverr, or solve on demand only after an explicit upstream rejection.",
  clearanceOnDemand: "On demand",
});
function readStoredLanguage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem("grok2api:language");
  } catch {
    return null;
  }
}

function storeLanguage(language: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("grok2api:language", language);
  } catch {
    // Language changes still apply when browser storage is unavailable.
  }
}

const storedLanguage = readStoredLanguage();

void i18n.use(initReactI18next).init({
  resources,
  lng: storedLanguage === "en" ? "en" : "zh-CN",
  fallbackLng: "zh-CN",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (language) => {
  storeLanguage(language);
  if (typeof document !== "undefined") document.documentElement.lang = language;
});

if (typeof document !== "undefined") document.documentElement.lang = i18n.language;

export { i18n };
