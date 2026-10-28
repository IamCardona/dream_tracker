import Link from "next/link";
import KeyboardShortcutGuide from "./components/keyboard-shortcut-guide";

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
        <KeyboardShortcutGuide
          shortcuts={[
            { keys: ["Tab"], description: "Move through users" },
            { keys: ["↑", "↓"], description: "Choose a user" },
            { keys: ["Enter"], description: "Open selected user" },
          ]}
        />
        <h1 className="home-title" id="home-title">
          Dream <span>Tracker</span>
        </h1>
        <p className="home-description">Set a dream. Make it yours.</p>

        <nav className="button-stack" aria-label="Select a user" data-keyboard-menu>
          <Link className="choice-button choice-button--blue" href="/abigail" data-keyboard-item>
            <span>Abigail</span>
            <span className="button-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
          <Link className="choice-button choice-button--black" href="/iam" data-keyboard-item>
            <span>Iam</span>
            <span className="button-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
          <Link className="choice-button choice-button--fanny" href="/fanny" data-keyboard-item>
            <span>Fanny</span>
            <span className="button-arrow" aria-hidden="true">
              ↗
            </span>
          </Link>
        </nav>
      </section>
    </main>
  );
}
