export { ApiError, requestVoid } from "./client"
export { getHealth, login, logout, getMe, setup, listKeys, createKey, deleteKey } from "./auth"
export { listEvents } from "./events"
export { listApprovals, getApproval, submitDecision } from "./approvals"
export { listBundles, listBundleVersions, uploadBundle, deployBundle, getBundleYaml, getCurrentBundle, evaluateBundle, listDeployments } from "./bundles"
export { getAgentStatus, getAgentCoverage, getFleetCoverage, getAgentHistory } from "./agents"
export { getStatsOverview, getContractStats } from "./stats"
export { listChannels, createChannel, updateChannel, deleteChannel, testChannel, rotateSigningKey, purgeEvents } from "./settings"

export type { HealthResponse, ServiceHealth, UserInfo, SetupResponse, ApiKeyInfo, CreateKeyResponse } from "./auth"
export type { EventResponse, EventFilters } from "./events"
export type { ApprovalResponse, ApprovalFilters } from "./approvals"
export type { BundleSummary, BundleResponse, BundleWithDeployments, DeploymentResponse, EvaluateRequest, EvaluateResponse, ContractEvaluation } from "./bundles"
export type {
  AgentStatusEntry, AgentFleetStatus,
  ToolCoverageEntry, CoverageSummary, DeployedBundle, AgentCoverage,
  AgentCoverageSummaryEntry, UngovernedToolEntry, FleetSummaryData, FleetCoverage,
  HistoryEvent, AgentHistory,
} from "./agents"
export type { StatsOverview, ContractCoverage, ContractStatsResponse } from "./stats"
export type { ChannelType, ChannelFilters, NotificationChannelInfo, CreateChannelRequest, UpdateChannelRequest, TestChannelResult, RotateKeyResponse, PurgeEventsResponse } from "./settings"
