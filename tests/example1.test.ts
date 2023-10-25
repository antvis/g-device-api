import { test, expect } from '@playwright/test';

const url1 = './g-device-api/?name=PrimitiveTopologyPoints';
const url2 = './g-device-api/?name=PrimitiveTopologyTriangles';

test.beforeEach(async ({ page }, testInfo) => {
  testInfo.setTimeout(testInfo.timeout + 160000);
});

test.describe('Testing', () => {
  test('PrimitiveTopologyPoints', async ({ page, context }) => {
    //   const createReadyPromise = async (context: BrowserContext) => {
    let resolveReadyPromise: () => void;
    const readyPromise = new Promise((resolve) => {
      resolveReadyPromise = () => {
        resolve(this);
      };
    });

    await context.exposeFunction('screenshot', async () => {
      resolveReadyPromise();
    });

    await page.goto(url1);
    await readyPromise;

    await expect(page.locator('canvas')).toHaveScreenshot(
      'PrimitiveTopologyPoints.png',
    );
  });

  test('PrimitiveTopologyTriangles', async ({ page, context }) => {
    //   const createReadyPromise = async (context: BrowserContext) => {
    let resolveReadyPromise: () => void;
    const readyPromise = new Promise((resolve) => {
      resolveReadyPromise = () => {
        resolve(this);
      };
    });

    await context.exposeFunction('screenshot', async () => {
      resolveReadyPromise();
    });

    await page.goto(url2);
    await readyPromise;

    await expect(page.locator('canvas')).toHaveScreenshot(
      'PrimitiveTopologyTriangles.png',
    );
  });
});
