import { readManualImage } from "@/lib/manual-images";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const image = await readManualImage((await params).id);
  return image
    ? new Response(new Uint8Array(image.bytes), {
        headers: {
          "Content-Type": image.contentType,
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Cache-Control": "private, max-age=86400",
        },
      })
    : new Response("Imagem não encontrada.", { status: 404 });
}
