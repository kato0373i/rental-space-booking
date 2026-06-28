import { describe, expect, it } from "vitest";

import { CustomerId } from "../../../shared/domain/Id.js";
import type {
  AuthenticatedUser,
  AuthClientError,
  CognitoAuthClient,
  SignUpAttributes,
} from "./AuthCognitoClient.js";
import { CognitoAuthGateway } from "./CognitoAuthGateway.js";
import { err, ok, type Result } from "../../../shared/domain/Result.js";

/** クライアント層の結果を固定できる fake（基盤エラー→ドメインエラーの写像を単体で検証する）。 */
class FakeCognitoClient implements CognitoAuthClient {
  constructor(
    private readonly signUpResult: Result<void, AuthClientError>,
    private readonly signInResult: Result<AuthenticatedUser, AuthClientError>,
  ) {}
  lastSignUp?: { loginId: string; secret: string; attrs: SignUpAttributes };

  async signUp(
    loginId: string,
    secret: string,
    attrs: SignUpAttributes,
  ): Promise<Result<void, AuthClientError>> {
    this.lastSignUp = { loginId, secret, attrs };
    return this.signUpResult;
  }

  async signIn(): Promise<Result<AuthenticatedUser, AuthClientError>> {
    return this.signInResult;
  }
}

const REG = {
  loginId: "taro",
  secret: "password",
  email: "taro@example.com",
  customerId: CustomerId.of("cust-1"),
  role: "Member",
} as const;

describe("CognitoAuthGateway（基盤エラーの写像, ADR-AB07）", () => {
  it("sign-up に role/customerId/email 属性を渡す", async () => {
    const client = new FakeCognitoClient(ok(undefined), err({ kind: "Unknown", message: "" }));
    const gw = new CognitoAuthGateway(client);
    await gw.register({ ...REG, role: "Admin" });
    expect(client.lastSignUp?.attrs).toEqual({
      email: "taro@example.com",
      role: "Admin",
      customerId: "cust-1",
    });
  });

  it("ログインID重複は ValidationError", async () => {
    const gw = new CognitoAuthGateway(
      new FakeCognitoClient(
        err({ kind: "AlreadyExists", message: "exists" }),
        err({ kind: "Unknown", message: "" }),
      ),
    );
    const r = await gw.register(REG);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("ValidationError");
  });

  it("パスワードポリシー違反は ValidationError", async () => {
    const gw = new CognitoAuthGateway(
      new FakeCognitoClient(
        err({ kind: "InvalidPassword", message: "weak" }),
        err({ kind: "Unknown", message: "" }),
      ),
    );
    const r = await gw.register(REG);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("ValidationError");
  });

  it("sign-in 成功で属性からロール付き Actor を復元する", async () => {
    const gw = new CognitoAuthGateway(
      new FakeCognitoClient(ok(undefined), ok({ role: "Admin", customerId: "cust-9" })),
    );
    const r = await gw.authenticate({ loginId: "admin", secret: "x" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.role).toBe("Admin");
    expect(r.value.customerId).toBe(CustomerId.of("cust-9"));
  });

  it("資格情報不正は Forbidden（存在秘匿）", async () => {
    const gw = new CognitoAuthGateway(
      new FakeCognitoClient(
        ok(undefined),
        err({ kind: "NotAuthorized", message: "bad" }),
      ),
    );
    const r = await gw.authenticate({ loginId: "taro", secret: "wrong" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("ForbiddenError");
  });
});
