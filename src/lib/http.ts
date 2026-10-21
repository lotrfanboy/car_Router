import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
export function apiError(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      {
        error: "Revise os campos informados.",
        fields: error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  if (error instanceof SyntaxError)
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  )
    return NextResponse.json(
      { error: "Anúncio não encontrado." },
      { status: 404 },
    );
  console.error("Vehicle operation failed", error);
  return NextResponse.json(
    { error: "Não foi possível concluir a operação. Tente novamente." },
    { status: 500 },
  );
}
// Reject browser requests originating from another site. This is not authentication.
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // Next may normalize request.url to localhost; Host retains the browser-facing authority.
  const url = new URL(request.url);
  const expectedOrigin =
    url.protocol + "//" + (request.headers.get("host") || url.host);
  if (origin && origin !== expectedOrigin)
    return NextResponse.json(
      { error: "Origem não permitida." },
      { status: 403 },
    );
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return NextResponse.json(
      { error: "Origem não permitida." },
      { status: 403 },
    );
}
