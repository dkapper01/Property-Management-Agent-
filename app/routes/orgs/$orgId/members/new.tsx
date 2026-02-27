import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import * as E from '@react-email/components'
import { data, Form, Link } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import {
	generateTemporaryPassword,
	getPasswordHash,
	requireUserId,
} from '#app/utils/auth.server.ts'
import { writeAuditLog } from '#app/utils/audit.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { sendEmail } from '#app/utils/email.server.ts'
import { useIsPending } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import {
	EmailSchema,
	NameSchema,
	UsernameSchema,
} from '#app/utils/user-validation.ts'
import { prepareVerification } from '#app/routes/_auth/verify.server.ts'
import { type Route } from './+types/new.ts'

const allowedMemberRoles = ['owner', 'manager', 'agent'] as const
type AllowedMemberRole = (typeof allowedMemberRoles)[number]

const CreateMemberSchema = z.object({
	name: NameSchema,
	email: EmailSchema,
	username: UsernameSchema,
	roleId: z
		.string({ required_error: 'Role is required' })
		.min(1, 'Role is required'),
})

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

	if (!isAdmin) {
		const membership = await prisma.membership.findFirst({
			where: { organizationId, userId },
			select: { role: { select: { name: true } } },
		})
		if (membership?.role.name !== 'owner') {
			throw new Response('Only owners can add collaborators', { status: 403 })
		}
	}

	const organization = await prisma.organization.findUnique({
		where: { id: organizationId },
		select: { id: true, name: true },
	})
	if (!organization) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const roles = await prisma.role.findMany({
		where: { name: { in: [...allowedMemberRoles] } },
		orderBy: { name: 'asc' },
		select: { id: true, name: true },
	})

	return { organization, roles }
}

export async function action({ params, request }: Route.ActionArgs) {
	const actorId = await requireUserId(request)
	const organizationId = params.orgId
	invariantResponse(typeof organizationId === 'string', 'Workspace not found', {
		status: 404,
	})

	const isAdmin = await prisma.user.findFirst({
		where: { id: actorId, roles: { some: { name: 'admin' } } },
		select: { id: true },
	})

	if (!isAdmin) {
		const membership = await prisma.membership.findFirst({
			where: { organizationId, userId: actorId },
			select: { role: { select: { name: true } } },
		})
		if (membership?.role.name !== 'owner') {
			throw new Response('Only owners can add collaborators', { status: 403 })
		}
	}

	const formData = await request.formData()
	const submission = await parseWithZod(formData, {
		schema: CreateMemberSchema,
	})

	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { email, name, username, roleId } = submission.value

	const [role, organization] = await Promise.all([
		prisma.role.findUnique({
			where: { id: roleId },
			select: { id: true, name: true },
		}),
		prisma.organization.findUnique({
			where: { id: organizationId },
			select: { id: true, name: true },
		}),
	])

	if (!organization) {
		throw new Response('Workspace not found', { status: 404 })
	}

	const allowedRoleNames = new Set(allowedMemberRoles)
	if (!role || !allowedRoleNames.has(role.name as AllowedMemberRole)) {
		return data(
			{ result: submission.reply({ formErrors: ['Invalid role selection.'] }) },
			{ status: 400 },
		)
	}

	const [existingByEmail, existingByUsername] = await Promise.all([
		prisma.user.findUnique({
			where: { email },
			select: { id: true, name: true, username: true, email: true },
		}),
		prisma.user.findUnique({
			where: { username },
			select: { id: true, name: true, username: true, email: true },
		}),
	])

	if (
		existingByEmail &&
		existingByUsername &&
		existingByEmail.id !== existingByUsername.id
	) {
		return data(
			{
				result: submission.reply({
					fieldErrors: {
						email: ['Email is already tied to another user'],
						username: ['Username is already taken'],
					},
				}),
			},
			{ status: 400 },
		)
	}

	if (existingByEmail && !existingByUsername) {
		return data(
			{
				result: submission.reply({
					fieldErrors: {
						username: ['Username must match the existing account'],
					},
				}),
			},
			{ status: 400 },
		)
	}

	if (existingByUsername && !existingByEmail) {
		return data(
			{
				result: submission.reply({
					fieldErrors: { email: ['Email must match the existing account'] },
				}),
			},
			{ status: 400 },
		)
	}

	const existingUser = existingByEmail ?? existingByUsername
	if (existingUser) {
		const existingMembership = await prisma.membership.findFirst({
			where: { organizationId, userId: existingUser.id },
			select: { id: true },
		})
		if (existingMembership) {
			return data(
				{
					result: submission.reply({
						formErrors: ['User is already a collaborator in this workspace'],
					}),
				},
				{ status: 400 },
			)
		}
	}

	const { createdNewUser } = await prisma.$transaction(async (tx) => {
		let userId: string
		let createdNewUser = false
		if (existingUser) {
			userId = existingUser.id
		} else {
			const tempPassword = generateTemporaryPassword()
			const passwordHash = await getPasswordHash(tempPassword)
			const user = await tx.user.create({
				data: {
					name,
					email,
					username,
					roles: { connect: { name: 'user' } },
					password: { create: { hash: passwordHash } },
				},
				select: { id: true, name: true, email: true, username: true },
			})
			createdNewUser = true
			userId = user.id

			await writeAuditLog(
				{
					action: 'CREATE',
					entityType: 'user',
					entityId: user.id,
					organizationId,
					actorId,
					before: null,
					after: user,
				},
				tx,
			)
		}

		const newMembership = await tx.membership.create({
			data: { organizationId, userId, roleId: role.id },
			select: {
				id: true,
				organizationId: true,
				userId: true,
				roleId: true,
			},
		})

		await writeAuditLog(
			{
				action: 'CREATE',
				entityType: 'membership',
				entityId: newMembership.id,
				organizationId,
				actorId,
				before: null,
				after: newMembership,
			},
			tx,
		)

		return { createdNewUser }
	})

	let inviteError: string | null = null
	if (createdNewUser) {
		const { verifyUrl, otp } = await prepareVerification({
			period: 10 * 60,
			request,
			type: 'reset-password',
			target: email,
		})

		const response = await sendEmail({
			to: email,
			subject: `You're invited to ${organization.name}`,
			react: (
				<InviteUserEmail
					organizationName={organization.name}
					resetUrl={verifyUrl.toString()}
					otp={otp}
				/>
			),
		})

		if (response.status !== 'success') {
			inviteError = response.error.message
		}
	}

	return redirectWithToast(`/orgs/${organizationId}/members`, {
		title: 'Member added',
		description: inviteError
			? `Member added, but invite email failed. Ask ${email} to reset their password.`
			: createdNewUser
				? `Sent an invitation to ${email}.`
				: `Added ${email} to ${organization.name}.`,
		type: inviteError ? 'message' : 'success',
	})
}

function InviteUserEmail({
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

export default function NewMember({
	loaderData,
	actionData,
}: Route.ComponentProps) {
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'create-member',
		constraint: getZodConstraint(CreateMemberSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: CreateMemberSchema })
		},
		shouldRevalidate: 'onBlur',
	})

	return (
		<div className="mx-auto max-w-(--reading-column) px-6 py-10 md:px-8">
			<Link
				to={`/orgs/${loaderData.organization.id}/members`}
				className="text-body-2xs text-muted-foreground hover:text-foreground"
			>
				← Back to collaborators
			</Link>
			<p className="text-body-2xs text-muted-foreground/70 mt-6 uppercase tracking-[0.2em]">
				{loaderData.organization.name}
			</p>
			<h1 className="text-h4 font-serif tracking-tight mt-2">Add collaborator</h1>

			<Form
				method="POST"
				{...getFormProps(form)}
				className="mt-6 grid max-w-lg gap-4"
			>
				<div className="grid gap-4 md:grid-cols-2">
					<Field
						labelProps={{ children: 'Full name' }}
						inputProps={{
							...getInputProps(fields.name, { type: 'text' }),
							placeholder: 'e.g. Jordan Lee',
						}}
						errors={fields.name.errors}
					/>
					<Field
						labelProps={{ children: 'Email' }}
						inputProps={{
							...getInputProps(fields.email, { type: 'email' }),
							placeholder: 'jordan@portfolio.com',
						}}
						errors={fields.email.errors}
					/>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<Field
						labelProps={{ children: 'Username' }}
						inputProps={{
							...getInputProps(fields.username, { type: 'text' }),
							placeholder: 'jordanlee',
							className: 'lowercase',
						}}
						errors={fields.username.errors}
					/>
					<div className="grid gap-1">
						<label
							htmlFor={fields.roleId.id}
							className="text-body-2xs text-muted-foreground"
						>
							Role
						</label>
						<select
							id={fields.roleId.id}
							name={fields.roleId.name}
							defaultValue={fields.roleId.initialValue ?? ''}
							className="border-border/60 bg-background/60 w-full rounded-md border px-3 py-2 text-sm"
						>
							<option value="" disabled>
								Select a role
							</option>
							{loaderData.roles.map((role) => (
								<option key={role.id} value={role.id}>
									{role.name.replace('_', ' ')}
								</option>
							))}
						</select>
						{fields.roleId.errors ? (
							<ErrorList errors={fields.roleId.errors} />
						) : null}
					</div>
				</div>
				<ErrorList errors={form.errors} id={form.errorId} />
				<StatusButton
					type="submit"
					status={isPending ? 'pending' : (form.status ?? 'idle')}
					disabled={isPending}
				>
					Add collaborator
				</StatusButton>
			</Form>
		</div>
	)
}
