// Guía de pasos del ataque aéreo (Fase 24, TC-006): un paso por pantalla y acceso al wizard cuando toca calcular.
const { test, expect } = require('./fixtures');

test('Resolver combate ofrece la guía y se recorre paso a paso hasta el wizard de BVR', async ({ page }) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: /^Resolver combate/ }).click();
  await page.getByRole('button', { name: /^Guía: ataque aéreo paso a paso/ }).click();
  await expect(page).toHaveURL(/#\/guia\/air-attack$/);
  await expect(page.getByText('Paso 1 de 4')).toBeVisible();
  await expect(page.getByRole('heading', { name: /¿Qué misión ejecuta el grupo que ataca\?/ })).toBeVisible();
  await expect(page.getByText('Patrulla Aérea (CAPs)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Siguiente paso/ }).click();
  await expect(page.getByText('Paso 2 de 4')).toBeVisible();
  await expect(page.locator('.combat-guide__clarification').nth(1)).toContainText('en red');
  await expect(page.locator('.combat-guide__clarification')).toHaveCount(4);
  await page.getByRole('button', { name: /Siguiente paso/ }).click();
  await expect(page.getByText('Paso 3 de 4')).toBeVisible();
  await expect(page.getByText(/misma tirada que la de penetración/)).toBeVisible();
  await page.getByRole('button', { name: /Resolver el combate aéreo BVR/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/air-combat-bvr$/);
});

test('volver al paso anterior y saltar con los pasos numerados', async ({ page }) => {
  await page.goto('/#/guia/air-attack');
  await page.getByRole('button', { name: /^4\. Combate aéreo cercano/ }).click();
  await expect(page.getByText('Paso 4 de 4')).toBeVisible();
  await page.getByRole('button', { name: /Paso anterior/ }).click();
  await expect(page.getByText('Paso 3 de 4')).toBeVisible();
});

test('la guía de reacción terrestre se recorre y lleva al wizard de reacciones', async ({ page }) => {
  await page.goto('/#/guia/ground-reaction');
  await expect(page.getByText('Paso 1 de 4')).toBeVisible();
  await page.getByRole('button', { name: /^4\. Qué reacción toca/ }).click();
  await page.getByRole('button', { name: /Resolver un ataque de reacción/ }).click();
  await expect(page).toHaveURL(/#\/wizard\/ground-reaction$/);
});
