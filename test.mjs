import { generateImage } from 'ai';
import { veida } from './dist/index.js';
const { image, providerMetadata } = await generateImage({
  model: veida.image(),
  prompt: 'a paper boat on a calm lake at sunrise, soft light',
  aspectRatio: '16:9',
});
console.log('live:', providerMetadata.veida.images[0].url, image.uint8Array.length, 'bytes');
if (image.uint8Array.length < 1000) process.exit(1);
