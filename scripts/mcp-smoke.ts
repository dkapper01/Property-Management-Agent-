const baseUrl =
	process.env.MCP_BASE_URL ?? 'http://localhost:3000/resources/mcp'
const token = process.env.MCP_DEV_TOKEN
const userId = process.env.MCP_USER_ID

if (!token || !userId) {
	console.error('Missing MCP_DEV_TOKEN or MCP_USER_ID environment variables.')
	console.error(
		'Example: MCP_DEV_TOKEN=... MCP_USER_ID=... tsx scripts/mcp-smoke.ts',
	)
	process.exit(1)
}

const headers = {
	'Content-Type': 'application/json',
	Authorization: `Bearer ${token}`,
	'X-MCP-User-Id': userId,
}

let nextId = 1
let passed = 0
let failed = 0
let skipped = 0

function report(label: string, pass: boolean, detail?: string) {
	if (pass) {
		passed++
		console.log(`  ✅ PASS  ${label}`)
	} else {
		failed++
		console.log(`  ❌ FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
	}
}

function skip(label: string, reason: string) {
	skipped++
	console.log(`  ⏭  SKIP  ${label} — ${reason}`)
}

async function sendRaw(body: unknown) {
	return fetch(baseUrl, {
		method: 'POST',
		headers,
		body: JSON.stringify(body),
	})
}

type JsonRpcResponse<T = unknown> = {
	jsonrpc: '2.0'
	id: number
	error?: { code?: number; message?: string; data?: unknown }
	result?: T
}

type McpContent = { content: Array<{ type: string; text: string }> }

async function rpc<T = unknown>(
	method: string,
	params?: Record<string, unknown>,
): Promise<JsonRpcResponse<T>> {
	const response = await sendRaw({
		jsonrpc: '2.0',
		id: nextId++,
		method,
		params: params ?? {},
	})
	return (await response.json()) as JsonRpcResponse<T>
}

async function callProtocol<T>(
	method: string,
	params?: Record<string, unknown>,
): Promise<T> {
	const payload = await rpc<T>(method, params)
	if (payload.error) {
		throw new Error(
			`${method}: ${payload.error.message} (response: ${JSON.stringify(payload)})`,
		)
	}
	if (payload.result === undefined) {
		throw new Error(
			`${method}: result undefined (response: ${JSON.stringify(payload)})`,
		)
	}
	return payload.result
}

async function callTool<T>(
	name: string,
	args?: Record<string, unknown>,
): Promise<T> {
	const payload = await rpc<McpContent>('tools/call', {
		name,
		arguments: args ?? {},
	})
	if (payload.error) {
		throw new Error(
			`${name}: ${payload.error.message} (response: ${JSON.stringify(payload)})`,
		)
	}
	if (payload.result === undefined) {
		throw new Error(
			`${name}: result undefined (response: ${JSON.stringify(payload)})`,
		)
	}
	const text = payload.result.content?.[0]?.text
	if (text === undefined) {
		throw new Error(
			`${name}: no content text (response: ${JSON.stringify(payload)})`,
		)
	}
	return JSON.parse(text) as T
}

async function expectError(
	label: string,
	name: string,
	args: Record<string, unknown>,
	expectedCode: number,
) {
	try {
		const json = await rpc('tools/call', { name, arguments: args })
		report(
			label,
			json.error?.code === expectedCode,
			`expected error.code ${expectedCode}, got ${json.error?.code ?? `success: ${JSON.stringify(json.result).slice(0, 100)}`}`,
		)
	} catch (err) {
		report(label, false, String(err))
	}
}

const agentContext = {
	agentName: 'mcp-smoke',
	sourceTool: 'mcp-smoke',
	sourceRunId: `smoke-${Date.now()}`,
}

function draftEnvelope(orgId: string) {
	return {
		organizationId: orgId,
		reasoningSummary: 'Automated MCP smoke test.',
		confidence: 0.1,
		agentContext,
	}
}

// ═══════════════════════════════════════════════════════════════════
//  Phase 1 — Protocol
// ═══════════════════════════════════════════════════════════════════

async function protocolTests() {
	console.log('\n── Protocol ──')

	try {
		await callProtocol('initialize')
		report('initialize', true)
	} catch (err) {
		report('initialize', false, String(err))
	}

	try {
		const tools =
			await callProtocol<{ tools: Array<{ name: string }> }>('tools/list')
		report(`tools/list (${tools.tools.length} tools)`, true)
	} catch (err) {
		report('tools/list', false, String(err))
	}
}

// ═══════════════════════════════════════════════════════════════════
//  Phase 2 — Read tools (list + get)
// ═══════════════════════════════════════════════════════════════════

type Discovered = {
	orgId?: string
	propertyId?: string
	assetId?: string
	leaseId?: string
	maintenanceId?: string
	vendorId?: string
	documentId?: string
	financeId?: string
}

async function readToolTests(): Promise<Discovered> {
	console.log('\n── Read tools ──')

	const ids: Discovered = {}

	// org_list
	try {
		const orgs = await callTool<
			Array<{ organization: { id: string; name: string } }>
		>('org_list')
		ids.orgId = orgs[0]?.organization?.id
		report(`org_list (${orgs.length} orgs, orgId=${ids.orgId ?? 'none'})`, true)
	} catch (err) {
		report('org_list', false, String(err))
		return ids
	}

	if (!ids.orgId) return ids
	const orgId = ids.orgId

	// org_get
	try {
		const org = await callTool<{ id: string; name: string }>('org_get', {
			organizationId: orgId,
		})
		report(`org_get (name=${org?.name})`, true)
	} catch (err) {
		report('org_get', false, String(err))
	}

	// property_list
	try {
		const props = await callTool<Array<{ id: string; name: string }>>(
			'property_list',
			{ organizationId: orgId },
		)
		ids.propertyId = props[0]?.id
		report(
			`property_list (${props.length} props, propertyId=${ids.propertyId ?? 'none'})`,
			true,
		)
	} catch (err) {
		report('property_list', false, String(err))
	}

	// property_get
	if (ids.propertyId) {
		try {
			const prop = await callTool<{ id: string; name: string }>('property_get', {
				organizationId: orgId,
				propertyId: ids.propertyId,
			})
			report(`property_get (name=${prop?.name})`, true)
		} catch (err) {
			report('property_get', false, String(err))
		}
	} else {
		skip('property_get', 'no propertyId')
	}

	// asset_list
	try {
		const assets = await callTool<Array<{ id: string; assetType: string }>>(
			'asset_list',
			{ organizationId: orgId },
		)
		ids.assetId = assets[0]?.id
		report(
			`asset_list (${assets.length} assets, assetId=${ids.assetId ?? 'none'})`,
			true,
		)
	} catch (err) {
		report('asset_list', false, String(err))
	}

	// asset_get
	if (ids.assetId) {
		try {
			const asset = await callTool<{ id: string; assetType: string }>(
				'asset_get',
				{ organizationId: orgId, assetId: ids.assetId },
			)
			report(`asset_get (type=${asset?.assetType})`, true)
		} catch (err) {
			report('asset_get', false, String(err))
		}
	} else {
		skip('asset_get', 'no assetId')
	}

	// lease_list
	try {
		const leases = await callTool<Array<{ id: string; tenantName: string }>>(
			'lease_list',
			{ organizationId: orgId },
		)
		ids.leaseId = leases[0]?.id
		report(
			`lease_list (${leases.length} leases, leaseId=${ids.leaseId ?? 'none'})`,
			true,
		)
	} catch (err) {
		report('lease_list', false, String(err))
	}

	// lease_get
	if (ids.leaseId) {
		try {
			const lease = await callTool<{ id: string; tenantName: string }>(
				'lease_get',
				{ organizationId: orgId, leaseId: ids.leaseId },
			)
			report(`lease_get (tenant=${lease?.tenantName})`, true)
		} catch (err) {
			report('lease_get', false, String(err))
		}
	} else {
		skip('lease_get', 'no leaseId')
	}

	// maintenance_list
	try {
		const events = await callTool<Array<{ id: string; description: string }>>(
			'maintenance_list',
			{ organizationId: orgId },
		)
		ids.maintenanceId = events[0]?.id
		report(
			`maintenance_list (${events.length} events, maintenanceId=${ids.maintenanceId ?? 'none'})`,
			true,
		)
	} catch (err) {
		report('maintenance_list', false, String(err))
	}

	// maintenance_get
	if (ids.maintenanceId) {
		try {
			const evt = await callTool<{ id: string; description: string }>(
				'maintenance_get',
				{ organizationId: orgId, maintenanceEventId: ids.maintenanceId },
			)
			report(`maintenance_get (desc=${evt?.description?.slice(0, 40)})`, true)
		} catch (err) {
			report('maintenance_get', false, String(err))
		}
	} else {
		skip('maintenance_get', 'no maintenanceId')
	}

	// vendor_list
	try {
		const vendors = await callTool<Array<{ id: string; name: string }>>(
			'vendor_list',
			{ organizationId: orgId },
		)
		ids.vendorId = vendors[0]?.id
		report(
			`vendor_list (${vendors.length} vendors, vendorId=${ids.vendorId ?? 'none'})`,
			true,
		)
	} catch (err) {
		report('vendor_list', false, String(err))
	}

	// vendor_get
	if (ids.vendorId) {
		try {
			const vendor = await callTool<{ id: string; name: string }>('vendor_get', {
				organizationId: orgId,
				vendorId: ids.vendorId,
			})
			report(`vendor_get (name=${vendor?.name})`, true)
		} catch (err) {
			report('vendor_get', false, String(err))
		}
	} else {
		skip('vendor_get', 'no vendorId')
	}

	// document_list
	try {
		const docs = await callTool<Array<{ id: string; documentType: string }>>(
			'document_list',
			{ organizationId: orgId },
		)
		ids.documentId = docs[0]?.id
		report(
			`document_list (${docs.length} docs, documentId=${ids.documentId ?? 'none'})`,
			true,
		)
	} catch (err) {
		report('document_list', false, String(err))
	}

	// document_get
	if (ids.documentId) {
		try {
			const doc = await callTool<{ id: string; documentType: string }>(
				'document_get',
				{ organizationId: orgId, documentId: ids.documentId },
			)
			report(`document_get (type=${doc?.documentType})`, true)
		} catch (err) {
			report('document_get', false, String(err))
		}
	} else {
		skip('document_get', 'no documentId')
	}

	// finance_list
	try {
		const entries = await callTool<Array<{ id: string; category: string }>>(
			'finance_list',
			{ organizationId: orgId },
		)
		ids.financeId = entries[0]?.id
		report(
			`finance_list (${entries.length} entries, financeId=${ids.financeId ?? 'none'})`,
			true,
		)
	} catch (err) {
		report('finance_list', false, String(err))
	}

	// finance_get
	if (ids.financeId) {
		try {
			const entry = await callTool<{ id: string; category: string }>(
				'finance_get',
				{ organizationId: orgId, financialEntryId: ids.financeId },
			)
			report(`finance_get (category=${entry?.category})`, true)
		} catch (err) {
			report('finance_get', false, String(err))
		}
	} else {
		skip('finance_get', 'no financeId')
	}

	// timeline_list
	if (ids.propertyId) {
		try {
			await callTool('timeline_list', {
				organizationId: orgId,
				propertyId: ids.propertyId,
				limit: 5,
				includeAuditLogs: false,
			})
			report('timeline_list', true)
		} catch (err) {
			report('timeline_list', false, String(err))
		}
	} else {
		skip('timeline_list', 'no propertyId')
	}

	// note_list
	try {
		await callTool('note_list', { organizationId: orgId })
		report('note_list', true)
	} catch (err) {
		report('note_list', false, String(err))
	}

	return ids
}

// ═══════════════════════════════════════════════════════════════════
//  Phase 3 — Draft create tools
// ═══════════════════════════════════════════════════════════════════

async function draftCreateTests(ids: Discovered) {
	console.log('\n── Draft create tools ──')

	if (!ids.orgId) {
		skip('draft_create_* (all)', 'no orgId')
		return []
	}
	const orgId = ids.orgId
	const draftIds: string[] = []

	// draft_create_property
	try {
		const draft = await callTool<{ draftId: string }>('draft_create_property', {
			...draftEnvelope(orgId),
			data: {
				name: 'Smoke Test Property',
				address: '100 Smoke Test Ln',
				purchaseDate: '2024-06-01',
				purchasePrice: 250000,
				ownershipType: 'LLC',
				status: 'VACANT',
			},
		})
		draftIds.push(draft.draftId)
		report(`draft_create_property (draftId=${draft.draftId})`, true)
	} catch (err) {
		report('draft_create_property', false, String(err))
	}

	// draft_create_asset
	if (ids.propertyId) {
		try {
			const draft = await callTool<{ draftId: string }>('draft_create_asset', {
				...draftEnvelope(orgId),
				data: {
					propertyId: ids.propertyId,
					assetType: 'HVAC',
					brandModel: 'Smoke Test Unit',
				},
			})
			draftIds.push(draft.draftId)
			report(`draft_create_asset (draftId=${draft.draftId})`, true)
		} catch (err) {
			report('draft_create_asset', false, String(err))
		}
	} else {
		skip('draft_create_asset', 'no propertyId')
	}

	// draft_create_maintenance
	if (ids.propertyId) {
		try {
			const draft = await callTool<{ draftId: string }>(
				'draft_create_maintenance',
				{
					...draftEnvelope(orgId),
					data: {
						propertyId: ids.propertyId,
						dateReported: '2024-06-15',
						severity: 'LOW',
						status: 'OPEN',
						description: 'Smoke test maintenance event',
					},
				},
			)
			draftIds.push(draft.draftId)
			report(`draft_create_maintenance (draftId=${draft.draftId})`, true)
		} catch (err) {
			report('draft_create_maintenance', false, String(err))
		}
	} else {
		skip('draft_create_maintenance', 'no propertyId')
	}

	// draft_update_maintenance
	if (ids.maintenanceId) {
		try {
			const draft = await callTool<{ draftId: string }>(
				'draft_update_maintenance',
				{
					...draftEnvelope(orgId),
					data: {
						maintenanceEventId: ids.maintenanceId,
						status: 'RESOLVED',
					},
				},
			)
			draftIds.push(draft.draftId)
			report(`draft_update_maintenance (draftId=${draft.draftId})`, true)
		} catch (err) {
			report('draft_update_maintenance', false, String(err))
		}
	} else {
		skip('draft_update_maintenance', 'no maintenanceId')
	}

	// draft_create_note
	if (ids.propertyId) {
		try {
			const draft = await callTool<{ draftId: string }>('draft_create_note', {
				...draftEnvelope(orgId),
				data: {
					entityType: 'property',
					entityId: ids.propertyId,
					body: 'Smoke test note body.',
					tags: ['smoke-test'],
				},
			})
			draftIds.push(draft.draftId)
			report(`draft_create_note (draftId=${draft.draftId})`, true)
		} catch (err) {
			report('draft_create_note', false, String(err))
		}
	} else {
		skip('draft_create_note', 'no propertyId')
	}

	// draft_create_lease
	if (ids.propertyId) {
		try {
			const draft = await callTool<{ draftId: string }>('draft_create_lease', {
				...draftEnvelope(orgId),
				data: {
					propertyId: ids.propertyId,
					tenantName: 'Smoke Test Tenant',
					leaseStartDate: '2024-07-01',
					monthlyRent: 1500,
					securityDeposit: 1500,
					paymentDueDay: 1,
				},
			})
			draftIds.push(draft.draftId)
			report(`draft_create_lease (draftId=${draft.draftId})`, true)
		} catch (err) {
			report('draft_create_lease', false, String(err))
		}
	} else {
		skip('draft_create_lease', 'no propertyId')
	}

	// draft_create_finance
	if (ids.propertyId) {
		try {
			const draft = await callTool<{ draftId: string }>('draft_create_finance', {
				...draftEnvelope(orgId),
				data: {
					propertyId: ids.propertyId,
					date: '2024-07-01',
					amount: 1500,
					category: 'RENT_INCOME',
				},
			})
			draftIds.push(draft.draftId)
			report(`draft_create_finance (draftId=${draft.draftId})`, true)
		} catch (err) {
			report('draft_create_finance', false, String(err))
		}
	} else {
		skip('draft_create_finance', 'no propertyId')
	}

	// draft_create_document
	if (ids.propertyId) {
		try {
			const draft = await callTool<{ draftId: string }>(
				'draft_create_document',
				{
					...draftEnvelope(orgId),
					data: {
						propertyId: ids.propertyId,
						documentType: 'OTHER',
						date: '2024-07-01',
						fileKey: 'smoke-test/document.pdf',
					},
				},
			)
			draftIds.push(draft.draftId)
			report(`draft_create_document (draftId=${draft.draftId})`, true)
		} catch (err) {
			report('draft_create_document', false, String(err))
		}
	} else {
		skip('draft_create_document', 'no propertyId')
	}

	return draftIds
}

// ═══════════════════════════════════════════════════════════════════
//  Phase 4 — Draft management tools
// ═══════════════════════════════════════════════════════════════════

async function draftManagementTests(
	orgId: string | undefined,
	draftIds: string[],
) {
	console.log('\n── Draft management ──')

	if (!orgId) {
		skip('draft_list / draft_get / draft_preview', 'no orgId')
		return
	}

	// draft_list
	try {
		const drafts = await callTool<Array<{ id: string; status: string }>>(
			'draft_list',
			{ organizationId: orgId },
		)
		report(`draft_list (${drafts.length} drafts)`, true)
	} catch (err) {
		report('draft_list', false, String(err))
	}

	const testDraftId = draftIds[0]
	if (!testDraftId) {
		skip('draft_get', 'no draftId from create tests')
		skip('draft_preview', 'no draftId from create tests')
		return
	}

	// draft_get
	try {
		const draft = await callTool<{ id: string; status: string }>('draft_get', {
			draftId: testDraftId,
		})
		report(`draft_get (status=${draft?.status})`, true)
	} catch (err) {
		report('draft_get', false, String(err))
	}

	// draft_preview
	try {
		const preview = await callTool<{ draftId: string; title: string }>(
			'draft_preview',
			{ draftId: testDraftId },
		)
		report(`draft_preview (title=${preview?.title})`, true)
	} catch (err) {
		report('draft_preview', false, String(err))
	}
}

// ═══════════════════════════════════════════════════════════════════
//  Phase 5 — JSON-RPC 2.0 compliance
// ═══════════════════════════════════════════════════════════════════

async function complianceTests(orgId: string | undefined) {
	console.log('\n── JSON-RPC 2.0 compliance ──')

	// Notification: no id → 204 empty body
	try {
		const res = await sendRaw({
			jsonrpc: '2.0',
			method: 'initialize',
			params: {},
		})
		const text = await res.text()
		report(
			'Notification (no id → 204 empty body)',
			res.status === 204 && text.length === 0,
			`status=${res.status}, bodyLength=${text.length}`,
		)
	} catch (err) {
		report('Notification (no id → 204 empty body)', false, String(err))
	}

	// Unknown top-level method → -32601
	try {
		const json = await rpc('nonexistent_method', {})
		report(
			'Unknown top-level method → error.code -32601',
			json.error?.code === -32601,
			`expected error.code -32601, got ${json.error?.code ?? `success: ${JSON.stringify(json.result).slice(0, 100)}`}`,
		)
	} catch (err) {
		report('Unknown top-level method → error.code -32601', false, String(err))
	}

	// Unknown tool via tools/call → -32601
	await expectError(
		'Unknown tool via tools/call → error.code -32601',
		'nonexistent_tool',
		{},
		-32601,
	)

	// Missing required param → -32602
	await expectError(
		'Missing reasoningSummary → error.code -32602',
		'draft_create_property',
		{
			organizationId: 'fake-org-id',
			data: {
				name: 'X',
				address: 'X',
				purchaseDate: '2024-01-01',
				purchasePrice: 1,
				ownershipType: 'INDIVIDUAL',
				status: 'VACANT',
			},
		},
		-32602,
	)

	// Extra field (strict schema) → -32602
	await expectError(
		'Extra field in data → error.code -32602',
		'draft_create_asset',
		{
			organizationId: 'fake-org-id',
			reasoningSummary: 'test',
			data: {
				propertyId: 'fake',
				assetType: 'ROOF',
				extraFieldNotInSchema: 'bad',
			},
		},
		-32602,
	)

	// Extra field on envelope → -32602
	await expectError(
		'Extra field on envelope → error.code -32602',
		'draft_create_property',
		{
			organizationId: 'fake-org-id',
			reasoningSummary: 'test',
			bogusEnvelopeField: true,
			data: {
				name: 'X',
				address: 'X',
				purchaseDate: '2024-01-01',
				purchasePrice: 1,
				ownershipType: 'INDIVIDUAL',
				status: 'VACANT',
			},
		},
		-32602,
	)

	// Invalid enum value → -32602
	await expectError(
		'Invalid enum value → error.code -32602',
		'draft_create_asset',
		{
			organizationId: 'fake-org-id',
			reasoningSummary: 'test',
			data: { propertyId: 'fake', assetType: 'INVALID_TYPE' },
		},
		-32602,
	)

	// Relational validation → -32602
	if (orgId) {
		await expectError(
			'Mismatched org + property → error.code -32602',
			'draft_create_asset',
			{
				organizationId: orgId,
				reasoningSummary: 'test',
				data: {
					propertyId: 'nonexistent-property-00000',
					assetType: 'HVAC',
				},
			},
			-32602,
		)
	} else {
		skip('Mismatched org + property → error.code -32602', 'no orgId')
	}
}

// ═══════════════════════════════════════════════════════════════════
//  Runner
// ═══════════════════════════════════════════════════════════════════

async function main() {
	console.log('🔌 MCP smoke test starting...')
	console.log(`   Target: ${baseUrl}`)

	await protocolTests()
	const ids = await readToolTests()
	const draftIds = await draftCreateTests(ids)
	await draftManagementTests(ids.orgId, draftIds)
	await complianceTests(ids.orgId)

	console.log('')
	console.log(
		`Results: ${passed} passed, ${failed} failed, ${skipped} skipped (${passed + failed} total)`,
	)

	if (failed > 0) {
		console.log('❌ MCP smoke test failed')
		process.exit(1)
	}
	console.log('🎉 MCP smoke test complete.')
}

main().catch((error) => {
	console.error('❌ MCP smoke test failed')
	console.error(error)
	process.exit(1)
})
