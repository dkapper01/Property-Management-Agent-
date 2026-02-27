import { invariantResponse } from '@epic-web/invariant'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { handleMcpRequest } from '#app/utils/mcp.server.ts'
import { type Route } from './+types/mcp.ts'

async function getMcpUserId(request: Request) {
	const token = process.env.MCP_DEV_TOKEN
	const authHeader = request.headers.get('Authorization')
	const url = new URL(request.url)
	const queryToken =
		url.searchParams.get('mcp_token') ?? url.searchParams.get('token')

	if (token && (authHeader === `Bearer ${token}` || queryToken === token)) {
		const headerUserId = request.headers.get('X-MCP-User-Id')
		const queryUserId =
			url.searchParams.get('mcp_user_id') ?? url.searchParams.get('userId')
		const resolvedUserId = headerUserId ?? queryUserId
		invariantResponse(
			resolvedUserId,
			'X-MCP-User-Id header or mcp_user_id query param is required for MCP token auth',
			{ status: 401 },
		)
		const user = await prisma.user.findUnique({
			where: { id: resolvedUserId },
			select: { id: true },
		})
		invariantResponse(user, 'User not found', { status: 404 })
		return user.id
	}

	return requireUserId(request)
}

export async function action({ request }: Route.ActionArgs) {
	const userId = await getMcpUserId(request)
	const body = await request.json().catch(() => null)

	const result = await handleMcpRequest({
		request,
		userId,
		body,
	})

	if (result === null) {
		return new Response(null, { status: 204 })
	}
	return Response.json(result)
}

export async function loader({ request }: Route.LoaderArgs) {
	await getMcpUserId(request)

	const encoder = new TextEncoder()
	let interval: ReturnType<typeof setInterval> | null = null

	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(': mcp-sse\n\n'))
			interval = setInterval(() => {
				controller.enqueue(encoder.encode(': ping\n\n'))
			}, 15000)
		},
		cancel() {
			if (interval) clearInterval(interval)
		},
	})

	const headers = new Headers()
	headers.set('Content-Type', 'text/event-stream')
	headers.set('Cache-Control', 'no-cache, no-transform')
	headers.set('Connection', 'keep-alive')
	headers.set('X-Accel-Buffering', 'no')

	return new Response(stream, { headers })
}
