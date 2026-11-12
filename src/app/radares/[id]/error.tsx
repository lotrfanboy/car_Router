"use client";
import Link from "next/link";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <section className="panel">
      <h1>Não foi possível abrir este radar</h1>
      <p>Os dados salvos foram preservados. Tente carregar novamente.</p>
      <button className="button" onClick={reset}>
        Tentar novamente
      </button>{" "}
      <Link className="button" href="/radares">
        Meus radares
      </Link>
    </section>
  );
}
