import Link from 'next/link';

export default function Home() {
  return (
    <div>
      <h1>CareOfYou</h1>
      <p>
        <Link href="/register">Daftar &rarr;</Link>
      </p>
      <p>
        <Link href="/login">Login &rarr;</Link>
      </p>
    </div>
  );
}
