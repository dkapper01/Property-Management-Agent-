import { expect, test } from '#tests/playwright-utils.ts'

test('create property → create maintenance request', async ({
	page,
	navigate,
	login,
}) => {
	await login()

	await navigate('/orgs')
	await page
		.getByRole('textbox', { name: /organization name/i })
		.fill('Acme Property Group')
	await page.getByRole('button', { name: /create organization/i }).click()
await expect(page).toHaveURL(/\/orgs\/.+\/properties/)

	await page
		.getByRole('textbox', { name: /property name/i })
		.fill('Oak Apartments')
	await page.getByRole('button', { name: /create property/i }).click()
	await expect(page.getByText('Oak Apartments')).toBeVisible()

	await page.getByRole('link', { name: /open/i }).first().click()
await expect(page).toHaveURL(/\/orgs\/.+\/properties\/.+/)

	await page
		.getByRole('textbox', { name: /request title/i })
		.fill('Leaking sink')
	await page.getByRole('button', { name: /create request/i }).click()

	await expect(page.getByText('Leaking sink')).toBeVisible()
})
