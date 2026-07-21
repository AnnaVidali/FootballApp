import { createClient } from "@/lib/supabase/server";
import Image from "next/image";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-4">
      <div className="text-center">
        <Image
          src="/soccerballimage.png"
          alt="Squad HQ"
          width={120}
          height={120}
          className="mx-auto mb-6 rounded-full"
        />
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Squad HQ
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Manage your team, schedule trainings, and build lineups.
        </p>

        {user ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Signed in as {user.email}
            </p>
            <Link
              href="/dashboard"
              className="inline-block rounded-md bg-green-600 px-6 py-3 text-white font-medium hover:bg-green-700"
            >
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-x-4">
            <Link
              href="/login"
              className="inline-block rounded-md bg-green-600 px-6 py-3 text-white font-medium hover:bg-green-700"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-block rounded-md border border-gray-300 px-6 py-3 text-gray-700 font-medium hover:bg-gray-100"
            >
              Register
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
