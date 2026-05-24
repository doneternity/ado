import { Link } from "react-router-dom";
import { DiscordButton } from "../components/DiscordButton";
import { API_BASE_URL } from "../config";
import styles from "./Login.module.scss";

const CODE_SNIPPET = `import OpenAI from "openai";

const ado = new OpenAI({
  apiKey:  "ado-your-key",
  baseURL: "${API_BASE_URL}",
});

const msg = await ado.chat.completions.create({
  model:    "gemini-3.1-pro-preview",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(msg.choices[0].message.content);`;

export function Login() {
  return (
    <div className={styles.page}>
      <div className={styles.formCol}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDash} />
          ADO // v1
        </span>
        <h1 className={styles.headline}>welcome.</h1>

        <DiscordButton />

        <p className={styles.legal}>
          By continuing, you agree to our{" "}
          <Link to="/terms">Terms</Link> and{" "}
          <Link to="/privacy">Privacy Policy</Link>.
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
