import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { formatDistanceToNow } from 'date-fns'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { CheckboxField, ErrorList } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$userId.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const UpdateRolesSchema = z.object({
	intent: z.literal('update-roles'),
	roleIds: z.preprocess(
		(value) => {
			if (Array.isArray(value)) return value
			if (typeof value === 'string' && value.length > 0) return [value]
			return []
		},
		z.array(z.string()).min(1, 'Select at least one role'),
	),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	const userId = params.userId
	invariantResponse(typeof userId === 'string', 'User not found', {
		status: 404,
	})

	const [user, roles] = await Promise.all([
		prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				name: true,
				username: true,
				email: true,
				createdAt: true,
				memberships: {
					select: {
						id: true,
						role: { select: { name: true } },
						organization: { select: { id: true, name: true } },
					},
					orderBy: { organization: { name: 'asc' } },
				},
				roles: {
					select: { id: true, name: true, description: true },
				},
			},
		}),
		prisma.role.findMany({
			orderBy: { name: 'asc' },
			select: { id: true, name: true, description: true },
		}),
	])

	if (!user) {
		throw new Response('User not found', { status: 404 })
	}

	return { user, roles }
}

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')
	const userId = params.userId
	invariantResponse(typeof userId === 'string', 'User not found', {
		status: 404,
	})

	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: UpdateRolesSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const roleIds = Array.from(new Set(submission.value.roleIds))
	const [roles, user] = await Promise.all([
		prisma.role.findMany({
			select: { id: true, name: true },
		}),
		prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				name: true,
				username: true,
				roles: { select: { id: true, name: true } },
			},
		}),
	])

	if (!user) {
		throw new Response('User not found', { status: 404 })
	}

	const validRoleIds = new Set(roles.map((role) => role.id))
	const invalidRoleIds = roleIds.filter((roleId) => !validRoleIds.has(roleId))
	if (invalidRoleIds.length > 0) {
		return data(
			{
				result: submission.reply({
					formErrors: ['Invalid role selection.'],
				}),
			},
			{ status: 400 },
		)
	}

	const adminRole = roles.find((role) => role.name === 'admin')
	const isRemovingAdmin =
		adminRole &&
		user.roles.some((role) => role.id === adminRole.id) &&
		!roleIds.includes(adminRole.id)
	if (adminRole && isRemovingAdmin) {
		const adminCount = await prisma.user.count({
			where: { roles: { some: { id: adminRole.id } } },
		})
		if (adminCount <= 1) {
			return data(
				{
					result: submission.reply({
						formErrors: ['At least one admin is required.'],
					}),
				},
				{ status: 400 },
			)
		}
	}

	await prisma.user.update({
		where: { id: user.id },
		data: {
			roles: { set: roleIds.map((id) => ({ id })) },
		},
	})

	return redirectWithToast(`/admin/users/${user.id}`, {
		title: 'Roles updated',
		description: `Updated roles for ${user.name ?? user.username}.`,
		type: 'success',
	})
}

export default function AdminUserDetail({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending({
		formMethod: 'POST',
		formAction: `/admin/users/${loaderData.user.id}`,
	})
	const [form, fields] = useForm({
		id: 'update-user-roles',
		constraint: getZodConstraint(UpdateRolesSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: UpdateRolesSchema })
		},
	})

	const assignedRoleIds = new Set(
		loaderData.user.roles.map((role) => role.id),
	)
	const displayName = loaderData.user.name ?? loaderData.user.username
	const isAdmin = loaderData.user.roles.some((role) => role.name === 'admin')

	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<Link
					to="/admin/users"
					className="text-body-2xs text-muted-foreground transition hover:text-foreground"
				>
					← Back to users
				</Link>
				<p className="text-body-2xs text-muted-foreground/70 mt-6 uppercase tracking-[0.2em]">
					Admin
				</p>
				<h1 className="text-h4 font-serif tracking-tight">{displayName}</h1>
				<p className="text-body-2xs text-muted-foreground mt-1">
					@{loaderData.user.username} • {loaderData.user.email}
				</p>
				<p className="text-body-2xs text-muted-foreground">
					Joined{' '}
					{formatDistanceToNow(new Date(loaderData.user.createdAt), {
						addSuffix: true,
					})}
				</p>
				<div className="mt-6 grid gap-4 text-body-2xs text-muted-foreground md:grid-cols-3">
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Roles
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.user.roles.length}
						</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Workspaces
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.user.memberships.length}
						</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Admin
						</p>
						<p className="text-body-sm text-foreground">
							{isAdmin ? 'Yes' : 'No'}
						</p>
					</div>
				</div>
			</header>

			<div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
				<section className="border-y border-border/40 py-4">
					<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
						User overview
					</h2>
					<div className="mt-4 grid gap-3 text-body-sm">
						<div className="flex flex-col gap-1">
							<span className="text-body-xs text-muted-foreground">Name</span>
							<span className="font-semibold">{displayName}</span>
						</div>
						<div className="flex flex-col gap-1">
							<span className="text-body-xs text-muted-foreground">Username</span>
							<span>@{loaderData.user.username}</span>
						</div>
						<div className="flex flex-col gap-1">
							<span className="text-body-xs text-muted-foreground">Email</span>
							<span>{loaderData.user.email}</span>
						</div>
						<div className="flex flex-col gap-1">
							<span className="text-body-xs text-muted-foreground">
								Current roles
							</span>
							<div className="flex flex-wrap gap-2">
								{loaderData.user.roles.length ? (
									loaderData.user.roles.map((role) => (
										<span
											key={role.id}
											className={
												isAdmin && role.name === 'admin'
													? 'rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-primary'
													: 'rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'
											}
										>
											{role.name.replace('_', ' ')}
										</span>
									))
								) : (
									<span className="text-body-xs text-muted-foreground">
										No roles assigned
									</span>
								)}
							</div>
						</div>
						<div className="flex flex-col gap-2">
							<span className="text-body-xs text-muted-foreground">
								Workspaces
							</span>
							{loaderData.user.memberships.length ? (
								<ul className="grid gap-2">
									{loaderData.user.memberships.map((membership) => (
										<li
											key={membership.id}
											className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
										>
											<span className="text-body-sm font-semibold">
												{membership.organization.name}
											</span>
											<div className="flex flex-wrap items-center gap-2">
												<span className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
													{membership.role.name.replace('_', ' ')}
												</span>
												<Link
													to={`/orgs/${membership.organization.id}/members`}
													className="text-body-2xs text-muted-foreground hover:text-foreground"
												>
													Collaborators
												</Link>
											</div>
										</li>
									))}
								</ul>
							) : (
								<span className="text-body-xs text-muted-foreground">
									No workspace memberships yet.
								</span>
							)}
						</div>
					</div>
				</section>

				<section className="grid gap-4 border-y border-border/40 py-4">
					<div className="flex flex-col gap-1">
						<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
							Roles
						</h2>
						<p className="text-body-2xs text-muted-foreground">
							Changes apply immediately. At least one admin must remain.
						</p>
					</div>
					<Form method="POST" {...getFormProps(form)} className="grid gap-4">
						<input type="hidden" name="intent" value="update-roles" />
						<div className="grid gap-4 md:grid-cols-2">
							{loaderData.roles.map((role) => (
								<div
									key={role.id}
									className="rounded-md border border-border/60 bg-muted/20 px-4 py-3"
								>
									<CheckboxField
										labelProps={{
											htmlFor: `${form.id}-${role.id}`,
											children: role.name.replace('_', ' '),
										}}
										buttonProps={{
											id: `${form.id}-${role.id}`,
											name: fields.roleIds.name,
											form: form.id,
											value: role.id,
											defaultChecked: assignedRoleIds.has(role.id),
										}}
									/>
									{role.description ? (
										<p className="text-body-xs text-muted-foreground">
											{role.description}
										</p>
									) : null}
								</div>
							))}
						</div>
						<ErrorList errors={fields.roleIds.errors} />
						<ErrorList errors={form.errors} id={form.errorId} />
						<div className="flex justify-end">
							<StatusButton
								type="submit"
								status={isPending ? 'pending' : (form.status ?? 'idle')}
								disabled={isPending}
							>
								Update roles
							</StatusButton>
						</div>
					</Form>
				</section>
			</div>
		</div>
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
