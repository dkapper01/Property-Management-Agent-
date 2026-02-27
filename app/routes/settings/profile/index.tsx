import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { invariantResponse } from '@epic-web/invariant'
import { type SEOHandle } from '@nasa-gcn/remix-seo'
import { Img } from 'openimg/react'
import { useState } from 'react'
import { data, Link, useFetcher } from 'react-router'
import { z } from 'zod'
import { ErrorList, Field } from '#app/components/forms.tsx'
import { StatusButton } from '#app/components/ui/status-button.tsx'
import { requireUserId, sessionKey } from '#app/utils/auth.server.ts'
import { prisma } from '#app/utils/db.server.ts'
import { getUserImgSrc, useDoubleCheck } from '#app/utils/misc.tsx'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { NameSchema, UsernameSchema } from '#app/utils/user-validation.ts'
import { type Route } from './+types/index.ts'
import { twoFAVerificationType } from './two-factor/_layout.tsx'

export const handle: SEOHandle = {
	getSitemapEntries: () => null,
}

const ProfileFormSchema = z.object({
	name: NameSchema.nullable().default(null),
	username: UsernameSchema,
})

export async function loader({ request }: Route.LoaderArgs) {
	const userId = await requireUserId(request)
	const user = await prisma.user.findUniqueOrThrow({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			username: true,
			email: true,
			image: {
				select: { objectKey: true },
			},
			_count: {
				select: {
					sessions: {
						where: {
							expirationDate: { gt: new Date() },
						},
					},
				},
			},
		},
	})

	const twoFactorVerification = await prisma.verification.findUnique({
		select: { id: true },
		where: { target_type: { type: twoFAVerificationType, target: userId } },
	})

	const password = await prisma.password.findUnique({
		select: { userId: true },
		where: { userId },
	})

	return {
		user,
		hasPassword: Boolean(password),
		isTwoFactorEnabled: Boolean(twoFactorVerification),
		mcpDevToken:
			process.env.NODE_ENV === 'development'
				? process.env.MCP_DEV_TOKEN
				: undefined,
	}
}

type ProfileActionArgs = {
	request: Request
	userId: string
	formData: FormData
}
const profileUpdateActionIntent = 'update-profile'
const signOutOfSessionsActionIntent = 'sign-out-of-sessions'
const deleteDataActionIntent = 'delete-data'

export async function action({ request }: Route.ActionArgs) {
	const userId = await requireUserId(request)
	const formData = await request.formData()
	const intent = formData.get('intent')
	switch (intent) {
		case profileUpdateActionIntent: {
			return profileUpdateAction({ request, userId, formData })
		}
		case signOutOfSessionsActionIntent: {
			return signOutOfSessionsAction({ request, userId, formData })
		}
		case deleteDataActionIntent: {
			return deleteDataAction({ request, userId, formData })
		}
		default: {
			throw new Response(`Invalid intent "${intent}"`, { status: 400 })
		}
	}
}

export default function EditUserProfile({ loaderData }: Route.ComponentProps) {
	const displayName = loaderData.user.name ?? loaderData.user.username

	return (
		<div className="flex flex-col gap-10">
			<section className="grid gap-6">
				<div className="flex flex-wrap items-center gap-6">
					<div className="relative size-20">
						<Img
							src={getUserImgSrc(loaderData.user.image?.objectKey)}
							alt={displayName}
							className="h-full w-full rounded-full object-cover"
							width={160}
							height={160}
							isAboveFold
						/>
					</div>
					<div className="grid gap-1">
						<p className="text-body-sm font-semibold text-foreground">
							{displayName}
						</p>
						<p className="text-body-xs text-muted-foreground">
							@{loaderData.user.username} • {loaderData.user.email}
						</p>
						<Link
							preventScrollReset
							to="photo"
							className="text-body-2xs text-muted-foreground hover:text-foreground"
						>
							Change profile photo
						</Link>
					</div>
				</div>
				<UpdateProfile loaderData={loaderData} />
			</section>

			<section className="border-y border-border/40 py-4">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Account
				</h2>
				<div className="mt-4 grid gap-2 text-body-sm text-muted-foreground">
					<Link to="change-email" className="hover:text-foreground">
						Change email from {loaderData.user.email}
					</Link>
					<Link to="two-factor" className="hover:text-foreground">
						{loaderData.isTwoFactorEnabled
							? 'Two-factor authentication is enabled'
							: 'Enable two-factor authentication'}
					</Link>
					<Link
						to={loaderData.hasPassword ? 'password' : 'password/create'}
						className="hover:text-foreground"
					>
						{loaderData.hasPassword ? 'Change password' : 'Create a password'}
					</Link>
					<Link to="connections" className="hover:text-foreground">
						Manage connections
					</Link>
					<Link to="passkeys" className="hover:text-foreground">
						Manage passkeys
					</Link>
					<Link
						reloadDocument
						download="my-epic-notes-data.json"
						to="/resources/download-user-data"
						className="hover:text-foreground"
					>
						Download your data
					</Link>
				</div>
			</section>

			<McpDevAccess loaderData={loaderData} />

			<section className="grid gap-4 border-y border-border/40 py-4">
				<h2 className="text-body-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
					Sessions & data
				</h2>
				<SignOutOfSessions loaderData={loaderData} />
				<DeleteData />
			</section>
		</div>
	)
}

function McpDevAccess({
	loaderData,
}: {
	loaderData: {
		user: { id: string }
		mcpDevToken?: string
	}
}) {
	const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle')
	const token = loaderData.mcpDevToken
	const headers = [
		`Authorization: Bearer ${token ?? '<MCP_DEV_TOKEN>'}`,
		`X-MCP-User-Id: ${loaderData.user.id}`,
	].join('\n')

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(headers)
			setStatus('copied')
			window.setTimeout(() => setStatus('idle'), 2000)
		} catch {
			setStatus('error')
			window.setTimeout(() => setStatus('idle'), 2000)
		}
	}

	return (
		<section className="border-y border-border/40 py-4">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<div>
					<p className="text-body-2xs text-muted-foreground/70 uppercase tracking-[0.2em]">
						Developer
					</p>
					<p className="text-body-sm font-semibold text-foreground">
						MCP inspector headers
					</p>
				</div>
				<button
					type="button"
					onClick={handleCopy}
					className="text-body-2xs text-muted-foreground hover:text-foreground"
				>
					{status === 'copied'
						? 'Copied'
						: status === 'error'
							? 'Copy failed'
							: 'Copy headers'}
				</button>
			</div>
			<p className="mt-2 text-body-2xs text-muted-foreground">
				Use these headers in MCP Inspector/Jam. If you haven&apos;t set
				`MCP_DEV_TOKEN` yet, copy the template and update it in your tool.
			</p>
			<pre className="mt-4 overflow-x-auto rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground">
				{headers}
			</pre>
		</section>
	)
}

async function profileUpdateAction({ userId, formData }: ProfileActionArgs) {
	const submission = await parseWithZod(formData, {
		async: true,
		schema: ProfileFormSchema.superRefine(async ({ username }, ctx) => {
			const existingUsername = await prisma.user.findUnique({
				where: { username },
				select: { id: true },
			})
			if (existingUsername && existingUsername.id !== userId) {
				ctx.addIssue({
					path: ['username'],
					code: z.ZodIssueCode.custom,
					message: 'A user already exists with this username',
				})
			}
		}),
	})
	if (submission.status !== 'success') {
		return data(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { username, name } = submission.value

	await prisma.user.update({
		select: { username: true },
		where: { id: userId },
		data: {
			name: name,
			username: username,
		},
	})

	return {
		result: submission.reply(),
	}
}

function UpdateProfile({
	loaderData,
}: {
	loaderData: Route.ComponentProps['loaderData']
}) {
	const fetcher = useFetcher<typeof profileUpdateAction>()

	const [form, fields] = useForm({
		id: 'edit-profile',
		constraint: getZodConstraint(ProfileFormSchema),
		lastResult: fetcher.data?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ProfileFormSchema })
		},
		defaultValue: {
			username: loaderData.user.username,
			name: loaderData.user.name,
		},
	})

	return (
		<fetcher.Form method="POST" {...getFormProps(form)}>
			<div className="grid gap-4 md:grid-cols-2">
				<Field
					labelProps={{
						htmlFor: fields.username.id,
						children: 'Username',
					}}
					inputProps={getInputProps(fields.username, { type: 'text' })}
					errors={fields.username.errors}
				/>
				<Field
					labelProps={{ htmlFor: fields.name.id, children: 'Name' }}
					inputProps={getInputProps(fields.name, { type: 'text' })}
					errors={fields.name.errors}
				/>
			</div>

			<ErrorList errors={form.errors} id={form.errorId} />

			<div className="mt-6 flex justify-end">
				<StatusButton
					type="submit"
					name="intent"
					value={profileUpdateActionIntent}
					status={
						fetcher.state !== 'idle' ? 'pending' : (form.status ?? 'idle')
					}
				>
					Save changes
				</StatusButton>
			</div>
		</fetcher.Form>
	)
}

async function signOutOfSessionsAction({ request, userId }: ProfileActionArgs) {
	const authSession = await authSessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const sessionId = authSession.get(sessionKey)
	invariantResponse(
		sessionId,
		'You must be authenticated to sign out of other sessions',
	)
	await prisma.session.deleteMany({
		where: {
			userId,
			id: { not: sessionId },
		},
	})
	return { status: 'success' } as const
}

function SignOutOfSessions({
	loaderData,
}: {
	loaderData: Route.ComponentProps['loaderData']
}) {
	const dc = useDoubleCheck()

	const fetcher = useFetcher<typeof signOutOfSessionsAction>()
	const otherSessionsCount = loaderData.user._count.sessions - 1
	return (
		<div>
			{otherSessionsCount ? (
				<fetcher.Form method="POST">
					<StatusButton
						{...dc.getButtonProps({
							type: 'submit',
							name: 'intent',
							value: signOutOfSessionsActionIntent,
						})}
						variant={dc.doubleCheck ? 'destructive' : 'default'}
						status={
							fetcher.state !== 'idle'
								? 'pending'
								: (fetcher.data?.status ?? 'idle')
						}
					>
						{dc.doubleCheck
							? `Are you sure?`
							: `Sign out of ${otherSessionsCount} other sessions`}
					</StatusButton>
				</fetcher.Form>
			) : (
				<p className="text-body-xs text-muted-foreground">
					This is your only session.
				</p>
			)}
		</div>
	)
}

async function deleteDataAction({ userId }: ProfileActionArgs) {
	await prisma.user.delete({ where: { id: userId } })
	return redirectWithToast('/', {
		type: 'success',
		title: 'Data Deleted',
		description: 'All of your data has been deleted',
	})
}

function DeleteData() {
	const dc = useDoubleCheck()

	const fetcher = useFetcher<typeof deleteDataAction>()
	return (
		<div>
			<fetcher.Form method="POST">
				<StatusButton
					{...dc.getButtonProps({
						type: 'submit',
						name: 'intent',
						value: deleteDataActionIntent,
					})}
					variant={dc.doubleCheck ? 'destructive' : 'default'}
					status={fetcher.state !== 'idle' ? 'pending' : 'idle'}
				>
					{dc.doubleCheck ? `Are you sure?` : `Delete all your data`}
				</StatusButton>
			</fetcher.Form>
		</div>
	)
}
