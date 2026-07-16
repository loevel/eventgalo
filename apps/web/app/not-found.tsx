import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container narrow">
      <div className="hero">
        <h1>Page introuvable</h1>
        <p>Cette page n&apos;existe pas ou l&apos;événement n&apos;est plus publié.</p>
      </div>
      <p style={{ textAlign: "center" }}>
        <Link href="/" className="btn btn-accent">
          Retour à l&apos;accueil
        </Link>
      </p>
    </main>
  );
}
