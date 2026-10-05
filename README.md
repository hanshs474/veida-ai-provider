# veida-ai-provider

A [Vercel AI SDK](https://ai-sdk.dev) image provider that works with **no API key**.

```bash
npm install ai veida-ai-provider
```

```ts
import { generateImage } from 'ai';
import { veida } from 'veida-ai-provider';

const { image, providerMetadata } = await generateImage({
  model: veida.image(),
  prompt: 'a paper boat on a calm lake at sunrise, soft light',
  aspectRatio: '16:9',
});
// image.uint8Array holds the picture; the hosted URL is in providerMetadata.veida.images[0].url
```

It runs on the anonymous tier of [Veida](https://veida.ai/?utm_source=npm-aisdk&utm_medium=package),
so a fresh project can generate images before anyone signs up for anything. Measured against the
running service: one image per client id (the provider mints a new id each call), about seven
images a day per machine, 1K output with a watermark.

| | |
|---|---|
| `aspectRatio` | `1:1`, `16:9`, `9:16`, `4:3`, `3:4` |
| `size`, `seed` | not supported; returned as warnings |
| `n` | 1 per call (the SDK splits larger requests) |

Failures throw `VeidaError` with a `reason`: `quota` (wait, or sign in), `rejected` (reword the
prompt), `timeout` (retry) or `other`.

Signing in on veida.ai removes the watermark and opens larger models such as
[GPT Image 2](https://veida.ai/image/gpt-image-2?utm_source=npm-aisdk&utm_medium=package) and
[Nano Banana 2](https://veida.ai/image/nano-banana-2?utm_source=npm-aisdk&utm_medium=package);
see the [pricing page](https://veida.ai/pricing?utm_source=npm-aisdk&utm_medium=package). Docs for
the other clients: [veida.readthedocs.io](https://veida.readthedocs.io/). MIT.
