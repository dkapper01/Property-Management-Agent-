import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { CheckboxField, ErrorList } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { prisma } from '#app/utils/db.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { requireUserWithRole } from '#app/utils/permissions.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { type Route } from './+types/$roleId.ts'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const UpdatePermissionsSchema = z.object({
	intent: z.literal('update-permissions'),
	permissionIds: z.preprocess(
		(value) => {
			if (Array.isArray(value)) return value
			if (typeof value === 'string' && value.length > 0) return [value]
			return []
		},
		z.array(z.string()),
	),
})

export async function loader({ params, request }: Route.LoaderArgs) {
	await requireUserWithRole(request, 'admin')
	const roleId = params.roleId
	invariantResponse(typeof roleId === 'string', 'Role not found', {
		status: 404,
	})

	const [role, permissions] = await Promise.all([
		prisma.role.findUnique({
			where: { id: roleId },
			select: {
				id: true,
				name: true,
				description: true,
				permissions: { select: { id: true } },
				_count: { select: { users: true, memberships: true } },
			},
		}),
		prisma.permission.findMany({
			orderBy: [{ entity: 'asc' }, { action: 'asc' }, { access: 'asc' }],
			select: {
				id: true,
				action: true,
				entity: true,
				access: true,
				description: true,
			},
		}),
	])

	if (!role) {
		throw new Response('Role not found', { status: 404 })
	}

	return { role, permissions }
}

export async function action({ params, request }: Route.ActionArgs) {
	await requireUserWithRole(request, 'admin')
	const roleId = params.roleId
	invariantResponse(typeof roleId === 'string', 'Role not found', {
		status: 404,
	})

	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: UpdatePermissionsSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const permissionIds = Array.from(new Set(submission.value.permissionIds))
	const [role, permissions] = await Promise.all([
		prisma.role.findUnique({
			where: { id: roleId },
			select: { id: true, name: true },
		}),
		prisma.permission.findMany({ select: { id: true } }),
	])

	if (!role) {
		throw new Response('Role not found', { status: 404 })
	}

	const validPermissionIds = new Set(permissions.map((permission) => permission.id))
	const invalidPermissionIds = permissionIds.filter(
		(permissionId) => !validPermissionIds.has(permissionId),
	)
	if (invalidPermissionIds.length > 0) {
		return data(
			{
				result: submission.reply({
					formErrors: ['Invalid permission selection.'],
				}),
			},
			{ status: 400 },
		)
	}

	await prisma.role.update({
		where: { id: role.id },
		data: {
			permissions: { set: permissionIds.map((id) => ({ id })) },
		},
	})

	return redirectWithToast(`/admin/roles/${role.id}`, {
		title: 'Permissions updated',
		description: `Updated permissions for ${role.name.replace('_', ' ')}.`,
		type: 'success',
	})
}

export default function AdminRoleDetail({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending({
		formMethod: 'POST',
		formAction: `/admin/roles/${loaderData.role.id}`,
	})
	const [form, fields] = useForm({
		id: 'update-role-permissions',
		constraint: getZodConstraint(UpdatePermissionsSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: UpdatePermissionsSchema })
		},
	})

	const assignedPermissionIds = new Set(
		loaderData.role.permissions.map((permission) => permission.id),
	)
	const grouped = loaderData.permissions.reduce<
		Record<string, typeof loaderData.permissions>
	>((acc, permission) => {
		const list = acc[permission.entity] ?? []
		list.push(permission)
		acc[permission.entity] = list
		return acc
	}, {})

	return (
		<div className="mx-auto flex max-w-(--reading-column) flex-col gap-8 px-6 py-10 md:px-8">
			<header className="mb-2">
				<Link
					to="/admin/roles"
					className="text-body-2xs text-muted-foreground transition hover:text-foreground"
				>
					← Back to roles
				</Link>
				<p className="text-body-2xs text-muted-foreground/70 mt-6 uppercase tracking-[0.2em]">
					Admin
				</p>
				<h1 className="text-h4 font-serif tracking-tight">
					{loaderData.role.name.replace('_', ' ')} permissions
				</h1>
				{loaderData.role.description ? (
					<p className="text-body-2xs text-muted-foreground mt-1">
						{loaderData.role.description}
					</p>
				) : null}
				<div className="mt-6 grid gap-4 text-body-2xs text-muted-foreground md:grid-cols-3">
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Users
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.role._count.users}
						</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Memberships
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.role._count.memberships}
						</p>
					</div>
					<div>
						<p className="uppercase tracking-[0.2em] text-muted-foreground/70">
							Permissions
						</p>
						<p className="text-body-sm text-foreground">
							{loaderData.role.permissions.length}
						</p>
					</div>
				</div>
			</header>

			<section className="border-y border-border/40 py-4">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Permissions
				</h2>
				<p className="text-body-2xs text-muted-foreground mt-2">
					Select the permissions this role should have. Changes apply
					immediately.
				</p>
				<Form method="POST" {...getFormProps(form)} className="mt-6 grid gap-6">
					<input type="hidden" name="intent" value="update-permissions" />
					<div className="grid gap-6">
						{Object.entries(grouped).map(([entity, permissions]) => (
							<section key={entity} className="grid gap-3 border-t border-border/40 pt-4">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<h3 className="text-body-sm font-semibold">
										{entity.replace('-', ' ')}
									</h3>
									<span className="text-body-2xs text-muted-foreground">
										{permissions.length} permissions
									</span>
								</div>
								<div className="grid gap-3 md:grid-cols-2">
									{permissions.map((permission) => (
										<div
											key={permission.id}
											className="rounded-lg border border-border/40 bg-muted/20 px-3 py-3"
										>
											<CheckboxField
												labelProps={{
													htmlFor: `${form.id}-${permission.id}`,
													children: `${permission.action} ${permission.access}`,
												}}
												buttonProps={{
													id: `${form.id}-${permission.id}`,
													name: fields.permissionIds.name,
													form: form.id,
													value: permission.id,
													defaultChecked: assignedPermissionIds.has(permission.id),
												}}
											/>
											<p className="text-body-2xs text-muted-foreground">
												{permission.description ||
													`${permission.action} ${permission.entity} (${permission.access})`}
											</p>
										</div>
									))}
								</div>
							</section>
						))}
					</div>
					<ErrorList errors={fields.permissionIds.errors} />
					<ErrorList errors={form.errors} id={form.errorId} />
					<div className="flex justify-end">
						<StatusButton
							type="submit"
							status={isPending ? 'pending' : (form.status ?? 'idle')}
							disabled={isPending}
						>
							Update permissions
						</StatusButton>
					</div>
				</Form>
			</section>

			<section className="border-y border-border/40 py-4 text-body-sm text-muted-foreground">
				<p className="font-semibold text-foreground">Need to add permissions?</p>
				<p className="mt-1">
					Permissions are defined in the database. If you need a new permission,
					ask an engineer to add it.
				</p>
				<Link
					to="/admin/roles"
					className="mt-3 inline-flex text-body-2xs text-muted-foreground hover:text-foreground"
				>
					Back to roles
				</Link>
			</section>
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
