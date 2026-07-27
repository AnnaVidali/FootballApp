"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useLocaleContext } from "@/lib/i18n-context";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const router = useRouter();
  const supabase = createClient();
  const { t } = useLocaleContext();

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role: "player" },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    setRegistered(true);
    setLoading(false);
  }

  return (
    <div className="rounded-lg bg-white p-8 shadow-md">
      <h1 className="mb-6 text-2xl font-bold text-center text-black">{t("auth.register")}</h1>

      {error && (
        <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {registered ? (
        <div className="text-center">
          <div className="mb-4 rounded bg-green-50 p-4">
            <p className="text-lg font-medium text-green-800">{t("auth.registrationSuccess")}</p>
            <p className="text-sm text-green-700 mt-1">{t("auth.accountCreated")}</p>
          </div>
          <button
            onClick={() => router.push("/login")}
            className="w-full rounded-md bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700"
          >
            {t("auth.goToLogin")}
          </button>
        </div>
      ) : (
        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700"
            >
              {t("auth.fullName")}
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-black focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              {t("auth.email")}
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-black focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              {t("auth.password")}
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm text-black focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? t("auth.creatingAccount") : t("auth.createAccount")}
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-gray-600">
        {t("auth.hasAccount")}{" "}
        <Link href="/login" className="text-green-600 hover:underline">
          {t("auth.login")}
        </Link>
      </p>
    </div>
  );
}
