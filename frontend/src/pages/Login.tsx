import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AuthForm } from "../components/AuthForm";
import { GoogleButton } from "../components/GoogleButton";
import { useLogin, useSignup } from "../api/mutations";
import styles from "./Login.module.scss";

const PROXY_BASE = import.meta.env.VITE_PROXY_BASE_URL ?? "https://adoai.space/v1";

const CODE_SNIPPET = `import OpenAI from "openai";

const ado = new OpenAI({
  apiKey:  "ado-your-key",
  baseURL: "${PROXY_BASE}",
});

const msg = await ado.chat.completions.create({
  model:    "[kmo]claude-opus-4.7",
  messages: [{ role: "user", content: "Hello!" }],
});

console.log(msg.choices[0].message.content);`;

export function Login() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const navigate = useNavigate();
  const login = useLogin();
  const signup = useSignup();

  return (
    <div className={styles.page}>
      <div className={styles.formCol}>
        <span className={styles.eyebrow}>
          <span className={styles.eyebrowDash} />
          ADO // v1
        </span>
        <h1 className={styles.headline}>
          {mode === "login" ? "welcome\nback." : "get your\nkey."}
        </h1>

        <div className={styles.tabs}>
          <button
            className={mode === "login" ? styles.tabActive : styles.tab}
            onClick={() => setMode("login")}
          >
            sign in
          </button>
          <button
            className={mode === "signup" ? styles.tabActive : styles.tab}
            onClick={() => setMode("signup")}
          >
            sign up
          </button>
        </div>

        <AuthForm
          mode={mode}
          isPending={login.isPending || signup.isPending}
          onSubmit={async (vars) => {
            if (mode === "login") {
              await login.mutateAsync(vars);
              navigate("/dashboard");
            } else {
              await signup.mutateAsync(vars);
              navigate("/dashboard");
            }
          }}
        />

        <div className={styles.divider}>or</div>
        <GoogleButton />
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
