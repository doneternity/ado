import { Link, useSearchParams } from "react-router-dom";
import { DiscordButton } from "../components/DiscordButton";
import { API_BASE_URL } from "../config";
import styles from "./Login.module.scss";

const CODE_SNIPPET = `import OpenAI from "openai";

const ado = new OpenAI({
  apiKey:  "ado-your-key",
  baseURL: "${API_BASE_URL}",
});

const msg = await ado.chat.completions.create({
  model:    "codebuddy/gemini-3.1-pro",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(msg.choices[0].message.content);`;

export function Login() {
  const [searchParams] = useSearchParams();
  const planFull = searchParams.get("plan_full") === "1";

  return (
    <div className={styles.page}>
      <div className={styles.formCol}>
        <h1 className={styles.headline}>welcome back.</h1>

        {planFull ? (
          <div className={styles.slotFullNotice}>
            <p className={styles.slotFullTitle}>Plan is currently full</p>
            <p className={styles.slotFullBody}>
              All free-tier slots are taken. Join our Discord to get notified when a spot opens up.
            </p>
            <a
              href={import.meta.env.VITE_DISCORD_INVITE_URL || "https://discord.com/invite/adoai"}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.slotFullLink}
            >
              Join Discord →
            </a>
          </div>
        ) : (
          <DiscordButton />
        )}

        <p className={styles.legal}>
          By continuing, you agree to our{" "}
          <Link to="/terms">Terms</Link> and{" "}
          <Link to="/privacy">Privacy Policy</Link>.
        </p>
        <p className={styles.legal}>
          Don&apos;t have an account? <Link to="/sign-up">Sign up</Link>
        </p>
      </div>

      <div className={styles.visualCol}>
        <div className={styles.codeCard}>
          <div className={styles.codeCardTop}>
            <div className={styles.codeCardDots}>
              <span className={styles.dot1} />
              <span className={styles.dot2} />
              <span className={styles.dot3} />
            </div>
            <span className={styles.codeCardLang}>javascript</span>
          </div>
          <pre className={styles.codeCardBody}><code>{CODE_SNIPPET}</code></pre>
          <div className={styles.codeCardFooter}>
            {["Anthropic", "Google", "DeepSeek", "+ more"].map((p) => (
              <span key={p} className={styles.providerChip}>{p}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
