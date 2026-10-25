import { test, expect, type Page } from '@playwright/test';
import { existsSync } from 'node:fs';

async function ready(page: Page) {
  await page.goto('/?debug=1');
  await expect(page.getByTestId('scene-canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('play-toggle')).toBeEnabled();
}

async function select(page: Page, id: string, query: string) {
  await page.getByRole('textbox', { name: 'Szukaj triku' }).fill(query);
  await page.locator(`[data-trick="${id}"]`).click();
  await page.getByTestId('play-toggle').click();
}

test('downloaded bike, rider and helmet load together and keep basic poses valid', async ({ page }) => {
  test.skip(!['public/models/downloaded/torque.glb', 'public/assets/rider/imported-rider.glb', 'public/assets/helmet/imported-helmet.glb'].every(file => existsSync(file)), 'Optional CGTrader models are supplied locally by their license holder.');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/?models=downloaded&debug=1');
  await expect(page.getByTestId('scene-canvas')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('play-toggle')).toBeEnabled();
  const states = await page.evaluate(() => {
    const api = (window as any).__MTB_LAB__, samples = [];
    for (const name of ['Trackstand', 'Wheelie', 'Manual', 'Nose Manual', 'Stoppie / Endo', 'Bunny Hop', 'English Bunny Hop', 'American Bunny Hop', 'Pumping', 'Jump', 'Drop', 'Whip', 'Tabletop']) {
      api.select(name); api.pause();
      const duration = api.inspect().duration;
      for (const progress of [.25, .5, .75]) {
        api.seek(duration * progress);
        const state = api.inspect();
        samples.push({ name, finite: state.finite, bike: state.suspension.model, rider: state.rider.model, helmet: state.rider.helmet });
      }
    }
    api.select('Bunny Hop'); api.pause(); api.seek(0); api.showDebug(false);
    return samples;
  });
  for (const state of states) {
    expect(state.finite, state.name).toBe(true);
    expect(state.bike).toBe('downloaded-torque');
    expect(state.rider).toBe('imported');
    expect(state.helmet).toBe('half-shell');
  }
  await page.getByTestId('play-toggle').click();
  await page.waitForFunction(() => (window as any).__MTB_LAB__.inspect().pose.time > .15);
  await page.getByTestId('play-toggle').click();
  await page.getByRole('button', { name: 'Pokaż sam rower' }).click();
  await expect(page.locator('h1')).toHaveText('Enduro.');
  expect(errors).toEqual([]);
});

test('catalog, search, playback, seek, switching, controls and unavailable entry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await ready(page);
  await expect(page.locator('[data-trick]')).toHaveCount(110);
  await page.getByRole('textbox', { name: 'Szukaj triku' }).fill('rownowagi');
  await expect(page.locator('[data-trick="trackstand"]')).toBeVisible();
  await page.getByRole('textbox', { name: 'Szukaj triku' }).fill('niewystepujacy-trik-zz');
  await expect(page.getByText('Nie znaleziono triku')).toBeVisible();
  await page.getByRole('button', { name: 'Wyczyść filtry' }).click();
  await expect(page.locator('[data-trick]')).toHaveCount(110);
  await select(page, 'wheelie', 'Wheelie');
  await expect(page.locator('h1')).toHaveText('Wheelie');
  await page.getByTestId('timeline').fill('1.5');
  const paused = await page.evaluate(() => (window as any).__MTB_LAB__.inspect());
  expect(paused.pose.pitch).toBeGreaterThan(.3);
  expect(paused.contacts.rear[1]).toBeCloseTo(.37, 2);
  await page.waitForTimeout(150);
  expect((await page.evaluate(() => (window as any).__MTB_LAB__.inspect())).pose.time).toBe(paused.pose.time);
  await page.getByRole('button', { name: 'Odtwórz ponownie', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Wstrzymaj pokaz' })).toBeVisible();
  await select(page, 'tabletop', 'Tabletop');
  await page.getByRole('button', { name: 'Slow-mo', exact: true }).click();
  const figure = await page.evaluate(() => (window as any).__MTB_LAB__.inspect());
  expect(figure.pose.grounded).toBe(false);
  expect(figure.pose.roll).toBeLessThan(-1.1);
  expect(figure.rider.asset).toBe(true);
  await expect(page.getByRole('button', { name: '0.25×', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await select(page, 'backflip', 'Backflip');
  await page.getByTestId('timeline').fill('4');
  expect((await page.evaluate(() => (window as any).__MTB_LAB__.inspect())).finite).toBe(true);
  await page.getByRole('button', { name: 'Pokaż sam rower' }).click();
  await expect(page.locator('h1')).toHaveText('Enduro.');
  await page.getByRole('button', { name: 'Reset kamery', exact: true }).click();
  await page.getByRole('button', { name: 'Ustawienia dźwięku i obrazu' }).click();
  await page.getByRole('combobox', { name: 'Jakość obrazu' }).selectOption('low');
  await page.getByRole('button', { name: 'Zamknij ustawienia' }).click();
  await page.getByRole('textbox', { name: 'Szukaj triku' }).fill('Twister');
  await page.locator('[data-trick="twister"]').click();
  await expect(page.getByTestId('play-toggle')).toBeDisabled();
  await expect(page.getByText('Ten pokaz jest w przygotowaniu.', { exact: false })).toBeVisible();
  expect(errors).toEqual([]);
});

test('representative trick phases keep finite geometry and contact, with screenshots', async ({ page }) => {
  await ready(page);
  const cases = [
    ['wheelie', 'Wheelie'], ['bunny-hop', 'Bunny Hop'], ['tabletop', 'Tabletop'],
    ['barspin', 'Barspin'], ['backflip', 'Backflip'], ['no-hander', 'No Hander'], ['wallride', 'Wallride'],
  ];
  for (const [id, name] of cases) {
    await select(page, id!, name!);
    await page.getByRole('button', { name: 'Bok', exact: true }).click();
    for (const progress of [.25, .5, .75, 1]) {
      const state = await page.evaluate((p) => {
        const api = (window as any).__MTB_LAB__;
        api.pause();
        const duration = Number((document.querySelector('[data-testid="timeline"]') as HTMLInputElement).max);
        api.seek(duration * p);
        return api.inspect();
      }, progress);
      expect(state.finite, `${name} finite @${progress}`).toBe(true);
      expect(state.pose.frontCompression).toBeGreaterThanOrEqual(0);
      expect(state.pose.frontCompression).toBeLessThanOrEqual(.15);
      expect(state.pose.rearCompression).toBeGreaterThanOrEqual(0);
      expect(state.pose.rearCompression).toBeLessThanOrEqual(.14);
      if (progress === .5) {
        await page.screenshot({ path: `artifacts/qa/${id}-apex.png`, fullPage: true });
      }
    }
  }
});

test('mobile layout and drawer remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  const sizes = await page.evaluate(() => ({ body: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(sizes.body).toBeLessThanOrEqual(sizes.viewport + 1);
  await page.getByRole('button', { name: /Katalog trików/ }).click();
  await page.getByRole('textbox', { name: 'Szukaj triku' }).fill('Manual');
  await page.locator('[data-trick="manual"]').click();
  await expect(page.locator('h1')).toHaveText('Manual');
  await expect(page.getByRole('button', { name: /Katalog trików/ })).toHaveAttribute('aria-expanded', 'false');
  await page.screenshot({ path: 'artifacts/qa/mobile.png', fullPage: true });
});

test('freeride interface keeps readable controls, quiet details and the requested branding', async ({ page }) => {
  await ready(page);
  await expect(page.getByRole('link', { name: 'by yasio.dev', exact: true })).toHaveAttribute('href', 'https://yasio.dev');
  await expect(page.locator('.trick-details')).not.toHaveAttribute('open');
  await expect(page.locator('.detail-note')).not.toBeVisible();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const sizes = await page.evaluate(() => ({
      purple: getComputedStyle(document.documentElement).getPropertyValue('--purple').trim(),
      fonts: ['.stage-description', '.camera-presets button', '.play-button', '.app-footer a'].map(s => parseFloat(getComputedStyle(document.querySelector(s)!).fontSize)),
      targets: [...document.querySelectorAll('.playback-controls button')].map(b => b.getBoundingClientRect().height),
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    expect(sizes.purple).toBe('#5918df');
    expect(Math.min(...sizes.fonts)).toBeGreaterThanOrEqual(14);
    expect(Math.min(...sizes.targets)).toBeGreaterThanOrEqual(44);
    expect(sizes.overflow).toBe(false);
  }
  await page.locator('.trick-details summary').click();
  await expect(page.locator('.detail-note')).toBeVisible();
});

test('nine added demonstrations play distinct figure phases and return to contact', async ({ page }) => {
  await ready(page);
  const cases = [
    ['can-can', 'Can-Can'], ['no-foot-can-can', 'No Foot Can-Can'], ['nac-nac', 'Nac-Nac'],
    ['indian-air', 'Indian Air'], ['pendulum', 'Pendulum'], ['lookback', 'Lookback'],
    ['turndown', 'Turndown'], ['fufanu', 'Fufanu'], ['up-to-rear', 'Up to Rear'],
  ];
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const [id, name] of cases) {
    await select(page, id!, name!);
    await expect(page.getByTestId('play-toggle')).toBeEnabled();
    const duration = Number(await page.getByTestId('timeline').getAttribute('max'));
    for (const p of [.3, .5, .7, 1]) {
      const state = await page.evaluate(time => {
        const api = (window as any).__MTB_LAB__;
        api.pause(); api.seek(time); api.showDebug(false);
        return api.inspect();
      }, duration * p);
      expect(state.trick).toBe(id);
      expect(state.finite, `${name} @${p}`).toBe(true);
      if (p === 1) {
        expect(state.pose.handRelease).toEqual([0, 0]);
        expect(state.pose.footRelease).toEqual([0, 0]);
      }
    }
    await page.getByTestId('timeline').fill(String(duration * .52));
    await page.screenshot({ path: `artifacts/qa/${id}-new.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
