import { expect, type Page, test } from '@playwright/test';

const API = 'http://localhost:4010/v1';

function demo(page: Page, key: string) {
  return page.goto(`/demo/?key=${key}&baseUrl=${encodeURIComponent(API)}`);
}

async function fillContact(page: Page) {
  await page.getByLabel('Nombre completo').fill('Ana López');
  await page.getByLabel('Calle y número').fill('Madero 1');
}

function submitted(page: Page) {
  return page.locator('#resultado');
}

test('con key y origen permitidos autocompleta la dirección', async ({ page }) => {
  await demo(page, 'osp_pk_test');
  await fillContact(page);

  await page.getByLabel('Código postal').fill('06000');

  await expect(page.getByLabel('Municipio o alcaldía')).toHaveValue('Cuauhtémoc');
  await expect(page.getByLabel('Estado')).toHaveValue('Ciudad de México');
  await expect(page.getByLabel('Ciudad')).toHaveValue('Ciudad de México');

  // El label "Colonia" ahora apunta al select; el input original queda oculto.
  const colonias = page.getByLabel('Colonia');
  await expect(colonias).toHaveJSProperty('tagName', 'SELECT');
  await expect(page.locator('#colonia')).toBeHidden();
  await colonias.selectOption({ label: 'Centro (Área 2)' });

  await expect(page.getByRole('link', { name: 'OsoPostal' })).toBeVisible();

  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(submitted(page)).toContainText('"colonia": "Centro (Área 2)"');
  await expect(submitted(page)).toContainText('"estado": "Ciudad de México"');
});

test('reconoce nombres de estado distintos al oficial y cambia de CP', async ({ page }) => {
  await demo(page, 'osp_pk_test');

  await page.getByLabel('Código postal').fill('06000');
  await expect(page.getByLabel('Municipio o alcaldía')).toHaveValue('Cuauhtémoc');

  await page.getByLabel('Código postal').fill('50000');

  // "México" (oficial) → opción "Estado de México"; la única colonia se elige sola.
  await expect(page.getByLabel('Estado')).toHaveValue('Estado de México');
  await expect(page.getByLabel('Municipio o alcaldía')).toHaveValue('Toluca');
  await expect(page.locator('#colonia')).toHaveValue('Toluca de Lerdo Centro');
});

test('"Mi colonia no aparece" deja escribir la colonia a mano', async ({ page }) => {
  await demo(page, 'osp_pk_test');
  await fillContact(page);
  await page.getByLabel('Código postal').fill('06000');
  await expect(page.getByLabel('Municipio o alcaldía')).toHaveValue('Cuauhtémoc');

  await page.locator('select.osopostal-colonia').selectOption({ label: 'Mi colonia no aparece' });

  const input = page.locator('#colonia');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await input.fill('Colonia nueva');
  await page.getByRole('button', { name: 'Enviar' }).click();
  await expect(submitted(page)).toContainText('"colonia": "Colonia nueva"');
});

test('ante 403 origin_not_allowed falla en silencio y el formulario sigue utilizable', async ({ page }) => {
  await demo(page, 'osp_pk_blocked');
  await fillContact(page);

  const response = page.waitForResponse((res) => res.url().includes('/codigos-postales/06000'));
  await page.getByLabel('Código postal').fill('06000');
  expect((await response).status()).toBe(403);

  await expect(page.locator('#eventos')).toContainText('osopostal:error 06000 (origin_not_allowed)');
  await expect(page.locator('.osopostal-status')).toBeEmpty();
  await expect(page.locator('.osopostal-branding')).toBeHidden();

  // Nada se llenó ni se bloqueó: el usuario completa todo a mano y envía.
  await expect(page.getByLabel('Municipio o alcaldía')).toHaveValue('');
  await page.getByLabel('Colonia').fill('Centro');
  await page.getByLabel('Municipio o alcaldía').fill('Cuauhtémoc');
  await page.getByLabel('Estado').selectOption('Ciudad de México');
  await page.getByRole('button', { name: 'Enviar' }).click();

  await expect(submitted(page)).toContainText('"colonia": "Centro"');
});

test('un CP inexistente muestra un aviso discreto sin bloquear el envío', async ({ page }) => {
  await demo(page, 'osp_pk_test');

  await page.getByLabel('Código postal').fill('99999');

  await expect(page.getByRole('status')).toHaveText(/No encontramos este código postal/);
  expect(await page.getByLabel('Código postal').evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
});

test('el plan pro no muestra la marca de agua', async ({ page }) => {
  await demo(page, 'osp_pk_pro');

  await page.getByLabel('Código postal').fill('06000');

  await expect(page.getByLabel('Municipio o alcaldía')).toHaveValue('Cuauhtémoc');
  await expect(page.locator('.osopostal-branding')).toBeHidden();
});
