import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import * as E from '@react-email/components'
import { Form, Link } from 'react-router'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import {
	assertMembershipPermission,
	requireMembership,
} from '#app/utils/membership.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { prepareVerification } from '#app/routes/_auth/verify.server.ts'
import { type Route } from './+types/index.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

export async function loader({ params, request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const organizationId = params.orgId
	invariantResponse(typeof organizationId === 'string', 'Workspace not found', {
		status: 404,
	})

	const isAdmin = await prisma.user.findFirst({
		where: { id: userId, roles: { some: { name: 'admin' } } },
		select: { id: true },
	})

	const membership = isAdmin
		? null
		: await requireMembership(request, organizationId)
	if (membership) {
		assertMembershipPermission(membership, 'read:membership:any')
	}

	const organization = await prisma.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, name: true },
	})

	if (!organization) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const members = await prisma.membership.findMany({
		where: { organizationId },
		orderBy: { createdAt: 'desc' },
		select: {
			id: true,
			createdAt: true,
			role: { select: { id: true, name: true } },
			user: { select: { id: true, name: true, username: true, email: true } },
		},
	})

	const canCreate = Boolean(isAdmin || membership?.role.name === 'owner')

	return { organization, members, canCreate }
}

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserId(request)
	const organizationId = params.orgId
	invariantResponse(typeof organizationId === 'string', 'Workspace not found', {
		status: 404,
	})

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent !== 'resend-invite') {
		throw new Response('Invalid intent', { status: 400 })
	}

	const membershipId = formData.get('membershipId')
	if (typeof membershipId !== 'string' || membershipId.length === 0) {
		return redirectWithToast(`/orgs/${organizationId}/members`, {
			title: 'Invite failed',
			description: 'Missing collaborator selection.',
			type: 'error',
		})
	}

	const membershipRecord = await prisma.membership.findFirst({
		where: { id: membershipId, organizationId },
		select: {
			id: true,
			user: { select: { id: true, email: true, name: true, username: true } },
			organization: { select: { id: true, name: true } },
		},
	})

	if (!membershipRecord) {
		throw new Response('Member not found', { status: 404 })
	}

	const { verifyUrl, otp } = await prepareVerification({
		period: 10 * 60,
		request,
		type: 'reset-password',
		target: membershipRecord.user.email,
	})

	const response = await sendEmail({
		to: membershipRecord.user.email,
		subject: `Reset your ${membershipRecord.organization.name} access`,
		react: (
			<InviteUserEmail
				organizationName={membershipRecord.organization.name}
				resetUrl={verifyUrl.toString()}
				otp={otp}
			/>
		),
	})

	if (response.status !== 'success') {
		return redirectWithToast(`/orgs/${organizationId}/members`, {
			title: 'Invite failed',
			description: response.error.message,
			type: 'error',
		})
	}

	return redirectWithToast(`/orgs/${organizationId}/members`, {
		title: 'Invite sent',
		description: `Sent a password setup email to ${membershipRecord.user.email}.`,
		type: 'success',
	})
}

export function InviteUserEmail({
	organizationName,
	resetUrl,
	otp,
}: {
	organizationName: string
	resetUrl: string
	otp: string
}) {
	return (
		<E.Html lang="en" dir="ltr">
			<E.Container>
				<h1>
					<E.Text>Welcome to {organizationName}</E.Text>
				</h1>
				<p>
					<E.Text>
						Use this verification code to set or reset your password:{' '}
						<strong>{otp}</strong>
					</E.Text>
				</p>
				<p>
					<E.Text>Or click the link to get started:</E.Text>
				</p>
				<E.Link href={resetUrl}>{resetUrl}</E.Link>
			</E.Container>
		</E.Html>
	)
}

export default function OrgMembers({ loaderData }: Route.ComponentProps) {
	const isPending = useIsPending()

	return (
		<article className="mx-auto max-w-(--reading-column) px-5 py-8 md:px-8">
			<header className="mb-8">
				<div className="flex items-center justify-between gap-4">
					<div>
						<p className="text-body-2xs text-muted-foreground/70 mb-2 uppercase tracking-[0.2em]">
							{loaderData.organization.name}
						</p>
						<h1 className="text-h4 font-serif tracking-tight">Collaborators</h1>
						<p className="text-body-2xs text-muted-foreground mt-1">
							{loaderData.members.length} members
						</p>
					</div>
					{loaderData.canCreate ? (
						<Link
							to={`/orgs/${loaderData.organization.id}/members/new`}
							className="text-body-2xs text-muted-foreground hover:text-foreground"
						>
							+ Add collaborator
						</Link>
					) : null}
				</div>
			</header>

			{loaderData.members.length ? (
				<ul className="divide-y divide-border/40">
					{loaderData.members.map((member) => (
						<li
							key={member.id}
							className="flex items-center justify-between gap-4 py-5 first:pt-0"
						>
							<div className="grid gap-1">
								<p className="text-body-sm font-medium">
									{member.user.name ?? member.user.username}
								</p>
								<p className="text-body-2xs text-muted-foreground">
									@{member.user.username} · {member.user.email} ·{' '}
									{member.role.name.replace('_', ' ')}
								</p>
							</div>
							{loaderData.canCreate ? (
								<Form method="POST">
									<input type="hidden" name="intent" value="resend-invite" />
									<input type="hidden" name="membershipId" value={member.id} />
									<StatusButton
										type="submit"
										variant="outline"
										size="sm"
										status={isPending ? 'pending' : 'idle'}
										disabled={isPending}
										className="border-border/40 bg-background/60"
									>
										Resend invite
									</StatusButton>
								</Form>
							) : null}
						</li>
					))}
				</ul>
			) : (
				<p className="text-body-sm text-muted-foreground">
					No collaborators yet.
				</p>
			)}
		</article>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: ({ error }) => (
					<p>You are not allowed to do that: {error?.data.message}</p>
				),
			}}
		/>
	)
}
