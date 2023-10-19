import { test, expect } from '@playwright/test';

const url1 = './g-device-api/?name=PrimitiveTopologyPoints';

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.setTimeout(testInfo.timeout + 160000);
});

test.describe('Testing', () => {
  test('PrimitiveTopologyPoints', async ({ page, context }) => {
    let resolveReadyPromise;
    const readyPromise = new Promise((resolve) => {
      resolveReadyPromise = () => {
        resolve(this);
      };
    });

    await context.exposeFunction('screenshot', () => {
      resolveReadyPromise();
    });

    await page.goto(url1);
    await readyPromise;

    await expect(page.locator('canvas')).toHaveScreenshot(
      'PrimitiveTopologyPoints.png',
    );
  });
});
