import { NextResponse } from "next/server";
import { checkOrigin } from "@/lib/http";
import { maxManualImageBytes, storeManualImage } from "@/lib/manual-images";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const rejected = checkOrigin(request);
  if (rejected) return rejected;
  if (!process.env.DATABASE_URL?.startsWith("file:"))
    return NextResponse.json(
      { error: "Upload de arquivo disponível apenas no ambiente local." },
      { status: 409 },
    );
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    return NextResponse.json(
      { error: "Selecione uma imagem." },
      { status: 400 },
    );
  const limit = maxManualImageBytes + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    return NextResponse.json(
      { error: "A imagem deve ter até 8 MB." },
      { status: 413 },
    );
  const reader = request.body?.getReader();
  if (!reader)
    return NextResponse.json({ error: "Imagem ausente." }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        return NextResponse.json(
          { error: "A imagem deve ter até 8 MB." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const body = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.length;
    }
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    const file = form.get("file");
    if (
      !(file instanceof File) ||
      file.size > maxManualImageBytes ||
      file.size === 0
    )
      return NextResponse.json(
        { error: "Selecione uma imagem de até 8 MB." },
        { status: 400 },
      );
    return NextResponse.json(
      await storeManualImage(
        new Uint8Array(await file.arrayBuffer()),
        file.type,
      ),
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Não foi possível salvar a imagem. Use JPEG, PNG ou WebP de até 8 MB.",
      },
      { status: 400 },
    );
  }
}
