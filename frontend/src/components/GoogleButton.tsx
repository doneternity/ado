import styles from "./GoogleButton.module.scss";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export function GoogleButton() {
  return (
    <a href={`${API_BASE}/api/auth/google`} className={styles.btn}>
      <span className={styles.g}>G</span>
      <span>Continue with Google</span>
    </a>
  );
}
