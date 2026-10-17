const MODEL = '@cf/black-forest-labs/flux-2-klein-4b';

// FLUX returns raw base64 without a type; sniff it from the magic bytes so the
// browser gets a correct data URL mime.
function detectMime(b64) {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBORw0KGgo')) return 'image/png';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const secret = request.headers.get('x-ai-secret');
    if (!secret || secret !== env.AI_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      return new Response('Expected multipart/form-data', { status: 400 });
    }

    const prompt = form.get('prompt');
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return new Response('Missing or empty prompt', { status: 400 });
    }

    const image = form.get('input_image_0');
    if (!image || typeof image === 'string') {
      return new Response('Missing input_image_0 image', { status: 400 });
    }

    // Optional tuning knobs passed through to the model.
    const guidance = form.get('guidance');
    const width = form.get('width');
    const height = form.get('height');

    // FLUX.2 klein expects multipart form data with the image as binary bytes.
    // It supports up to 4 reference images (input_image_0..3); forward any that
    // were supplied so a material reference can accompany the room photo.
    const out = new FormData();
    out.append('prompt', prompt.trim());
    for (let i = 0; i < 4; i++) {
      const part = form.get(`input_image_${i}`);
      if (part && typeof part !== 'string') {
        out.append(`input_image_${i}`, new Blob([await part.arrayBuffer()], { type: part.type || 'image/png' }));
      }
    }
    if (guidance !== null && guidance !== '') out.append('guidance', String(guidance));
    if (width !== null && width !== '') out.append('width', String(width));
    if (height !== null && height !== '') out.append('height', String(height));

    const serialized = new Response(out);
    const body = serialized.body;
    const contentType = serialized.headers.get('content-type') || 'multipart/form-data';

    let result;
    try {
      result = await env.AI.run(MODEL, { multipart: { body, contentType } });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      return new Response('AI model error: ' + msg, { status: 502 });
    }

    const b64 = result && result.image;
    if (!b64) {
      return new Response('AI model returned no image', { status: 502 });
    }

    return Response.json({ image: b64, mime: detectMime(b64) });
  },
}
