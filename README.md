# @strawberry-vis/g-device-api

A set of Device API which implements with WebGL1/2 & WebGPU.

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
