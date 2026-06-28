import { randomUUID } from "node:crypto";
import { Scope } from "@aws-blocks/core";
import { beforeEach, describe, expect, it } from "vitest";

import { Login } from "./application/Login.js";
import { RegisterMember } from "./application/RegisterMember.js";
import type { AuthGateway } from "./application/ports/AuthGateway.js";
import { InMemoryCustomerRepository } from "./infrastructure/InMemoryCustomerRepository.js";
import { InMemoryAuthGateway } from "./infrastructure/InMemoryAuthGateway.js";
import { CognitoAuthGateway } from "./infrastructure/CognitoAuthGateway.js";
import { AuthCognitoClient } from "./infrastructure/AuthCognitoClient.js";

/**
 * 認証（会員登録＋ログイン）の契約テスト（ADR-AB05/AB07）。
 * インメモリ認証と Authentication Block(Cognito) 認証の両実装に同一仕様を流し、同値性を担保する。
 * Cognito 実装はローカルでは Block のモック（実 AWS 不要）として動作する。
 */

type Harness = {
  readonly register: RegisterMember;
  readonly login: Login;
};

const harnesses: ReadonlyArray<{ name: string; make: () => Harness }> = [
  {
    name: "InMemory",
    make: () => {
      const customers = new InMemoryCustomerRepository();
      const gateway: AuthGateway = new InMemoryAuthGateway(customers);
      return { register: new RegisterMember(customers, gateway), login: new Login(gateway) };
    },
  },
  {
    name: "Cognito(mock)",
    make: () => {
      // プロフィールはインメモリ共存（ADR-AB07）、資格情報・ロールは Cognito が所有。
      // 一意な Scope ID で毎回新しいローカル User Pool を割り当て、テスト間を隔離する。
      const customers = new InMemoryCustomerRepository();
      const gateway: AuthGateway = new CognitoAuthGateway(
        new AuthCognitoClient(new Scope(`test-auth-${randomUUID()}`)),
      );
      return { register: new RegisterMember(customers, gateway), login: new Login(gateway) };
    },
  },
];

const TARO = {
  name: "山田太郎",
  email: "taro@example.com",
  phone: "090-0000-0000",
  loginId: "taro",
  secret: "password",
} as const;

describe.each(harnesses)("認証契約: $name", ({ make }) => {
  let h: Harness;
  beforeEach(() => {
    h = make();
  });

  it("会員登録して登録した資格情報でログインできる（Member ロール）", async () => {
    const reg = await h.register.execute(TARO);
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;

    const login = await h.login.execute({ loginId: TARO.loginId, secret: TARO.secret });
    expect(login.ok).toBe(true);
    if (!login.ok) return;
    expect(login.value.role).toBe("Member");
    // プロフィールと認証基盤は customerId で連結する（ADR-AB07）。
    expect(login.value.customerId).toBe(reg.value.customerId);
  });

  it("role: Admin で登録すると Admin ロールでログインできる（FR-042）", async () => {
    const reg = await h.register.execute({
      ...TARO,
      email: "admin@example.com",
      loginId: "admin",
      secret: "admin123",
      role: "Admin",
    });
    expect(reg.ok).toBe(true);

    const login = await h.login.execute({ loginId: "admin", secret: "admin123" });
    expect(login.ok && login.value.role).toBe("Admin");
  });

  it("誤ったシークレットは Forbidden（存在を秘匿）", async () => {
    await h.register.execute(TARO);
    const login = await h.login.execute({ loginId: TARO.loginId, secret: "wrong-secret" });
    expect(login.ok).toBe(false);
  });

  it("未登録のログインIDは Forbidden", async () => {
    const login = await h.login.execute({ loginId: "ghost", secret: "whatever" });
    expect(login.ok).toBe(false);
  });

  it("同一ログインIDの二重登録は ValidationError", async () => {
    const first = await h.register.execute(TARO);
    expect(first.ok).toBe(true);

    const second = await h.register.execute({ ...TARO, email: "taro2@example.com" });
    expect(second.ok).toBe(false);
  });

  it("同一メールアドレスの二重登録は ValidationError", async () => {
    const first = await h.register.execute(TARO);
    expect(first.ok).toBe(true);

    const second = await h.register.execute({ ...TARO, loginId: "taro2" });
    expect(second.ok).toBe(false);
  });
});
