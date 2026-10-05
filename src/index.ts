import type { ImageModelV4, ImageModelV4CallOptions, ImageModelV4Result } from '@ai-sdk/provider';

/**
 * Veida AI image provider for the Vercel AI SDK.
 *
 *   import { generateImage } from 'ai';
 *   import { veida } from 'veida-ai-provider';
 *
 *   const { image } = await generateImage({ model: veida.image(), prompt: 'a paper boat at sunrise' });
 *
 * It uses Veida's free anonymous tier: no key, no account. 1K output,
 * watermarked, about seven images a day per machine.
 */

export interface VeidaProviderSettings {
  /** Service root, for a test or a proxy. */
  baseURL?: string;
  /** Custom fetch implementation. */
  fetch?: typeof fetch;
  /** Poll interval in milliseconds. */
  pollIntervalMs?: number;
  /** Deadline for one image in milliseconds. */
  timeoutMs?: number;
}

export interface VeidaProvider {
  /** The free engine, `veida-image-v1`. */
  image(modelId?: string): ImageModelV4;
  imageModel(modelId?: string): ImageModelV4;
}

const FREE_MODEL = 'veida-image-v1';
const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];

export class VeidaError extends Error {
  constructor(public reason: 'quota' | 'rejected' | 'timeout' | 'other', message: string) {
    super(`veida: ${message}`);
    this.name = 'VeidaError';
  }
}

function anonId(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return 'aisdk-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

class VeidaImageModel implements ImageModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'veida';
  readonly maxImagesPerCall = 1;
  readonly supportsFileInputs = false;
  readonly supportsMaskInputs = false;

  constructor(readonly modelId: string, private readonly settings: VeidaProviderSettings) {}

  private async call(path: string, id: string, body: unknown, signal?: AbortSignal): Promise<any> {
    const f = this.settings.fetch ?? fetch;
    const res = await f((this.settings.baseURL ?? 'https://veida.ai') + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-anon-id': id },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const env = (await res.json()) as { code: number; message?: string; data?: any };
    if (env.code !== 0) throw new VeidaError('other', env.message ?? 'request refused');
    return env.data ?? {};
  }

  async doGenerate(options: ImageModelV4CallOptions): Promise<ImageModelV4Result> {
    const warnings: ImageModelV4Result['warnings'] = [];
    if (options.size) warnings.push({ type: 'unsupported', feature: 'size', details: 'Use aspectRatio instead.' });
    if (options.seed !== undefined) warnings.push({ type: 'unsupported', feature: 'seed' });
    if (!options.prompt?.trim()) throw new VeidaError('other', 'prompt is required');
    const ratio = options.aspectRatio ?? '1:1';
    if (!RATIOS.includes(ratio)) throw new VeidaError('other', `aspectRatio must be one of ${RATIOS.join(', ')}`);

    const id = anonId();
    const submitted = await this.call('/api/ai/generate', id, {
      provider: 'kie', mediaType: 'image', model: FREE_MODEL, scene: 'text-to-image',
      prompt: options.prompt, options: { aspect_ratio: ratio },
    }, options.abortSignal);

    // The quota wall answers 200 with code 0 and wall: true.
    if (submitted.wall) {
      throw new VeidaError('quota', submitted.reason === 'anon_ip_daily'
        ? 'this machine has used its 30 free credits for today; sign in at https://veida.ai/pricing'
        : 'free allowance spent; sign in at https://veida.ai/pricing');
    }
    if (!submitted.id) throw new VeidaError('other', 'the service returned no task id');

    const deadline = Date.now() + (this.settings.timeoutMs ?? 240_000);
    const every = this.settings.pollIntervalMs ?? 4_000;
    const query = `/api/ai/anon-query?taskId=${encodeURIComponent(submitted.id)}&provider=kie&mediaType=image`;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, every));
      let p: any;
      try {
        p = await this.call(query, id, undefined, options.abortSignal);
      } catch (e) {
        if (options.abortSignal?.aborted) throw e;
        continue; // a dropped poll is not a failed job
      }
      const url: string | undefined = p.images?.[0];
      if (url) {
        const f = this.settings.fetch ?? fetch;
        const bytes = new Uint8Array(await (await f(url, { signal: options.abortSignal })).arrayBuffer());
        return {
          images: [bytes],
          warnings,
          providerMetadata: { veida: { images: [{ url, watermarked: Boolean(p.watermarked?.[0]) }] } },
          response: { timestamp: new Date(), modelId: FREE_MODEL, headers: undefined },
        };
      }
      const s = String(p.status ?? '').toLowerCase();
      if (s === 'failed' || s === 'error') throw new VeidaError('rejected', 'prompt refused by the content filter; reword it');
    }
    throw new VeidaError('timeout', 'still queued when the deadline passed');
  }
}

export function createVeida(settings: VeidaProviderSettings = {}): VeidaProvider {
  const image = (modelId: string = FREE_MODEL) => new VeidaImageModel(modelId, settings);
  return { image, imageModel: image };
}

/** Default instance on the free tier. */
export const veida = createVeida();
