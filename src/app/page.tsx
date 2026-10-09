import { redirect } from "next/navigation";

export default async function Home({ searchParams }: Readonly<{
  searchParams: Promise<{ search?: string | string[] }>;
}>) {
  const { search } = await searchParams;
  redirect(typeof search === "string" && search ? `/missions?search=${encodeURIComponent(search)}` : "/stations");
}
