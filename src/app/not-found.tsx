import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <h1>Página não encontrada</h1>
      <p>O endereço que você acessou não existe.</p>
      <Link href="/veiculos" className="button primary">
        Ir para o catálogo
      </Link>
    </div>
  );
}
