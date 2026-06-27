import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../app/AppContext.js";
import { errorMessage } from "../app/errorMessage.js";

/** モック認証によるログイン・会員登録（FR-F08）。 */
export function LoginPage() {
  const { services, setSession } = useApp();
  const navigate = useNavigate();

  const [loginId, setLoginId] = useState("taro");
  const [secret, setSecret] = useState("password");
  const [loginError, setLoginError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [regLoginId, setRegLoginId] = useState("");
  const [regSecret, setRegSecret] = useState("");
  const [regError, setRegError] = useState<string | null>(null);

  const doLogin = () => {
    setLoginError(null);
    const r = services.login(loginId.trim(), secret);
    if (r.ok) {
      setSession(r.value);
      navigate(r.value.role === "Admin" ? "/admin" : "/my");
    } else {
      setLoginError(errorMessage(r.error));
    }
  };

  const doRegister = () => {
    setRegError(null);
    const reg = services.registerMember({
      name,
      email,
      phone,
      loginId: regLoginId,
      secret: regSecret,
    });
    if (!reg.ok) {
      setRegError(errorMessage(reg.error));
      return;
    }
    // 登録後そのままログイン。
    const login = services.login(regLoginId.trim(), regSecret);
    if (login.ok) {
      setSession(login.value);
      navigate("/my");
    } else {
      setRegError(errorMessage(login.error));
    }
  };

  return (
    <section>
      <h1>ログイン</h1>
      <div className="card">
        <p className="muted">デモ用: 会員 taro / password ・ 管理者 admin / admin123</p>
        <label>ログインID</label>
        <input value={loginId} onChange={(e) => setLoginId(e.target.value)} />
        <label>パスワード</label>
        <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} />
        <div style={{ marginTop: "0.75rem" }}>
          <button className="primary" onClick={doLogin}>
            ログイン
          </button>
        </div>
        {loginError && <div className="banner error">{loginError}</div>}
      </div>

      <h2>会員登録</h2>
      <div className="card">
        <label>氏名</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
        <label>メールアドレス</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} />
        <label>電話番号</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        <label>ログインID</label>
        <input value={regLoginId} onChange={(e) => setRegLoginId(e.target.value)} />
        <label>パスワード</label>
        <input type="password" value={regSecret} onChange={(e) => setRegSecret(e.target.value)} />
        <div style={{ marginTop: "0.75rem" }}>
          <button onClick={doRegister}>登録してログイン</button>
        </div>
        {regError && <div className="banner error">{regError}</div>}
      </div>
    </section>
  );
}
