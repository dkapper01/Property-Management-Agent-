import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '#app/utils/db.server.ts'
import {
	assertMembershipPermission,
	requireMembershipForUser,
} from '#app/utils/membership.server.ts'
import { getPropertyTimeline } from '#app/utils/timeline.server.ts'

type JsonRpcId = string | number | null

type JsonRpcRequest = {
	jsonrpc: '2.0'
	id?: JsonRpcId
	method?: string
	params?: unknown
}

type JsonRpcError = {
	code: number
	message: string
	data?: unknown
}

type JsonRpcResponse =
	| { jsonrpc: '2.0'; id: JsonRpcId; result: unknown }
	| { jsonrpc: '2.0'; id: JsonRpcId; error: JsonRpcError }

class JsonRpcHandlerError extends Error {
	code: number
	data?: unknown

	constructor(code: number, message: string, data?: unknown) {
		super(message)
		this.code = code
		this.data = data
	}
}

type HandlerContext = {
	request: Request
	userId: string
	params: unknown
}

const toJsonValue = (value: unknown) => value as Prisma.InputJsonValue
const toNullableJsonValue = (value: unknown | null | undefined) =>
	value == null ? Prisma.DbNull : (value as Prisma.InputJsonValue)

const MCP_PROTOCOL_METHODS = new Set([
	'initialize',
	'initialized',
	'tools/list',
	'tools/call',
])

const AGENT_LABEL_KEYS = ['agentName', 'name', 'agent', 'label', 'client']
const AGENT_TOOL_KEYS = ['sourceTool', 'tool', 'toolName']
const AGENT_RUN_KEYS = [
	'sourceRunId',
	'runId',
	'run_id',
	'traceId',
	'trace_id',
	'sessionId',
	'session_id',
]

function pickString(record: Record<string, unknown> | undefined, keys: string[]) {
	for (const key of keys) {
		const value = record?.[key]
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim()
		}
	}
	return undefined
}

function extractAgentContext(params: unknown) {
	if (!params || typeof params !== 'object') return undefined
	if (!('agentContext' in params)) return undefined
	const agentContext = (params as { agentContext?: unknown }).agentContext
	if (!agentContext || typeof agentContext !== 'object') return undefined
	return agentContext as Record<string, unknown>
}

function getAgentContextInfo(agentContext?: Record<string, unknown>) {
	const label = pickString(agentContext, AGENT_LABEL_KEYS)
	const sourceTool = pickString(agentContext, AGENT_TOOL_KEYS)
	const sourceRunId = pickString(agentContext, AGENT_RUN_KEYS)
	return { label, sourceTool, sourceRunId }
}

function buildMcpDraftProposedBy(
	userId: string,
	agentContext?: Record<string, unknown>,
) {
	const { label, sourceTool, sourceRunId } = getAgentContextInfo(agentContext)
	const hasAgentContext = Boolean(label || sourceTool || sourceRunId)
	return {
		proposedByType: hasAgentContext ? ('AGENT' as const) : ('MCP' as const),
		proposedByUserId: userId,
		proposedByLabel: label ?? 'MCP',
		sourceTool,
		sourceRunId,
	}
}

function buildMcpActorContext({
	params,
	request,
}: {
	params: unknown
	request: Request
}) {
	const agentContext = extractAgentContext(params)
	const { label } = getAgentContextInfo(agentContext)
	const hasAgentContext = Boolean(label)
	const userAgent = request.headers.get('user-agent') ?? undefined
	const metadata: Record<string, unknown> = { via: 'mcp' }
	if (label) metadata.agentLabel = label
	if (userAgent) metadata.userAgent = userAgent
	return {
		actorType: hasAgentContext ? ('AGENT' as const) : ('MCP' as const),
		actorLabel: label ?? (hasAgentContext ? 'AI Agent' : 'MCP'),
		actorMetadata: metadata,
	}
}

function assertDraftCreatePermission(
	membership: Parameters<typeof assertMembershipPermission>[0],
) {
	assertMembershipPermission(membership, 'create:draft-change:any')
}

function invalidParams(message: string, data?: Record<string, unknown>) {
	throw new JsonRpcHandlerError(-32602, 'Invalid params', {
		message,
		...data,
	})
}

function hashParams(params: unknown) {
	try {
		return createHash('sha256')
			.update(JSON.stringify(params ?? null))
			.digest('hex')
	} catch {
		return undefined
	}
}

function summarizeResult(result: unknown) {
	if (result == null) return 'null'
	if (Array.isArray(result)) return `array:${result.length}`
	if (typeof result === 'object') {
		const record = result as Record<string, unknown>
		const id = record.id
		if (typeof id === 'string') return `id:${id}`
		const draftId = record.draftId
		if (typeof draftId === 'string') return `draft:${draftId}`
		const status = record.status
		if (typeof status === 'string') return `status:${status}`
		return 'object'
	}
	return String(result)
}

async function logMcpInvocation({
	request,
	userId,
	method,
	params,
	result,
	error,
	durationMs,
}: {
	request: Request
	userId: string
	method: string
	params: unknown
	result?: unknown
	error?: unknown
	durationMs?: number
}) {
	if (MCP_PROTOCOL_METHODS.has(method)) return
	const agentContext = extractAgentContext(params)
	const actorContext = buildMcpActorContext({ params, request })
	const organizationIds = extractOrganizationIds(method, params, result)
	const paramsHash = hashParams(params)
	const resultSummary = summarizeResult(result)
	const status = error ? 'error' : 'ok'

	for (const organizationId of organizationIds) {
		await prisma.mcpToolInvocation.create({
			data: {
				organizationId,
				actorId: userId,
				actorType: actorContext.actorType,
				actorLabel: actorContext.actorLabel,
				actorMetadata: toNullableJsonValue(actorContext.actorMetadata),
				method,
				paramsHash,
				resultSummary,
				status,
				durationMs,
			},
		})
	}

	if (!organizationIds.length && agentContext) {
		await prisma.mcpToolInvocation.create({
			data: {
				organizationId: agentContext.organizationId as string,
				actorId: userId,
				actorType: actorContext.actorType,
				actorLabel: actorContext.actorLabel,
				actorMetadata: toNullableJsonValue(actorContext.actorMetadata),
				method,
				paramsHash,
				resultSummary,
				status,
				durationMs,
			},
		})
	}
}

async function safeLogMcpInvocation(args: Parameters<typeof logMcpInvocation>[0]) {
	try {
		await logMcpInvocation(args)
	} catch {
		// Logging must never break MCP responses.
	}
}

const OrgParams = z.object({
	organizationId: z.string().min(1),
})

const PropertyParams = OrgParams.extend({
	propertyId: z.string().min(1),
})

const AssetParams = OrgParams.extend({
	assetId: z.string().min(1),
})

const LeaseParams = OrgParams.extend({
	leaseId: z.string().min(1),
})

const MaintenanceParams = OrgParams.extend({
	maintenanceEventId: z.string().min(1),
})

const VendorParams = OrgParams.extend({
	vendorId: z.string().min(1),
})

const DocumentParams = OrgParams.extend({
	documentId: z.string().min(1),
})

const FinancialParams = OrgParams.extend({
	financialEntryId: z.string().min(1),
})

const AssetListParams = OrgParams.extend({
	propertyId: z.string().min(1).optional(),
})

const LeaseListParams = OrgParams.extend({
	propertyId: z.string().min(1).optional(),
})

const MaintenanceListParams = OrgParams.extend({
	propertyId: z.string().min(1).optional(),
})

const DocumentListParams = OrgParams.extend({
	propertyId: z.string().min(1).optional(),
})

const FinanceListParams = OrgParams.extend({
	propertyId: z.string().min(1).optional(),
})

const TimelineParams = OrgParams.extend({
	propertyId: z.string().min(1),
	limit: z.number().int().min(1).max(200).optional(),
	includeAuditLogs: z.boolean().optional(),
})

const NoteListParams = OrgParams.extend({
	entityType: z.string().optional(),
	entityId: z.string().optional(),
})

const DraftListParams = OrgParams.extend({
	status: z.enum(['DRAFT', 'APPROVED', 'REJECTED', 'APPLIED']).optional(),
})

const DraftIdParams = z.object({
	draftId: z.string().min(1),
})

const AgentContextSchema = z
	.object({
		agentName: z.string().min(1).optional(),
		sourceTool: z.string().min(1).optional(),
		sourceRunId: z.string().min(1).optional(),
	})
	.strict()

const DraftEnvelopeSchema = OrgParams.extend({
	label: z.string().optional(),
	reasoningSummary: z.string().min(1),
	confidence: z.number().min(0).max(1).optional(),
	agentContext: AgentContextSchema.optional(),
})

const DraftPropertyDataSchema = z
	.object({
		name: z.string().min(1),
		address: z.string().min(1),
		purchaseDate: z.string().min(1),
		purchasePrice: z.number(),
		ownershipType: z.enum(['INDIVIDUAL', 'LLC', 'PARTNERSHIP']),
		status: z.enum(['OWNER_OCCUPIED', 'RENTED', 'VACANT', 'RENOVATING']),
		country: z.string().nullable().optional(),
		notes: z.string().nullable().optional(),
	})
	.strict()

const DraftAssetDataSchema = z
	.object({
		propertyId: z.string().min(1),
		assetType: z.enum([
			'ROOF',
			'HVAC',
			'WATER_HEATER',
			'APPLIANCES',
			'PLUMBING',
			'ELECTRICAL',
			'OTHER',
		]),
		installDate: z.string().nullable().optional(),
		brandModel: z.string().nullable().optional(),
		notes: z.string().nullable().optional(),
	})
	.strict()

const DraftMaintenanceDataSchema = z
	.object({
		propertyId: z.string().min(1),
		dateReported: z.string().min(1),
		severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
		status: z.enum(['OPEN', 'RESOLVED']),
		description: z.string().min(1),
		cost: z.number().nullable().optional(),
		assetId: z.string().nullable().optional(),
		vendorId: z.string().nullable().optional(),
	})
	.strict()

const DraftMaintenanceUpdateDataSchema = z
	.object({
		maintenanceEventId: z.string().min(1),
		status: z.enum(['OPEN', 'RESOLVED']),
	})
	.strict()

const DraftLeaseDataSchema = z
	.object({
		propertyId: z.string().min(1),
		tenantName: z.string().min(1),
		leaseStartDate: z.string().min(1),
		monthlyRent: z.number(),
		securityDeposit: z.number(),
		paymentDueDay: z.number().int().min(1).max(31),
		leaseEndDate: z.string().nullable().optional(),
	})
	.strict()

const DraftFinanceDataSchema = z
	.object({
		propertyId: z.string().min(1),
		date: z.string().min(1),
		amount: z.number().min(0),
		category: z.enum([
			'RENT_INCOME',
			'MORTGAGE',
			'INSURANCE',
			'MAINTENANCE',
			'CAPEX',
			'UTILITIES',
			'HOA',
			'TAXES',
			'OTHER',
		]),
		notes: z.string().nullable().optional(),
		vendorId: z.string().nullable().optional(),
		maintenanceEventId: z.string().nullable().optional(),
	})
	.strict()

const DraftNoteDataSchema = z
	.object({
		entityType: z.enum([
			'property',
			'asset',
			'maintenance-event',
			'document',
			'lease',
		]),
		entityId: z.string().min(1),
		body: z.string().min(1),
		tags: z.array(z.string().min(1)).nullable().optional(),
		isDecisionNote: z.boolean().nullable().optional(),
	})
	.strict()

const DraftDocumentDataSchema = z
	.object({
		propertyId: z.string().min(1),
		documentType: z.enum([
			'LEASE',
			'INSURANCE',
			'INSPECTION',
			'MORTGAGE',
			'HOA',
			'WARRANTY',
			'OTHER',
		]),
		date: z.string().min(1),
		fileKey: z.string().min(1),
		aiSummary: z.string().nullable().optional(),
		notes: z.string().nullable().optional(),
		assetId: z.string().nullable().optional(),
	})
	.strict()

const DraftCreatePropertyParams = DraftEnvelopeSchema.extend({
	data: DraftPropertyDataSchema,
}).strict()

const DraftCreateAssetParams = DraftEnvelopeSchema.extend({
	data: DraftAssetDataSchema,
}).strict()

const DraftCreateMaintenanceParams = DraftEnvelopeSchema.extend({
	data: DraftMaintenanceDataSchema,
}).strict()

const DraftUpdateMaintenanceParams = DraftEnvelopeSchema.extend({
	data: DraftMaintenanceUpdateDataSchema,
}).strict()

const DraftCreateNoteParams = DraftEnvelopeSchema.extend({
	data: DraftNoteDataSchema,
}).strict()

const DraftCreateLeaseParams = DraftEnvelopeSchema.extend({
	data: DraftLeaseDataSchema,
}).strict()

const DraftCreateFinanceParams = DraftEnvelopeSchema.extend({
	data: DraftFinanceDataSchema,
}).strict()

const DraftCreateDocumentParams = DraftEnvelopeSchema.extend({
	data: DraftDocumentDataSchema,
}).strict()

const JsonSchemaString = { type: 'string', minLength: 1 }
const JsonSchemaOptionalString = { type: 'string' }

const AgentContextJsonSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		agentName: JsonSchemaString,
		sourceTool: JsonSchemaString,
		sourceRunId: JsonSchemaString,
	},
}

function buildDraftInputSchema(dataSchema: Record<string, unknown>) {
	return {
		type: 'object',
		additionalProperties: false,
		required: ['organizationId', 'reasoningSummary', 'data'],
		properties: {
			organizationId: JsonSchemaString,
			label: JsonSchemaOptionalString,
			reasoningSummary: JsonSchemaString,
			confidence: { type: 'number', minimum: 0, maximum: 1 },
			agentContext: AgentContextJsonSchema,
			data: dataSchema,
		},
	}
}

const DraftPropertyDataJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: [
		'name',
		'address',
		'purchaseDate',
		'purchasePrice',
		'ownershipType',
		'status',
	],
	properties: {
		name: JsonSchemaString,
		address: JsonSchemaString,
		purchaseDate: JsonSchemaString,
		purchasePrice: { type: 'number' },
		ownershipType: {
			type: 'string',
			enum: ['INDIVIDUAL', 'LLC', 'PARTNERSHIP'],
		},
		status: {
			type: 'string',
			enum: ['OWNER_OCCUPIED', 'RENTED', 'VACANT', 'RENOVATING'],
		},
		country: { type: ['string', 'null'] },
		notes: { type: ['string', 'null'] },
	},
}

const DraftAssetDataJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['propertyId', 'assetType'],
	properties: {
		propertyId: JsonSchemaString,
		assetType: {
			type: 'string',
			enum: [
				'ROOF',
				'HVAC',
				'WATER_HEATER',
				'APPLIANCES',
				'PLUMBING',
				'ELECTRICAL',
				'OTHER',
			],
		},
		installDate: { type: ['string', 'null'] },
		brandModel: { type: ['string', 'null'] },
		notes: { type: ['string', 'null'] },
	},
}

const DraftMaintenanceDataJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['propertyId', 'dateReported', 'severity', 'status', 'description'],
	properties: {
		propertyId: JsonSchemaString,
		dateReported: JsonSchemaString,
		severity: {
			type: 'string',
			enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
		},
		status: {
			type: 'string',
			enum: ['OPEN', 'RESOLVED'],
		},
		description: JsonSchemaString,
		cost: { type: ['number', 'null'] },
		assetId: { type: ['string', 'null'] },
		vendorId: { type: ['string', 'null'] },
	},
}

const DraftMaintenanceUpdateDataJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['maintenanceEventId', 'status'],
	properties: {
		maintenanceEventId: JsonSchemaString,
		status: {
			type: 'string',
			enum: ['OPEN', 'RESOLVED'],
		},
	},
}

const DraftLeaseDataJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: [
		'propertyId',
		'tenantName',
		'leaseStartDate',
		'monthlyRent',
		'securityDeposit',
		'paymentDueDay',
	],
	properties: {
		propertyId: JsonSchemaString,
		tenantName: JsonSchemaString,
		leaseStartDate: JsonSchemaString,
		monthlyRent: { type: 'number' },
		securityDeposit: { type: 'number' },
		paymentDueDay: { type: 'number', minimum: 1, maximum: 31 },
		leaseEndDate: { type: ['string', 'null'] },
	},
}

const DraftFinanceDataJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['propertyId', 'date', 'amount', 'category'],
	properties: {
		propertyId: JsonSchemaString,
		date: JsonSchemaString,
		amount: { type: 'number', minimum: 0 },
		category: {
			type: 'string',
			enum: [
				'RENT_INCOME',
				'MORTGAGE',
				'INSURANCE',
				'MAINTENANCE',
				'CAPEX',
				'UTILITIES',
				'HOA',
				'TAXES',
				'OTHER',
			],
		},
		notes: { type: ['string', 'null'] },
		vendorId: { type: ['string', 'null'] },
		maintenanceEventId: { type: ['string', 'null'] },
	},
}

const DraftNoteDataJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['entityType', 'entityId', 'body'],
	properties: {
		entityType: {
			type: 'string',
			enum: ['property', 'asset', 'maintenance-event', 'document', 'lease'],
		},
		entityId: JsonSchemaString,
		body: JsonSchemaString,
		tags: {
			type: ['array', 'null'],
			items: JsonSchemaString,
		},
		isDecisionNote: { type: ['boolean', 'null'] },
	},
}

const DraftDocumentDataJsonSchema = {
	type: 'object',
	additionalProperties: false,
	required: ['propertyId', 'documentType', 'date', 'fileKey'],
	properties: {
		propertyId: JsonSchemaString,
		documentType: {
			type: 'string',
			enum: [
				'LEASE',
				'INSURANCE',
				'INSPECTION',
				'MORTGAGE',
				'HOA',
				'WARRANTY',
				'OTHER',
			],
		},
		date: JsonSchemaString,
		fileKey: JsonSchemaString,
		aiSummary: { type: ['string', 'null'] },
		notes: { type: ['string', 'null'] },
		assetId: { type: ['string', 'null'] },
	},
}

const MCP_TOOL_DEFINITIONS: Array<{
	name: string
	description: string
	inputSchema: Record<string, unknown>
}> = [
	{
		name: 'org_list',
		description: 'List workspaces available to the current user.',
		inputSchema: { type: 'object', additionalProperties: true, properties: {} },
	},
	{
		name: 'org_get',
		description: 'Get a workspace by id.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: { organizationId: JsonSchemaString },
			required: ['organizationId'],
		},
	},
	{
		name: 'property_list',
		description: 'List properties in a workspace.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: { organizationId: JsonSchemaString },
			required: ['organizationId'],
		},
	},
	{
		name: 'property_get',
		description: 'Get a property by id.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				propertyId: JsonSchemaString,
			},
			required: ['organizationId', 'propertyId'],
		},
	},
	{
		name: 'asset_list',
		description: 'List assets in a workspace or property.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				propertyId: JsonSchemaString,
			},
			required: ['organizationId'],
		},
	},
	{
		name: 'asset_get',
		description: 'Get an asset by id.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				assetId: JsonSchemaString,
			},
			required: ['organizationId', 'assetId'],
		},
	},
	{
		name: 'lease_list',
		description: 'List leases in a workspace or property.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				propertyId: JsonSchemaString,
			},
			required: ['organizationId'],
		},
	},
	{
		name: 'lease_get',
		description: 'Get a lease by id.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				leaseId: JsonSchemaString,
			},
			required: ['organizationId', 'leaseId'],
		},
	},
	{
		name: 'maintenance_list',
		description: 'List maintenance events in a workspace or property.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				propertyId: JsonSchemaString,
			},
			required: ['organizationId'],
		},
	},
	{
		name: 'maintenance_get',
		description: 'Get a maintenance event by id.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				maintenanceEventId: JsonSchemaString,
			},
			required: ['organizationId', 'maintenanceEventId'],
		},
	},
	{
		name: 'vendor_list',
		description: 'List vendors in a workspace.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: { organizationId: JsonSchemaString },
			required: ['organizationId'],
		},
	},
	{
		name: 'vendor_get',
		description: 'Get a vendor by id.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				vendorId: JsonSchemaString,
			},
			required: ['organizationId', 'vendorId'],
		},
	},
	{
		name: 'document_list',
		description: 'List documents in a workspace or property.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				propertyId: JsonSchemaString,
			},
			required: ['organizationId'],
		},
	},
	{
		name: 'document_get',
		description: 'Get a document by id.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				documentId: JsonSchemaString,
			},
			required: ['organizationId', 'documentId'],
		},
	},
	{
		name: 'finance_list',
		description: 'List financial entries in a workspace or property.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				propertyId: JsonSchemaString,
			},
			required: ['organizationId'],
		},
	},
	{
		name: 'finance_get',
		description: 'Get a financial entry by id.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				financialEntryId: JsonSchemaString,
			},
			required: ['organizationId', 'financialEntryId'],
		},
	},
	{
		name: 'timeline_list',
		description: 'Get a property timeline feed.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				propertyId: JsonSchemaString,
				limit: { type: 'number', minimum: 1, maximum: 200 },
				includeAuditLogs: { type: 'boolean' },
			},
			required: ['organizationId', 'propertyId'],
		},
	},
	{
		name: 'note_list',
		description: 'List notes in a workspace or entity.',
		inputSchema: {
			type: 'object',
			additionalProperties: true,
			properties: {
				organizationId: JsonSchemaString,
				entityType: { type: 'string' },
				entityId: JsonSchemaString,
			},
			required: ['organizationId'],
		},
	},
	{
		name: 'draft_create_property',
		description: 'Create a property DraftChange proposal.',
		inputSchema: buildDraftInputSchema(DraftPropertyDataJsonSchema),
	},
	{
		name: 'draft_create_asset',
		description: 'Create an asset DraftChange proposal.',
		inputSchema: buildDraftInputSchema(DraftAssetDataJsonSchema),
	},
	{
		name: 'draft_create_maintenance',
		description: 'Create a maintenance DraftChange proposal.',
		inputSchema: buildDraftInputSchema(DraftMaintenanceDataJsonSchema),
	},
	{
		name: 'draft_update_maintenance',
		description: 'Update a maintenance DraftChange proposal.',
		inputSchema: buildDraftInputSchema(DraftMaintenanceUpdateDataJsonSchema),
	},
	{
		name: 'draft_create_note',
		description: 'Create a note DraftChange proposal.',
		inputSchema: buildDraftInputSchema(DraftNoteDataJsonSchema),
	},
	{
		name: 'draft_create_document',
		description: 'Create a document DraftChange proposal.',
		inputSchema: buildDraftInputSchema(DraftDocumentDataJsonSchema),
	},
	{
		name: 'draft_create_lease',
		description: 'Create a lease DraftChange proposal.',
		inputSchema: buildDraftInputSchema(DraftLeaseDataJsonSchema),
	},
	{
		name: 'draft_create_finance',
		description: 'Create a financial entry DraftChange proposal.',
		inputSchema: buildDraftInputSchema(DraftFinanceDataJsonSchema),
	},
	{
		name: 'draft_list',
		description: 'List draft changes for a workspace.',
		inputSchema: {
			type: 'object',
			properties: {
				organizationId: JsonSchemaString,
				status: {
					type: 'string',
					enum: ['DRAFT', 'APPROVED', 'REJECTED', 'APPLIED'],
				},
			},
			required: ['organizationId'],
		},
	},
	{
		name: 'draft_get',
		description: 'Get a draft change by id.',
		inputSchema: {
			type: 'object',
			properties: { draftId: JsonSchemaString },
			required: ['draftId'],
		},
	},
	{
		name: 'draft_preview',
		description: 'Preview a draft change payload.',
		inputSchema: {
			type: 'object',
			properties: { draftId: JsonSchemaString },
			required: ['draftId'],
		},
	},
]

async function assertPropertyInOrg({
	organizationId,
	propertyId,
}: {
	organizationId: string
	propertyId: string
}) {
	const property = await prisma.property.findFirst({
		where: { id: propertyId, organizationId },
		select: { id: true },
	})
	if (!property) {
		invalidParams('Property not found', { propertyId })
	}
	return property
}

async function assertAssetInProperty({
	organizationId,
	propertyId,
	assetId,
}: {
	organizationId: string
	propertyId: string
	assetId: string
}) {
	const asset = await prisma.asset.findFirst({
		where: { id: assetId, propertyId, property: { organizationId } },
		select: { id: true },
	})
	if (!asset) {
		invalidParams('Asset not found for property', { assetId, propertyId })
	}
	return asset
}

async function assertVendorInOrg({
	organizationId,
	vendorId,
}: {
	organizationId: string
	vendorId: string
}) {
	const vendor = await prisma.vendor.findFirst({
		where: { id: vendorId, organizationId },
		select: { id: true },
	})
	if (!vendor) {
		invalidParams('Vendor not found', { vendorId })
	}
	return vendor
}

async function assertMaintenanceInOrg({
	organizationId,
	maintenanceEventId,
}: {
	organizationId: string
	maintenanceEventId: string
}) {
	const maintenance = await prisma.maintenanceEvent.findFirst({
		where: { id: maintenanceEventId, property: { organizationId } },
		select: { id: true, propertyId: true },
	})
	if (!maintenance) {
		invalidParams('Maintenance event not found', { maintenanceEventId })
	}
	return maintenance
}

async function assertMaintenanceInProperty({
	organizationId,
	propertyId,
	maintenanceEventId,
}: {
	organizationId: string
	propertyId: string
	maintenanceEventId: string
}) {
	const maintenance = await prisma.maintenanceEvent.findFirst({
		where: {
			id: maintenanceEventId,
			propertyId,
			property: { organizationId },
		},
		select: { id: true },
	})
	if (!maintenance) {
		invalidParams('Maintenance event not found for property', {
			maintenanceEventId,
			propertyId,
		})
	}
	return maintenance
}

const handlers: Record<
	string,
	(context: HandlerContext) => Promise<unknown>
> = {
	initialize: async () => ({
		protocolVersion: '2024-11-05',
		serverInfo: { name: 'property-mcp', version: 'v1' },
		capabilities: { tools: {} },
	}),
	initialized: async () => ({ ok: true }),
	'tools/list': async () => ({
		tools: MCP_TOOL_DEFINITIONS.map(({ name, description, inputSchema }) => ({
			name,
			description,
			inputSchema,
		})),
	}),
	'tools/call': async ({ request, userId, params }) => {
		const body = z
			.object({ name: z.string(), arguments: z.unknown().optional() })
			.parse(params)
		const handler = handlers[body.name]
		if (!handler) {
			throw new JsonRpcHandlerError(-32601, 'Method not found', {
				tool: body.name,
			})
		}
		const result = await handler({ request, userId, params: body.arguments })
		return { content: [{ type: 'text', text: JSON.stringify(result) }] }
	},
	'org_list': async ({ userId }) => {
		const memberships = await prisma.membership.findMany({
			where: { userId },
			select: {
				organization: { select: { id: true, name: true } },
				role: { select: { name: true } },
			},
			orderBy: { createdAt: 'asc' },
		})
		return memberships
	},
	'org_get': async ({ userId, params }) => {
		const { organizationId } = OrgParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:organization:any')
		return prisma.organization.findUnique({
			where: { id: organizationId },
			select: { id: true, name: true },
		})
	},
	'property_list': async ({ userId, params }) => {
		const { organizationId } = OrgParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:property:any')
		return prisma.property.findMany({
			where: { organizationId },
			select: {
				id: true,
				name: true,
				address: true,
				country: true,
				status: true,
				purchaseDate: true,
				purchasePrice: true,
				ownershipType: true,
				createdAt: true,
				updatedAt: true,
			},
			orderBy: { name: 'asc' },
		})
	},
	'property_get': async ({ userId, params }) => {
		const { organizationId, propertyId } = PropertyParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:property:any')
		return prisma.property.findFirst({
			where: { id: propertyId, organizationId },
			select: {
				id: true,
				name: true,
				address: true,
				country: true,
				purchaseDate: true,
				purchasePrice: true,
				ownershipType: true,
				status: true,
				notes: true,
				createdAt: true,
				updatedAt: true,
			},
		})
	},
	'asset_list': async ({ userId, params }) => {
		const { organizationId, propertyId } = AssetListParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:asset:any')
		return prisma.asset.findMany({
			where: {
				property: { organizationId },
				...(propertyId ? { propertyId } : {}),
			},
			select: {
				id: true,
				assetType: true,
				installDate: true,
				brandModel: true,
				notes: true,
				createdAt: true,
				property: { select: { id: true, name: true } },
			},
			orderBy: { createdAt: 'desc' },
		})
	},
	'asset_get': async ({ userId, params }) => {
		const { organizationId, assetId } = AssetParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:asset:any')
		return prisma.asset.findFirst({
			where: { id: assetId, property: { organizationId } },
			select: {
				id: true,
				assetType: true,
				installDate: true,
				brandModel: true,
				notes: true,
				createdAt: true,
				property: { select: { id: true, name: true } },
			},
		})
	},
	'lease_list': async ({ userId, params }) => {
		const { organizationId, propertyId } = LeaseListParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:lease:any')
		return prisma.lease.findMany({
			where: {
				property: { organizationId },
				...(propertyId ? { propertyId } : {}),
			},
			select: {
				id: true,
				tenantName: true,
				leaseStartDate: true,
				leaseEndDate: true,
				monthlyRent: true,
				securityDeposit: true,
				paymentDueDay: true,
				createdAt: true,
				property: { select: { id: true, name: true } },
			},
			orderBy: { leaseStartDate: 'desc' },
		})
	},
	'lease_get': async ({ userId, params }) => {
		const { organizationId, leaseId } = LeaseParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:lease:any')
		return prisma.lease.findFirst({
			where: { id: leaseId, property: { organizationId } },
			select: {
				id: true,
				tenantName: true,
				leaseStartDate: true,
				leaseEndDate: true,
				monthlyRent: true,
				securityDeposit: true,
				paymentDueDay: true,
				createdAt: true,
				property: { select: { id: true, name: true } },
			},
		})
	},
	'timeline_list': async ({ userId, params }) => {
		const { organizationId, propertyId, limit, includeAuditLogs } =
			TimelineParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:timeline-event:any')
		if (includeAuditLogs) {
			assertMembershipPermission(membership, 'read:audit-log:any')
		}
		return getPropertyTimeline({
			organizationId,
			propertyId,
			limit,
			includeAuditLogs: includeAuditLogs ?? false,
		})
	},
	'maintenance_list': async ({ userId, params }) => {
		const { organizationId, propertyId } = MaintenanceListParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:maintenance-event:any')
		return prisma.maintenanceEvent.findMany({
			where: {
				property: { organizationId },
				...(propertyId ? { propertyId } : {}),
			},
			select: {
				id: true,
				description: true,
				status: true,
				severity: true,
				dateReported: true,
				property: { select: { id: true, name: true } },
			},
			orderBy: { dateReported: 'desc' },
		})
	},
	'maintenance_get': async ({ userId, params }) => {
		const { organizationId, maintenanceEventId } =
			MaintenanceParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:maintenance-event:any')
		return prisma.maintenanceEvent.findFirst({
			where: { id: maintenanceEventId, property: { organizationId } },
			select: {
				id: true,
				description: true,
				status: true,
				severity: true,
				dateReported: true,
				cost: true,
				property: { select: { id: true, name: true } },
			},
		})
	},
	'vendor_list': async ({ userId, params }) => {
		const { organizationId } = OrgParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:vendor:any')
		return prisma.vendor.findMany({
			where: { organizationId },
			select: {
				id: true,
				name: true,
				category: true,
				phone: true,
				email: true,
				website: true,
				notes: true,
				createdAt: true,
				updatedAt: true,
			},
			orderBy: { name: 'asc' },
		})
	},
	'vendor_get': async ({ userId, params }) => {
		const { organizationId, vendorId } = VendorParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:vendor:any')
		return prisma.vendor.findFirst({
			where: { id: vendorId, organizationId },
			select: {
				id: true,
				name: true,
				category: true,
				phone: true,
				email: true,
				website: true,
				notes: true,
				createdAt: true,
				updatedAt: true,
			},
		})
	},
	'document_list': async ({ userId, params }) => {
		const { organizationId, propertyId } = DocumentListParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:document:any')
		return prisma.document.findMany({
			where: {
				property: { organizationId },
				...(propertyId ? { propertyId } : {}),
			},
			select: {
				id: true,
				documentType: true,
				date: true,
				fileKey: true,
				aiSummary: true,
				notes: true,
				createdAt: true,
				asset: { select: { id: true, assetType: true, brandModel: true } },
				property: { select: { id: true, name: true } },
			},
			orderBy: { date: 'desc' },
		})
	},
	'document_get': async ({ userId, params }) => {
		const { organizationId, documentId } = DocumentParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:document:any')
		return prisma.document.findFirst({
			where: { id: documentId, property: { organizationId } },
			select: {
				id: true,
				documentType: true,
				date: true,
				fileKey: true,
				aiSummary: true,
				notes: true,
				createdAt: true,
				asset: { select: { id: true, assetType: true, brandModel: true } },
				property: { select: { id: true, name: true } },
			},
		})
	},
	'finance_list': async ({ userId, params }) => {
		const { organizationId, propertyId } = FinanceListParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:financial-entry:any')
		return prisma.financialEntry.findMany({
			where: {
				organizationId,
				...(propertyId ? { propertyId } : {}),
			},
			select: {
				id: true,
				category: true,
				amount: true,
				date: true,
				notes: true,
				createdAt: true,
				property: { select: { id: true, name: true } },
				vendor: { select: { id: true, name: true } },
				maintenanceEvent: { select: { id: true, description: true } },
				document: { select: { id: true, documentType: true } },
			},
			orderBy: { date: 'desc' },
		})
	},
	'finance_get': async ({ userId, params }) => {
		const { organizationId, financialEntryId } = FinancialParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:financial-entry:any')
		return prisma.financialEntry.findFirst({
			where: { id: financialEntryId, organizationId },
			select: {
				id: true,
				category: true,
				amount: true,
				date: true,
				notes: true,
				createdAt: true,
				property: { select: { id: true, name: true } },
				vendor: { select: { id: true, name: true } },
				maintenanceEvent: { select: { id: true, description: true } },
				document: { select: { id: true, documentType: true } },
			},
		})
	},
	'note_list': async ({ userId, params }) => {
		const { organizationId, entityType, entityId } = NoteListParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:entity-note:any')
		return prisma.entityNote.findMany({
			where: {
				organizationId,
				...(entityType ? { entityType } : {}),
				...(entityId ? { entityId } : {}),
			},
			select: {
				id: true,
				entityType: true,
				entityId: true,
				body: true,
				tags: true,
				isDecisionNote: true,
				createdAt: true,
				createdBy: { select: { id: true, name: true, username: true } },
			},
			orderBy: { createdAt: 'desc' },
		})
	},
	'draft_create_property': async ({ userId, params }) => {
		const parsed = DraftCreatePropertyParams.parse(params)
		const membership = await requireMembershipForUser(parsed.organizationId, userId)
		assertDraftCreatePermission(membership)
		assertMembershipPermission(membership, 'create:property:any')

		const draft = await prisma.draftChange.create({
			data: {
				organizationId: parsed.organizationId,
				createdByUserId: userId,
				...buildMcpDraftProposedBy(userId, parsed.agentContext),
				status: 'DRAFT',
				title: parsed.label ?? 'Create property',
				summary: parsed.label ?? 'Create property',
				reasoningSummary: parsed.reasoningSummary,
				confidence: parsed.confidence ?? null,
				entityType: 'property',
				operations: toJsonValue([
					{ op: 'create', entityType: 'property', data: parsed.data },
				]),
				validation: toJsonValue({ status: 'PASS', errors: [] }),
				agentContext: toNullableJsonValue(parsed.agentContext),
			},
		})

		return { draftId: draft.id, status: draft.status }
	},
	'draft_create_asset': async ({ userId, params }) => {
		const parsed = DraftCreateAssetParams.parse(params)
		const membership = await requireMembershipForUser(parsed.organizationId, userId)
		assertDraftCreatePermission(membership)
		assertMembershipPermission(membership, 'create:asset:any')
		await assertPropertyInOrg({
			organizationId: parsed.organizationId,
			propertyId: parsed.data.propertyId,
		})

		const draft = await prisma.draftChange.create({
			data: {
				organizationId: parsed.organizationId,
				createdByUserId: userId,
				...buildMcpDraftProposedBy(userId, parsed.agentContext),
				status: 'DRAFT',
				title: parsed.label ?? 'Create asset',
				summary: parsed.label ?? 'Create asset',
				reasoningSummary: parsed.reasoningSummary,
				confidence: parsed.confidence ?? null,
				entityType: 'asset',
				operations: toJsonValue([
					{ op: 'create', entityType: 'asset', data: parsed.data },
				]),
				validation: toJsonValue({ status: 'PASS', errors: [] }),
				agentContext: toNullableJsonValue(parsed.agentContext),
			},
		})

		return { draftId: draft.id, status: draft.status }
	},
	'draft_create_maintenance': async ({ userId, params }) => {
		const parsed = DraftCreateMaintenanceParams.parse(params)
		const membership = await requireMembershipForUser(parsed.organizationId, userId)
		assertDraftCreatePermission(membership)
		assertMembershipPermission(membership, 'create:maintenance-event:any')
		await assertPropertyInOrg({
			organizationId: parsed.organizationId,
			propertyId: parsed.data.propertyId,
		})
		if (parsed.data.assetId) {
			await assertAssetInProperty({
				organizationId: parsed.organizationId,
				propertyId: parsed.data.propertyId,
				assetId: parsed.data.assetId,
			})
		}
		if (parsed.data.vendorId) {
			await assertVendorInOrg({
				organizationId: parsed.organizationId,
				vendorId: parsed.data.vendorId,
			})
		}

		const draft = await prisma.draftChange.create({
			data: {
				organizationId: parsed.organizationId,
				createdByUserId: userId,
				...buildMcpDraftProposedBy(userId, parsed.agentContext),
				status: 'DRAFT',
				title: parsed.label ?? 'Log maintenance event',
				summary: parsed.label ?? 'Log maintenance event',
				reasoningSummary: parsed.reasoningSummary,
				confidence: parsed.confidence ?? null,
				entityType: 'maintenance-event',
				operations: toJsonValue([
					{ op: 'create', entityType: 'maintenance-event', data: parsed.data },
				]),
				validation: toJsonValue({ status: 'PASS', errors: [] }),
				agentContext: toNullableJsonValue(parsed.agentContext),
			},
		})

		return { draftId: draft.id, status: draft.status }
	},
	'draft_update_maintenance': async ({ userId, params }) => {
		const parsed = DraftUpdateMaintenanceParams.parse(params)
		const membership = await requireMembershipForUser(parsed.organizationId, userId)
		assertDraftCreatePermission(membership)
		assertMembershipPermission(membership, 'update:maintenance-event:any')
		await assertMaintenanceInOrg({
			organizationId: parsed.organizationId,
			maintenanceEventId: parsed.data.maintenanceEventId,
		})

		const draft = await prisma.draftChange.create({
			data: {
				organizationId: parsed.organizationId,
				createdByUserId: userId,
				...buildMcpDraftProposedBy(userId, parsed.agentContext),
				status: 'DRAFT',
				title: parsed.label ?? 'Update maintenance event',
				summary: parsed.label ?? 'Update maintenance event',
				reasoningSummary: parsed.reasoningSummary,
				confidence: parsed.confidence ?? null,
				entityType: 'maintenance-event',
				entityId: parsed.data.maintenanceEventId,
				operations: toJsonValue([
					{
						op: 'update',
						entityType: 'maintenance-event',
						entityId: parsed.data.maintenanceEventId,
						data: { status: parsed.data.status },
					},
				]),
				validation: toJsonValue({ status: 'PASS', errors: [] }),
				agentContext: toNullableJsonValue(parsed.agentContext),
			},
		})

		return { draftId: draft.id, status: draft.status }
	},
	'draft_create_note': async ({ userId, params }) => {
		const parsed = DraftCreateNoteParams.parse(params)
		const membership = await requireMembershipForUser(parsed.organizationId, userId)
		assertDraftCreatePermission(membership)
		assertMembershipPermission(membership, 'create:entity-note:any')

		const draft = await prisma.draftChange.create({
			data: {
				organizationId: parsed.organizationId,
				createdByUserId: userId,
				...buildMcpDraftProposedBy(userId, parsed.agentContext),
				status: 'DRAFT',
				title: parsed.label ?? 'Create note',
				summary: parsed.label ?? 'Create note',
				reasoningSummary: parsed.reasoningSummary,
				confidence: parsed.confidence ?? null,
				entityType: 'entity-note',
				operations: toJsonValue([
					{ op: 'create', entityType: 'entity-note', data: parsed.data },
				]),
				validation: toJsonValue({ status: 'PASS', errors: [] }),
				agentContext: toNullableJsonValue(parsed.agentContext),
			},
		})

		return { draftId: draft.id, status: draft.status }
	},
	'draft_create_document': async ({ userId, params }) => {
		const parsed = DraftCreateDocumentParams.parse(params)
		const membership = await requireMembershipForUser(parsed.organizationId, userId)
		assertDraftCreatePermission(membership)
		assertMembershipPermission(membership, 'create:document:any')
		await assertPropertyInOrg({
			organizationId: parsed.organizationId,
			propertyId: parsed.data.propertyId,
		})
		if (parsed.data.assetId) {
			await assertAssetInProperty({
				organizationId: parsed.organizationId,
				propertyId: parsed.data.propertyId,
				assetId: parsed.data.assetId,
			})
		}

		const draft = await prisma.draftChange.create({
			data: {
				organizationId: parsed.organizationId,
				createdByUserId: userId,
				...buildMcpDraftProposedBy(userId, parsed.agentContext),
				status: 'DRAFT',
				title: parsed.label ?? 'Create document',
				summary: parsed.label ?? 'Create document',
				reasoningSummary: parsed.reasoningSummary,
				confidence: parsed.confidence ?? null,
				entityType: 'document',
				operations: toJsonValue([
					{ op: 'create', entityType: 'document', data: parsed.data },
				]),
				validation: toJsonValue({ status: 'PASS', errors: [] }),
				agentContext: toNullableJsonValue(parsed.agentContext),
			},
		})

		return { draftId: draft.id, status: draft.status }
	},
	'draft_create_lease': async ({ userId, params }) => {
		const parsed = DraftCreateLeaseParams.parse(params)
		const membership = await requireMembershipForUser(parsed.organizationId, userId)
		assertDraftCreatePermission(membership)
		assertMembershipPermission(membership, 'create:lease:any')
		await assertPropertyInOrg({
			organizationId: parsed.organizationId,
			propertyId: parsed.data.propertyId,
		})

		const draft = await prisma.draftChange.create({
			data: {
				organizationId: parsed.organizationId,
				createdByUserId: userId,
				...buildMcpDraftProposedBy(userId, parsed.agentContext),
				status: 'DRAFT',
				title: parsed.label ?? 'Create lease',
				summary: parsed.label ?? 'Create lease',
				reasoningSummary: parsed.reasoningSummary,
				confidence: parsed.confidence ?? null,
				entityType: 'lease',
				operations: toJsonValue([
					{ op: 'create', entityType: 'lease', data: parsed.data },
				]),
				validation: toJsonValue({ status: 'PASS', errors: [] }),
				agentContext: toNullableJsonValue(parsed.agentContext),
			},
		})

		return { draftId: draft.id, status: draft.status }
	},
	'draft_create_finance': async ({ userId, params }) => {
		const parsed = DraftCreateFinanceParams.parse(params)
		const membership = await requireMembershipForUser(parsed.organizationId, userId)
		assertDraftCreatePermission(membership)
		assertMembershipPermission(membership, 'create:financial-entry:any')
		await assertPropertyInOrg({
			organizationId: parsed.organizationId,
			propertyId: parsed.data.propertyId,
		})
		if (parsed.data.vendorId) {
			await assertVendorInOrg({
				organizationId: parsed.organizationId,
				vendorId: parsed.data.vendorId,
			})
		}
		if (parsed.data.maintenanceEventId) {
			await assertMaintenanceInProperty({
				organizationId: parsed.organizationId,
				propertyId: parsed.data.propertyId,
				maintenanceEventId: parsed.data.maintenanceEventId,
			})
		}

		const draft = await prisma.draftChange.create({
			data: {
				organizationId: parsed.organizationId,
				createdByUserId: userId,
				...buildMcpDraftProposedBy(userId, parsed.agentContext),
				status: 'DRAFT',
				title: parsed.label ?? 'Create financial entry',
				summary: parsed.label ?? 'Create financial entry',
				reasoningSummary: parsed.reasoningSummary,
				confidence: parsed.confidence ?? null,
				entityType: 'financial-entry',
				operations: toJsonValue([
					{ op: 'create', entityType: 'financial-entry', data: parsed.data },
				]),
				validation: toJsonValue({ status: 'PASS', errors: [] }),
				agentContext: toNullableJsonValue(parsed.agentContext),
			},
		})

		return { draftId: draft.id, status: draft.status }
	},
	'draft_list': async ({ userId, params }) => {
		const { organizationId, status } = DraftListParams.parse(params)
		const membership = await requireMembershipForUser(organizationId, userId)
		assertMembershipPermission(membership, 'read:draft-change:any')
		return prisma.draftChange.findMany({
			where: { organizationId, status },
			orderBy: { createdAt: 'desc' },
		})
	},
	'draft_get': async ({ userId, params }) => {
		const { draftId } = DraftIdParams.parse(params)
		const draft = await prisma.draftChange.findUnique({
			where: { id: draftId },
		})
		if (!draft) return null
		const membership = await requireMembershipForUser(draft.organizationId, userId)
		assertMembershipPermission(membership, 'read:draft-change:any')
		return draft
	},
	'draft_preview': async ({ userId, params }) => {
		const { draftId } = DraftIdParams.parse(params)
		const draft = await prisma.draftChange.findUnique({
			where: { id: draftId },
		})
		if (!draft) return null
		const membership = await requireMembershipForUser(draft.organizationId, userId)
		assertMembershipPermission(membership, 'read:draft-change:any')
		return {
			draftId: draft.id,
			organizationId: draft.organizationId,
			title: draft.title,
			summary: draft.summary,
			operations: draft.operations,
			status: draft.status,
		}
	},
}

function createError(
	id: JsonRpcId,
	code: number,
	message: string,
	data?: unknown,
): JsonRpcResponse {
	return { jsonrpc: '2.0', id, error: { code, message, data } }
}

async function handleSingle({
	request,
	userId,
	body,
}: {
	request: Request
	userId: string
	body: JsonRpcRequest
}): Promise<JsonRpcResponse | null> {
	if (!body || typeof body !== 'object') {
		return null
	}
	const id = body.id ?? null
	const isNotification = id == null

	if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
		return isNotification ? null : createError(id, -32600, 'Invalid Request')
	}

	const handler = handlers[body.method]
	if (!handler) {
		return isNotification ? null : createError(id, -32601, 'Method not found')
	}

	const startedAt = Date.now()

	try {
		const result = await handler({
			request,
			userId,
			params: body.params ?? {},
		})
		await safeLogMcpInvocation({
			request,
			userId,
			method: body.method,
			params: body.params ?? {},
			result,
			durationMs: Date.now() - startedAt,
		})
		return isNotification ? null : { jsonrpc: '2.0', id, result }
	} catch (error) {
		await safeLogMcpInvocation({
			request,
			userId,
			method: body.method,
			params: body.params ?? {},
			error,
			durationMs: Date.now() - startedAt,
		})
		if (isNotification) {
			return null
		}
		if (error instanceof JsonRpcHandlerError) {
			return createError(id, error.code, error.message, error.data)
		}
		if (error instanceof z.ZodError) {
			return createError(id, -32602, 'Invalid params', {
				issues: error.issues,
			})
		}
		if (error instanceof Response) {
			return createError(id, -32603, 'Request failed', {
				status: error.status,
			})
		}
		return createError(id, -32603, 'Internal server error')
	}
}

export async function handleMcpRequest({
	request,
	userId,
	body,
}: {
	request: Request
	userId: string
	body: unknown
}): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
	if (Array.isArray(body)) {
		const results = await Promise.all(
			body.map((entry) =>
				handleSingle({ request, userId, body: entry as JsonRpcRequest }),
			),
		)
		const filtered = results.filter(
			(entry): entry is JsonRpcResponse => entry !== null,
		)
		return filtered.length ? filtered : null
	}
	return handleSingle({ request, userId, body: body as JsonRpcRequest })
}

function extractOrganizationIds(method: string, params: unknown, result: unknown) {
	if (params && typeof params === 'object' && 'organizationId' in params) {
		const organizationId = (params as { organizationId?: unknown }).organizationId
		if (typeof organizationId === 'string' && organizationId.length > 0) {
			return [organizationId]
		}
	}

	if (method === 'org_list' && Array.isArray(result)) {
		return result
			.map(
				(entry) =>
					(entry as Record<string, Record<string, unknown> | undefined> | null)
						?.organization?.id,
			)
			.filter((id): id is string => typeof id === 'string' && id.length > 0)
	}

	if (result && typeof result === 'object') {
		if ('organizationId' in result) {
			const organizationId = (result as { organizationId?: unknown })
				.organizationId
			if (typeof organizationId === 'string' && organizationId.length > 0) {
				return [organizationId]
			}
		}
		if ('organization' in result) {
			const organization = (result as { organization?: unknown }).organization
			if (
				organization &&
				typeof organization === 'object' &&
				'id' in organization
			) {
				const id = (organization as { id?: unknown }).id
				if (typeof id === 'string' && id.length > 0) {
					return [id]
				}
			}
		}
	}

	if (Array.isArray(result)) {
		const ids = result
			.map((entry) => {
				if (entry && typeof entry === 'object') {
					if ('organizationId' in entry) {
						const id = (entry as { organizationId?: unknown })
							.organizationId
						if (typeof id === 'string' && id.length > 0) return id
					}
					if ('organization' in entry) {
						const org = (entry as { organization?: unknown }).organization
						if (org && typeof org === 'object' && 'id' in org) {
							const id = (org as { id?: unknown }).id
							if (typeof id === 'string' && id.length > 0) return id
						}
					}
				}
				return null
			})
			.filter((id): id is string => typeof id === 'string' && id.length > 0)
		if (ids.length) return ids
	}

	return []
}
