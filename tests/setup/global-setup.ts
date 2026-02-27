import path from 'node:path'
import { execaCommand } from 'execa'
import fsExtra from 'fs-extra'
import 'dotenv/config'
import '#app/utils/env.server.ts'

export const BASE_DATABASE_PATH = path.join(
	process.cwd(),
	`./tests/prisma/base.db`,
)
const ROOT_DATABASE_PATH = path.join(process.cwd(), './data.db')
const PRISMA_DATABASE_PATH = path.join(process.cwd(), './prisma/data.db')

async function resolveSourceDatabasePath() {
	if (await fsExtra.pathExists(ROOT_DATABASE_PATH)) {
		return ROOT_DATABASE_PATH
	}
	return PRISMA_DATABASE_PATH
}

export async function setup() {
	const databaseExists = await fsExtra.pathExists(BASE_DATABASE_PATH)

	if (databaseExists) {
		const databaseLastModifiedAt = (await fsExtra.stat(BASE_DATABASE_PATH))
			.mtime
		const prismaSchemaLastModifiedAt = (
			await fsExtra.stat('./prisma/schema.prisma')
		).mtime

		if (prismaSchemaLastModifiedAt < databaseLastModifiedAt) {
			return
		}
	}

	await fsExtra.ensureDir(path.dirname(BASE_DATABASE_PATH))

	const sourceBeforeReset = await resolveSourceDatabasePath()
	const backupPath = `${sourceBeforeReset}.vitest-backup`
	const hadDatabaseBeforeReset = await fsExtra.pathExists(sourceBeforeReset)
	if (hadDatabaseBeforeReset) {
		await fsExtra.copyFile(sourceBeforeReset, backupPath)
	}

	try {
		await execaCommand(
			'npx prisma migrate reset --force --skip-seed --skip-generate',
			{
				stdio: 'inherit',
				env: {
					...process.env,
					// allow AI agents to reset the database while running tests
					PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION: 'true',
				},
			},
		)

		const sourceAfterReset = await resolveSourceDatabasePath()
		await fsExtra.copyFile(sourceAfterReset, BASE_DATABASE_PATH)
	} finally {
		if (hadDatabaseBeforeReset && (await fsExtra.pathExists(backupPath))) {
			await fsExtra.copyFile(backupPath, sourceBeforeReset)
			await fsExtra.remove(backupPath)
		}
	}
}
