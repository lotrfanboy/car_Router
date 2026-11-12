import Link from "next/link";
export default function NotFound() {
  return (
    <section className="panel">
      <h1>Radar não encontrado</h1>
      <p>
        Ele pode ter sido excluído. Suas outras buscas continuam disponíveis.
      </p>
      <Link className="button" href="/radares">
        Meus radares
      </Link>
    </section>
  );
}
