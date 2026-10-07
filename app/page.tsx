import Link from "next/link";

export default function Home() {
  return (
    <main className="home-shell">
      <div className="ambient ambient--blue" aria-hidden="true" />
      <div className="ambient ambient--peach" aria-hidden="true" />
      <div className="sparkle sparkle--one" aria-hidden="true">
        ✦
      </div>
      <div className="sparkle sparkle--two" aria-hidden="true">
        ✧
      </div>

      <section className="home-content" aria-labelledby="home-title">
        <h1 className="home-title" id="home-title">
          Dream <span>Tracker</span>
        </h1>
        <p className="home-description">Set a dream. Make it yours.</p>

        <div className="button-stack">
          <Link className="choice-button choice-button--blue" href="/abigail">
            <span>Abigail</span>
            <span className="button-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
          <Link className="choice-button choice-button--black" href="/iam">
            <span>Iam</span>
            <span className="button-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
