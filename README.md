# @strawberry-vis/g-device-api

A set of Device API which implements with WebGL1/2 & WebGPU.

![CI](https://github.com/strawberry-vis/g-device-api/workflows/CI/badge.svg) [![Coverage Status](https://coveralls.io/repos/github/strawberry-vis/g-device-api/badge.svg?branch=next)](https://coveralls.io/github/strawberry-vis/g-device-api?branch=next)

![TypeScript](https://img.shields.io/badge/language-typescript-blue.svg) ![License](https://img.shields.io/badge/license-MIT-000000.svg)

## Installing

```bash
npm install @strawberry-vis/g-device-api
```

Create a Buffer.

```js
import {
    Device,
    BufferUsage,
    WebGLDeviceContribution,
} from '@strawberry-vis/g-device-api';

const deviceContribution = new WebGLDeviceContribution({
    targets: ['webgl1'],
});

const swapChain = await deviceContribution.createSwapChain($canvas);
swapChain.configureSwapChain(width, height);
const device = swapChain.getDevice();

device.createBuffer({
    viewOrSize: 8,
    usage: BufferUsage.VERTEX,
});
```

## API Reference
