import { redirect } from "next/navigation"

interface NewProjectPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function NewProjectPage({
  searchParams,
}: NewProjectPageProps) {
  const params = new URLSearchParams()
  const currentParams = await searchParams

  for (const [key, value] of Object.entries(currentParams)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item)
    } else if (typeof value === "string") {
      params.set(key, value)
    }
  }

  const query = params.toString()
  redirect(query ? `/projects/new/wizard?${query}` : "/projects/new/wizard")
}
